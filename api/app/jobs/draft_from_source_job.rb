# Builds the full source context and calls DraftWriter for one DraftRequest.
# The context text exists only in this method's local variables — it is
# never assigned to an instance variable, never passed as a job argument
# (Solid Queue persists those to Postgres), and never logged.
#
# A DraftRequest enters this job only once its writeup and evidence already
# exist (created synchronously in DraftsController) — whatever happens here,
# that writeup is kept: on failure the user continues from it as a normal
# (now empty) draft rather than getting a duplicate on retry. The writeup can
# still disappear out from under a running job if its author deletes the
# draft (Api::V1::WriteupsController#destroy nullifies the DraftRequest's
# writeup_id rather than blocking on an in-flight job) — handled below rather
# than crashing.
class DraftFromSourceJob < ApplicationJob
  FAILURE_MESSAGE = 'Drafting failed. Start from the template instead.'.freeze

  def perform(draft_request_id)
    draft_request = DraftRequest.find(draft_request_id)
    return unless draft_request.status == 'drafting'
    return if draft_request.mark_failed_if_stale!

    writeup = draft_request.writeup
    if writeup.nil?
      draft_request.update!(status: 'failed', error: FAILURE_MESSAGE)
      return
    end

    context = GithubSourceContext.new(writeup, draft_request.source_url, draft_request.user).call

    if context.blank?
      draft_request.update!(status: 'ready', note: DraftRequest::EMPTY_SOURCE_NOTE, counts_toward_cap: false)
      return
    end

    result = DraftWriter.new(context: context, template: draft_request.template).call
    apply_result!(writeup, draft_request, result)
    draft_request.update!(status: 'ready', counts_toward_cap: true)
  rescue DraftWriter::Failed, GithubEvidenceVerifier::TemporaryFailure => e
    draft_request.update!(status: 'failed', error: e.is_a?(DraftWriter::Failed) ? FAILURE_MESSAGE : e.message)
  rescue StandardError => e
    draft_request.update!(status: 'failed', error: FAILURE_MESSAGE)
    Sentry.capture_exception(e) if defined?(Sentry) && ENV['SENTRY_DSN'].present?
  end

  private

  def apply_result!(writeup, draft_request, result)
    writeup.update!(
      type: result.template,
      status: result.template == 'design' ? 'proposed' : 'draft',
      title: result.title,
      fields: writeup.fields.merge(fields_from(result)),
      draft_source_url: draft_request.source_url,
      draft_model: result.model,
      draft_prompt_version: result.prompt_version,
      drafted_at: Time.current,
      drafted_from_private: draft_request.drafted_from_private,
      draft_sections_meta: sections_meta_from(result)
    )
  end

  def fields_from(result)
    TemplateSections.for(result.template).each_with_object({}) do |section, fields|
      text = result.sections.dig(section.key, 'text').to_s
      fields[section.key] = section.kind == :lines ? to_lines(text) : text
    end
  end

  def sections_meta_from(result)
    result.sections.each_with_object({}) do |(key, section), meta|
      meta[key] = {
        'sources' => Array(section['sources']), 'missing' => section['missing'].to_s.presence,
        'long' => section['long'] || nil, 'voice' => section['voice'] || nil
      }.compact
    end
  end

  # Mirrors toLines in web/src/lib/writeups.ts: one item per non-empty line,
  # leading bullet markers stripped.
  def to_lines(text)
    text.to_s.split("\n").map { |line| line.sub(/\A\s*[-*•]\s*/, '').strip }.reject(&:empty?)
  end
end
