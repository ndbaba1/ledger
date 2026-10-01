# Mirrors TYPE_INFO in web/src/lib/writeups.ts — the full set of sections per
# write-up type, not just the required ones, plus each field's `help` text as
# `purpose` here. Used by DraftWriter to build the LLM's structured-output
# schema and prompt (see app/prompts/draft_v3.md's {{SECTION_GUIDE}}) and to
# turn its answer back into Writeup#fields. The required subset is
# cross-checked against Writeup::REQUIRED_FIELDS (see its comment) by
# spec/services/template_sections_spec.rb, so this and that mirror of
# writeups.ts can't quietly drift apart from each other.
module TemplateSections
  # kind: :short/:text hold a single string in Writeup#fields; :lines holds a
  # newline-split array (see Writeup::EMPTY_FIELDS and DraftFromSourceJob).
  # outcome: true marks the section that describes a fix/result/rollout/
  # consequences — DraftWriter gates these on the source issue's state
  # (see GithubSourceContext::Result#fix_allowed?) instead of hard-coding a
  # section key.
  Section = Struct.new(:key, :label, :purpose, :kind, :required, :outcome, keyword_init: true)

  def self.problem_sections(ruled_out_purpose)
    [
      Section.new(key: 'context', label: 'Environment', purpose: 'Versions, scale and the service or job involved. Shown under the title.', kind: :short, required: false, outcome: false),
      Section.new(key: 'symptom', label: 'Problem', purpose: 'What was wrong, and how it showed up.', kind: :text, required: true, outcome: false),
      Section.new(key: 'ruledOut', label: 'Dead ends', purpose: ruled_out_purpose, kind: :lines, required: false, outcome: false),
      Section.new(key: 'rootCause', label: 'Root cause', purpose: 'What was actually going on, and how you proved it.', kind: :text, required: true, outcome: false),
      Section.new(key: 'fix', label: 'Solution', purpose: 'What you changed, and anything you added so it can’t recur.', kind: :text, required: true, outcome: true),
      Section.new(key: 'lesson', label: 'Lesson', purpose: 'The one thing you’d tell the next engineer. It becomes the highlighted takeaway.', kind: :text, required: false, outcome: false)
    ].freeze
  end

  SECTIONS = {
    'incident' => problem_sections('One per line: what you checked that turned out not to be the cause.'),
    'investigation' => problem_sections('One per line: what you tried or suspected first.'),
    'decision' => [
      Section.new(key: 'context', label: 'Environment', purpose: 'Versions, scale and the service or job involved. Shown under the title.', kind: :short, required: false, outcome: false),
      Section.new(key: 'symptom', label: 'Context', purpose: 'What prompted the decision.', kind: :text, required: true, outcome: false),
      Section.new(key: 'rootCause', label: 'Decision', purpose: 'What you decided, in a sentence or two. Shown up top.', kind: :text, required: true, outcome: false),
      Section.new(key: 'ruledOut', label: 'Options rejected', purpose: 'Each option, and why you didn’t pick it.', kind: :lines, required: true, outcome: false),
      Section.new(key: 'fix', label: 'Consequences', purpose: 'What changes because of this, good and bad.', kind: :text, required: true, outcome: true),
      Section.new(key: 'lesson', label: 'Lesson', purpose: 'The one thing you’d tell the next engineer. It becomes the highlighted takeaway.', kind: :text, required: false, outcome: false)
    ].freeze,
    'design' => [
      Section.new(key: 'context', label: 'Environment', purpose: 'Versions, scale and the service or job involved. Shown under the title.', kind: :short, required: false, outcome: false),
      Section.new(key: 'symptom', label: 'Goal', purpose: 'What it needs to do, and for whom.', kind: :text, required: true, outcome: false),
      Section.new(key: 'constraints', label: 'Constraints', purpose: 'Scale, latency, cost, deadlines.', kind: :lines, required: false, outcome: false),
      Section.new(key: 'rootCause', label: 'Design', purpose: 'How it works.', kind: :text, required: true, outcome: false),
      Section.new(key: 'flow', label: 'Architecture', purpose: 'The main path through the system, in order. It becomes a diagram.', kind: :lines, required: false, outcome: false),
      Section.new(key: 'ruledOut', label: 'Alternatives', purpose: 'Each option you considered, and why not.', kind: :lines, required: false, outcome: false),
      Section.new(key: 'fix', label: 'Rollout', purpose: 'How it shipped: flags, migrations, backfills. Needed before publishing.', kind: :text, required: false, outcome: true),
      Section.new(key: 'lesson', label: 'Lesson', purpose: 'The one thing you’d tell the next engineer. It becomes the highlighted takeaway.', kind: :text, required: false, outcome: false)
    ].freeze
  }.freeze

  def self.for(type)
    SECTIONS.fetch(type)
  end

  def self.required_keys_for(type)
    self.for(type).select(&:required).map(&:key)
  end

  def self.keys_for(type)
    self.for(type).map(&:key)
  end

  def self.outcome_keys_for(type)
    self.for(type).select(&:outcome).map(&:key)
  end

  # "Incident" / "Investigation" / "Decision" / "Design" — the {{TEMPLATE_NAME}}
  # placeholder in app/prompts/draft_v3.md.
  def self.template_name(type)
    type.to_s.capitalize
  end

  # The {{SECTION_GUIDE}} placeholder: one "- key[ [outcome]][ (list)]: purpose"
  # line per section, in order.
  def self.section_guide(type)
    self.for(type).map do |s|
      modifiers = +''
      modifiers << ' [outcome]' if s.outcome
      modifiers << ' (list)' if s.kind == :lines
      "- #{s.key}#{modifiers}: #{s.purpose}"
    end.join("\n")
  end
end
