# Calls the Anthropic Messages API to turn a GithubSourceContext::Result into
# a structured draft, validates the result against TemplateSections and the
# context's own labels, and retries once on invalid or low-quality output
# before giving up on a section (or, for a hard schema violation, the draft).
#
# Never logs or raises with the source text or API key — only short, fixed
# messages reach DraftRequest#error, logs, or Sentry (see DraftFromSourceJob).
class DraftWriter
  class Failed < StandardError; end

  PROMPT_VERSION = 'v3'
  PROMPT_PATH = Rails.root.join('app/prompts/draft_v3.md')
  TIMEOUT = 60
  DRAFT_MAX_TOKENS = 8192
  PICK_MAX_TOKENS = 64

  # Soft-quality limits: a violation gets folded into the one retry, and if
  # still present after that, the section is flagged (not failed) — see
  # #flag_quality!.
  WORD_LIMIT = 120
  LIST_ITEM_LIMIT = 5
  VOICE_PATTERN = /\bthe (?:author|user|engineer)\b/i

  Result = Struct.new(:template, :title, :sections, :model, :prompt_version, keyword_init: true)

  def self.model_name
    ENV['ANTHROPIC_MODEL'].presence || 'claude-sonnet-5'
  end

  # Checked by DraftsController before enqueuing a job — a blank key fails
  # fast with no job and no cap usage, rather than letting the job fail later.
  def self.configured?
    ENV['ANTHROPIC_API_KEY'].present?
  end

  def initialize(context:, template: nil)
    @context = context
    @template = template
  end

  def call
    type = @template.presence || pick_template
    output = request_and_validate(type)
    Result.new(
      template: type, title: output['title'].to_s, sections: output['sections'],
      model: self.class.model_name, prompt_version: PROMPT_VERSION
    )
  rescue Anthropic::Errors::APIError, Timeout::Error
    raise Failed, 'Drafting failed.'
  end

  private

  def request_and_validate(type)
    output = request_draft(type)
    errors = validation_errors(output, type) + outcome_gate_violations(output, type) + quality_messages(output, type)
    return finalize(output, type) if errors.empty?

    output = request_draft(type, previous_errors: errors)
    hard_errors = validation_errors(output, type)
    raise Failed, 'Drafting failed.' if hard_errors.any?

    finalize(output, type)
  end

  def finalize(output, type)
    output = enforce_outcome_gate!(output, type)
    flag_quality!(output, type)
    output
  end

  # The source issue's state may rule out claiming a fix at all for any
  # outcome section (see GithubSourceContext::Result#fix_allowed? and
  # TemplateSections' `outcome` flag) — enforced here as a backstop regardless
  # of what the prompt told the model. A violation on the first attempt is
  # folded into the retry's validation errors; one still present after the
  # retry is blanked rather than failing the whole draft, since every other
  # section may still be good.
  def outcome_gate_violations(output, type)
    return [] if @context.fix_allowed?

    TemplateSections.outcome_keys_for(type).filter_map do |key|
      text = output.dig('sections', key, 'text').to_s
      next if text.blank?

      "section #{key} describes a fix the source issue doesn't support (#{@context.fix_missing_reason})"
    end
  end

  def enforce_outcome_gate!(output, type)
    return output if @context.fix_allowed?

    TemplateSections.outcome_keys_for(type).each do |key|
      text = output.dig('sections', key, 'text').to_s
      next if text.blank?

      output['sections'][key] = { 'text' => '', 'sources' => [], 'missing' => @context.fix_missing_reason }
    end
    output
  end

  # Messages fed back into the one retry when a section is too long (more
  # than ~120 words, or more than 5 list items) or slips into third person
  # ("the author"/"the user"/"the engineer" instead of "I").
  def quality_messages(output, type)
    sections_by_key = TemplateSections.for(type).index_by(&:key)
    (output['sections'] || {}).filter_map do |key, section|
      section_def = sections_by_key[key]
      next unless section_def

      text = section['text'].to_s
      next if text.blank?

      msgs = []
      msgs << "section #{key} is too long — keep it short (a few sentences, or at most 5 list items)" if too_long?(section_def, text)
      msgs << "section #{key} writes about \"the author/user/engineer\" instead of first person (\"I\")" if VOICE_PATTERN.match?(text)
      msgs.join('; ').presence
    end
  end

  # A quality issue still present after the retry doesn't fail the draft —
  # it's flagged on the section (DraftFromSourceJob carries this into
  # Writeup#draft_sections_meta) so the editor can show "Consider shortening"
  # / "Check the wording".
  def flag_quality!(output, type)
    sections_by_key = TemplateSections.for(type).index_by(&:key)
    (output['sections'] || {}).each do |key, section|
      section_def = sections_by_key[key]
      next unless section_def

      text = section['text'].to_s
      next if text.blank?

      section['long'] = true if too_long?(section_def, text)
      section['voice'] = true if VOICE_PATTERN.match?(text)
    end
    output
  end

  def too_long?(section_def, text)
    return line_items(text).size > LIST_ITEM_LIMIT if section_def.kind == :lines

    text.split(/\s+/).size > WORD_LIMIT
  end

  def line_items(text)
    text.to_s.each_line.map(&:strip).reject(&:empty?)
  end

  def pick_template
    response = client.messages.create(
      model: self.class.model_name, max_tokens: PICK_MAX_TOKENS,
      system_: [{ type: 'text', text: prompt(nil) }],
      tool_choice: { type: 'tool', name: pick_template_tool[:name] },
      tools: [pick_template_tool],
      messages: [{ role: 'user', content: @context.text }],
      request_options: { timeout: TIMEOUT }
    )
    tool_input(response).fetch('template')
  end

  def request_draft(type, previous_errors: nil)
    tool = draft_tool(type)
    content = @context.text
    if previous_errors
      content += "\n\n---\nYour previous answer was invalid: #{previous_errors.join('; ')}. " \
                 'Try again, following the schema exactly — every source label must appear verbatim in the input above.'
    end

    response = client.messages.create(
      model: self.class.model_name, max_tokens: DRAFT_MAX_TOKENS,
      system_: [{ type: 'text', text: prompt(type) }],
      tool_choice: { type: 'tool', name: tool[:name] },
      tools: [tool],
      messages: [{ role: 'user', content: content }],
      request_options: { timeout: TIMEOUT }
    )
    tool_input(response)
  end

  def tool_input(response)
    block = response.content.find { |b| b.type == :tool_use }
    raise Failed, 'Drafting failed.' unless block

    # The SDK returns tool input with symbol keys; our schema and
    # TemplateSections both key by string.
    block.input.deep_stringify_keys
  end

  def validation_errors(output, type)
    known_keys = TemplateSections.keys_for(type)
    sections = output['sections'] || {}
    errors = []

    unknown_keys = sections.keys - known_keys
    errors << "unknown section keys: #{unknown_keys.join(', ')}" if unknown_keys.any?

    sections.each do |key, section|
      next unless known_keys.include?(key)

      text = section['text'].to_s
      sources = Array(section['sources'])
      errors << "section #{key} has text but no sources" if text.strip.present? && sources.empty?

      unknown_sources = sources - @context.labels
      errors << "section #{key} cites unknown sources: #{unknown_sources.join(', ')}" if unknown_sources.any?
    end

    errors
  end

  def client
    @client ||= Anthropic::Client.new(api_key: ENV['ANTHROPIC_API_KEY'].presence)
  end

  # type nil (picking a template — no section guide exists yet) renders a
  # placeholder instead of {{TEMPLATE_NAME}}/{{SECTION_GUIDE}}.
  def prompt(type)
    text = raw_prompt
    if type
      text.sub('{{TEMPLATE_NAME}}', TemplateSections.template_name(type))
          .sub('{{SECTION_GUIDE}}', TemplateSections.section_guide(type))
    else
      text.sub('{{TEMPLATE_NAME}}', '(not yet chosen)')
          .sub('{{SECTION_GUIDE}}', '(pick a template first — sections are filled in the next step)')
    end
  end

  def raw_prompt
    @raw_prompt ||= File.read(PROMPT_PATH)
  end

  def pick_template_tool
    {
      name: 'pick_template',
      description: 'Pick which Ledger write-up template best fits this source.',
      input_schema: {
        type: 'object',
        properties: { template: { type: 'string', enum: Writeup::TYPES } },
        required: ['template'],
        additionalProperties: false
      },
      strict: true
    }
  end

  def draft_tool(type)
    sections = TemplateSections.for(type)
    {
      name: 'submit_draft',
      description: "Fill in a #{type} write-up from the given source.",
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: "A short, specific title for this #{type} write-up." },
          sections: {
            type: 'object',
            properties: sections.to_h { |s| [s.key, section_schema(s)] },
            required: sections.map(&:key),
            additionalProperties: false
          }
        },
        required: %w[title sections],
        additionalProperties: false
      },
      strict: true
    }
  end

  def section_schema(section)
    {
      type: 'object',
      properties: {
        text: { type: 'string', description: "#{section.label}: #{section.purpose} Empty string if the input doesn't support this section." },
        sources: { type: 'array', items: { type: 'string' }, description: 'Exact labels from the input this text draws from. Empty array if text is empty.' },
        missing: { type: 'string', description: "One short sentence on what the input doesn't say, when text is empty. Empty string otherwise." }
      },
      required: %w[text sources missing],
      additionalProperties: false
    }
  end
end
