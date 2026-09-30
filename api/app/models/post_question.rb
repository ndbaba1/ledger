class PostQuestion < ApplicationRecord
  STATUSES = %w[pending answered dismissed].freeze
  MAX_BODY_LENGTH = 600
  MAX_PENDING_PER_POST = 3
  MAX_PER_ASKER_PER_HOUR = 5

  belongs_to :post
  belongs_to :asker, class_name: 'User'

  validates :body, presence: true, length: { maximum: MAX_BODY_LENGTH }
  validates :status, inclusion: { in: STATUSES }

  scope :pending, -> { where(status: 'pending') }
  scope :answered, -> { where(status: 'answered') }

  def answered?
    status == 'answered' && answer_body.present?
  end
end
