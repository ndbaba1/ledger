class Hit < ApplicationRecord
  belongs_to :user
  belongs_to :post

  validates :user_id, uniqueness: { scope: :post_id }
  validate :not_own_post

  private

  def not_own_post
    errors.add(:base, "You wrote this one.") if post && user_id == post.user_id
  end
end
