# Mirrors TYPE_INFO in web/src/lib/writeups.ts — the full set of sections per
# write-up type, not just the required ones. Used by DraftWriter to build the
# LLM's structured-output schema and to turn its answer back into
# Writeup#fields. The required subset is cross-checked against
# Writeup::REQUIRED_FIELDS (see its comment) by
# spec/services/template_sections_spec.rb, so this and that mirror of
# writeups.ts can't quietly drift apart from each other.
module TemplateSections
  # kind: :short/:text hold a single string in Writeup#fields; :lines holds a
  # newline-split array (see Writeup::EMPTY_FIELDS and DraftFromSourceJob).
  Section = Struct.new(:key, :label, :kind, :required, keyword_init: true)

  PROBLEM_SECTIONS = [
    Section.new(key: 'context', label: 'Environment', kind: :short, required: false),
    Section.new(key: 'symptom', label: 'Problem', kind: :text, required: true),
    Section.new(key: 'ruledOut', label: 'Dead ends', kind: :lines, required: false),
    Section.new(key: 'rootCause', label: 'Root cause', kind: :text, required: true),
    Section.new(key: 'fix', label: 'Solution', kind: :text, required: true),
    Section.new(key: 'lesson', label: 'Lesson', kind: :text, required: false)
  ].freeze

  SECTIONS = {
    'incident' => PROBLEM_SECTIONS,
    'investigation' => PROBLEM_SECTIONS,
    'decision' => [
      Section.new(key: 'context', label: 'Environment', kind: :short, required: false),
      Section.new(key: 'symptom', label: 'Context', kind: :text, required: true),
      Section.new(key: 'rootCause', label: 'Decision', kind: :text, required: true),
      Section.new(key: 'ruledOut', label: 'Options rejected', kind: :lines, required: true),
      Section.new(key: 'fix', label: 'Consequences', kind: :text, required: true),
      Section.new(key: 'lesson', label: 'Lesson', kind: :text, required: false)
    ].freeze,
    'design' => [
      Section.new(key: 'context', label: 'Environment', kind: :short, required: false),
      Section.new(key: 'symptom', label: 'Goal', kind: :text, required: true),
      Section.new(key: 'constraints', label: 'Constraints', kind: :lines, required: false),
      Section.new(key: 'rootCause', label: 'Design', kind: :text, required: true),
      Section.new(key: 'flow', label: 'Architecture', kind: :lines, required: false),
      Section.new(key: 'ruledOut', label: 'Alternatives', kind: :lines, required: false),
      Section.new(key: 'fix', label: 'Rollout', kind: :text, required: false),
      Section.new(key: 'lesson', label: 'Lesson', kind: :text, required: false)
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
end
