class User < ApplicationRecord
  has_many :writeups, dependent: :destroy
  has_many :posts, dependent: :destroy
  has_many :hits, dependent: :destroy

  encrypts :github_token

  MAX_STACK_TAGS = 12
  MAX_STACK_TAG_LENGTH = 24

  validates :github_id, :github_login, :handle, :name, :initials, presence: true
  validates :github_id, :handle, uniqueness: true
  validates :handle, format: { with: /\A[a-zA-Z0-9_-]+\z/ }
  validates :name, length: { maximum: 100 }
  validates :headline, length: { maximum: 160 }
  validates :location, length: { maximum: 100 }
  validates :website, length: { maximum: 300 }
  validates :linkedin, length: { maximum: 300 }
  validate :stack_within_limits

  # Creates the account on first sign-in. Identity fields (avatar, name,
  # company) always mirror GitHub; profile content the person can edit in
  # Ledger (headline, location, website) is seeded from GitHub only once,
  # the first time it's blank — after that, what they wrote in Ledger wins.
  def self.from_github(auth)
    info = auth.info
    raw = auth.extra&.raw_info || {}
    user = find_or_initialize_by(github_id: auth.uid.to_i)
    name = info.name.presence || info.nickname
    user.github_login = info.nickname
    user.handle = info.nickname if user.handle.blank?
    user.name = name
    user.initials = initials_for(name)
    user.avatar_hue ||= hue_for(info.nickname)
    user.avatar_url = info.image
    user.company = raw['company']
    user.headline = raw['bio'] if user.headline.blank? && raw['bio'].present?
    user.location = raw['location'] if user.location.blank? && raw['location'].present?
    user.website = raw['blog'] if user.website.blank? && raw['blog'].present?
    user.github_token = auth.credentials.token
    user.save!
    user
  end

  def self.initials_for(name)
    parts = name.to_s.split(/\s+/).reject(&:blank?)
    initials = parts.first(2).map { |p| p[0] }.join.upcase
    initials.presence || 'NN'
  end

  def self.hue_for(seed)
    seed.to_s.bytes.sum % 360
  end

  def github_url
    "https://github.com/#{github_login}"
  end

  private

  def stack_within_limits
    return if stack.blank?

    errors.add(:stack, "can have at most #{MAX_STACK_TAGS} tags") if stack.size > MAX_STACK_TAGS
    if stack.any? { |tag| tag.to_s.length > MAX_STACK_TAG_LENGTH }
      errors.add(:stack, "tags can be at most #{MAX_STACK_TAG_LENGTH} characters")
    end
  end
end
