class Evidence < ApplicationRecord
  self.table_name = 'evidence'

  KINDS = %w[github_pr github_issue link].freeze
  STATUSES = %w[fetched linked failed].freeze
  # Evidence that counts as proof the work happened, for publishBlockers.
  PROOF_KINDS = %w[github_pr github_issue].freeze
  CODE_KINDS = %w[github_pr].freeze

  belongs_to :writeup, inverse_of: :evidence

  validates :key, :kind, :url, :title, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :key, uniqueness: { scope: :writeup_id }
  validates :url, uniqueness: { scope: :writeup_id, message: 'is already attached' }

  WHAT_BY_TYPE = { 'design' => 'the implementation', 'decision' => 'the change' }.freeze

  # The verification badge this evidence earns on a published post of the
  # given write-up type, or nil when it's just a plain link.
  def badge(writeup_type)
    when_str = merged_at&.strftime('%b %Y')
    if kind == 'github_pr' && authored_by_user
      { label: "Authored & merged #{WHAT_BY_TYPE.fetch(writeup_type, 'the fix')}", detail: "#{repo} · #{when_str}", verified: true, url: url }
    elsif kind == 'github_pr' && snapshot['reviewed']
      { label: 'Reviewed the change', detail: "#{repo} · #{when_str}", verified: true, url: url }
    elsif kind == 'github_issue' && snapshot['participated']
      { label: 'Participated in the investigation', detail: repo, verified: true, url: url }
    end
  end
end
