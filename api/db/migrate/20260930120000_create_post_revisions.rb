class CreatePostRevisions < ActiveRecord::Migration[8.1]
  def change
    create_table :post_revisions do |t|
      t.references :post, null: false, foreign_key: true
      t.string :summary, null: false
      t.jsonb :sections_snapshot, null: false, default: []
      t.datetime :created_at, null: false
    end

    add_index :post_revisions, [:post_id, :created_at]
  end
end
