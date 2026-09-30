class Writeup < ApplicationRecord
  # `type` is a plain string column (incident/investigation/decision/design),
  # not a Ruby class discriminator — turn off Rails' single-table inheritance.
  self.inheritance_column = :_type_disabled

  TYPES = %w[incident investigation decision design].freeze
  STATUSES = %w[draft proposed shipped].freeze

  # `fields` holds WriteupFields minus `title`, which has its own column.
  EMPTY_FIELDS = {
    'context' => '', 'symptom' => '', 'constraints' => [],
    'rootCause' => '', 'flow' => [], 'ruledOut' => [], 'fix' => '', 'lesson' => '',
    'signals' => []
  }.freeze

  belongs_to :user
  has_many :evidence, -> { order(:key) }, dependent: :destroy, inverse_of: :writeup
  has_one :post, dependent: :destroy

  validates :type, inclusion: { in: TYPES }
  validates :status, inclusion: { in: STATUSES }
  validate :design_status_matches_type

  before_validation :default_status, on: :create
  before_validation :default_fields, on: :create

  # Field key => label shown to the writer, for each required field per type.
  # Mirrors the `required` FieldDefs in web/src/lib/writeups.ts.
  PROBLEM_REQUIRED_FIELDS = [['symptom', 'Problem'], ['rootCause', 'Root cause'], ['fix', 'Solution']].freeze
  REQUIRED_FIELDS = {
    'incident' => PROBLEM_REQUIRED_FIELDS,
    'investigation' => PROBLEM_REQUIRED_FIELDS,
    'decision' => [['symptom', 'Context'], ['rootCause', 'Decision'], ['ruledOut', 'Options rejected'], ['fix', 'Consequences']],
    'design' => [['symptom', 'Goal'], ['rootCause', 'Design']]
  }.freeze

  def published?
    post.present?
  end

  def field(key)
    fields[key.to_s]
  end

  EVIDENCE_BLOCKER = 'At least one piece of evidence Ledger could check with GitHub.'

  # Mirrors `publishBlockers` in web/src/lib/writeups.ts: the labels of
  # whatever is still missing before this can be published.
  def publish_blockers
    blockers = []
    blockers << 'A title' if title.blank?
    REQUIRED_FIELDS.fetch(type).each { |key, label| blockers << label unless field_filled?(key) }

    if type == 'design'
      blockers << 'Marked as shipped' unless status == 'shipped'
      blockers << 'Rollout' unless field_filled?('fix')
      blockers << 'A result after launch' unless result_complete?
    end
    blockers << EVIDENCE_BLOCKER unless evidence_requirement_met?
    blockers
  end

  private

  # A design still needs specifically a verified PR (it's shipped code); any
  # other type just needs one piece of verified evidence — a PR or an issue.
  def evidence_requirement_met?
    if type == 'design'
      evidence.any? { |e| e.kind == 'github_pr' && e.verified? }
    else
      evidence.any?(&:verified?)
    end
  end

  def field_filled?(key)
    value = fields[key]
    value.is_a?(Array) ? value.any? { |x| x.to_s.strip.present? } : value.to_s.strip.present?
  end

  def result_complete?
    result = fields['result']
    result.is_a?(Hash) && result['label'].present? && result['before'].present? && result['after'].present?
  end

  def default_status
    self.status ||= type == 'design' ? 'proposed' : 'draft'
  end

  def default_fields
    self.fields = EMPTY_FIELDS.merge(fields || {})
    self.title ||= ''
  end

  def design_status_matches_type
    if type == 'design' && status == 'draft'
      errors.add(:status, 'a design is either proposed or shipped')
    elsif type != 'design' && status != 'draft'
      errors.add(:status, 'only designs are proposed or shipped')
    end
  end
end
