class PostRevision < ApplicationRecord
  belongs_to :post

  validates :summary, presence: true, length: { maximum: 140 }
end
