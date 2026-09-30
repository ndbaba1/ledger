class Evidence < ApplicationRecord
  self.table_name = 'evidence'

  KINDS = %w[github_pr github_issue link].freeze
  STATUSES = %w[fetched linked failed].freeze

  belongs_to :writeup, inverse_of: :evidence

  validates :key, :kind, :url, :title, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :key, uniqueness: { scope: :writeup_id }
  validate :url_is_http
  validate :url_not_duplicated

  WHAT_BY_TYPE = { 'design' => 'the implementation', 'decision' => 'the change' }.freeze

  # Verified PR evidence behind a user's published posts — for the profile's
  # "Proof of work" numbers.
  def self.verified_pull_requests_for(user)
    writeup_ids = user.writeups.joins(:post).select(:id)
    where(writeup_id: writeup_ids, kind: 'github_pr').select(&:verified?)
  end

  def verified?
    (kind == 'github_pr' && (authored_by_user || snapshot['reviewed'])) ||
      (kind == 'github_issue' && snapshot['participated'])
  end

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

  private

  def url_is_http
    return if url.blank?

    uri = URI.parse(url)
    errors.add(:base, 'Only http(s) links can be added.') unless uri.is_a?(URI::HTTP) && uri.host.present?
  rescue URI::InvalidURIError
    errors.add(:base, 'Only http(s) links can be added.')
  end

  def url_not_duplicated
    return if url.blank? || writeup_id.blank?

    scope = self.class.where(writeup_id: writeup_id, url: url)
    scope = scope.where.not(id: id) if persisted?
    errors.add(:base, 'Already added.') if scope.exists?
  end
end
