class CreatePosts < ActiveRecord::Migration[8.1]
  def change
    create_table :posts do |t|
      t.references :user, null: false, foreign_key: true
      t.references :writeup, null: false, foreign_key: true
      t.string :slug, null: false
      t.string :type, null: false
      t.string :title, null: false
      t.string :summary, null: false
      t.string :context
      t.string :decision
      t.jsonb :sections, null: false, default: []
      t.jsonb :result
      t.string :lesson
      t.text :tags, array: true, default: [], null: false
      t.jsonb :badges, null: false, default: []
      t.text :follow_ups, array: true, default: [], null: false
      t.integer :hit_count, null: false, default: 0
      t.datetime :published_at, null: false

      # Denormalized plain text used to build search_vector; never rendered.
      t.text :search_body, null: false, default: ''
      t.tsvector :search_vector

      t.timestamps
    end

    add_index :posts, %i[user_id slug], unique: true
    add_index :posts, :tags, using: :gin
    add_index :posts, :search_vector, using: :gin
  end
end
