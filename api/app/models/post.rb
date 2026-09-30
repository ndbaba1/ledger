class Post < ApplicationRecord
  self.inheritance_column = :_type_disabled

  belongs_to :user
  belongs_to :writeup
  has_many :hits, dependent: :destroy
  has_many :questions, class_name: 'PostQuestion', dependent: :destroy
  has_many :revisions, -> { order(created_at: :desc) }, class_name: 'PostRevision', dependent: :destroy

  validates :slug, :title, :summary, :type, :published_at, presence: true
  validates :slug, uniqueness: { scope: :user_id }

  before_save :refresh_search_body

  scope :search, lambda { |query|
    next all if query.blank?

    tsquery = sanitize_sql_array(["websearch_to_tsquery('english', ?)", query])
    where("search_vector @@ #{tsquery}").order(Arel.sql("ts_rank(search_vector, #{tsquery}) DESC"))
  }

  def hit_by?(user)
    user.present? && hits.exists?(user_id: user.id)
  end

  private

  # Weighted for full-text search: title (A), tags (B), everything else (C).
  # search_vector itself is refreshed by an AR callback below since it can't
  # be assigned directly from Ruby.
  def refresh_search_body
    self.search_body = [
      summary, context, decision, lesson,
      sections.to_a.map { |s| s['body'] }.join(' '),
      follow_ups.join(' ')
    ].compact.join(' ')
  end

  after_save :refresh_search_vector

  def refresh_search_vector
    self.class.where(id: id).update_all(
      [
        "search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A') || ",
        "setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'B') || ",
        "setweight(to_tsvector('english', coalesce(search_body, '')), 'C')"
      ].join
    )
  end
end
