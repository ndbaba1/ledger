class Evidence < ApplicationRecord
  self.table_name = 'evidence'

  KINDS = %w[github_pr github_issue link].freeze
  STATUSES = %w[fetched linked failed].freeze
  FAILURE_CODES = %w[app_not_installed].freeze

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
  # given write-up type, or nil when it's just a plain link. A private repo's
  # real repo name and URL never appear here — only the author's own editor
  # (via EvidenceSerializer, from the `title` column) sees those.
  def badge(writeup_type)
    when_str = merged_at&.strftime('%b %Y')
    result =
      if kind == 'github_pr' && authored_by_user
        { label: "Authored & merged #{WHAT_BY_TYPE.fetch(writeup_type, 'the fix')}", detail: badge_detail(when_str), verified: true, url: public_url }
      elsif kind == 'github_pr' && snapshot['reviewed']
        { label: 'Reviewed the change', detail: badge_detail(when_str), verified: true, url: public_url }
      elsif kind == 'github_issue' && snapshot['participated']
        { label: 'Participated in the investigation', detail: badge_detail(nil), verified: true, url: public_url }
      end
    result&.compact
  end

  private

  def badge_detail(when_str)
    label = private? ? 'private GitHub project' : repo
    when_str ? "#{label} · #{when_str}" : label
  end

  def public_url
    private? ? nil : url
  end

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
