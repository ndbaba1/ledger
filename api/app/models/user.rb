class User < ApplicationRecord
  has_many :writeups, dependent: :destroy
  has_many :posts, dependent: :destroy
  has_many :hits, dependent: :destroy

  validates :github_id, :github_login, :handle, :name, :initials, presence: true
  validates :github_id, :handle, uniqueness: true
  validates :handle, format: { with: /\A[a-zA-Z0-9_-]+\z/ }

  # Creates the account on first sign-in; refreshes profile fields (and the
  # OAuth token, needed later to verify evidence) on every sign-in after that.
  def self.from_github(auth)
    info = auth.info
    user = find_or_initialize_by(github_id: auth.uid.to_i)
    name = info.name.presence || info.nickname
    user.github_login = info.nickname
    user.handle = info.nickname if user.handle.blank?
    user.name = name
    user.initials = initials_for(name)
    user.avatar_hue ||= hue_for(info.nickname)
    user.headline = info.description if info.description.present?
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
end
