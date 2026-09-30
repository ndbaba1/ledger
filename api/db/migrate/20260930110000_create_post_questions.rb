class CreatePostQuestions < ActiveRecord::Migration[8.1]
  def change
    create_table :post_questions do |t|
      t.references :post, null: false, foreign_key: true
      t.references :asker, null: false, foreign_key: { to_table: :users }
      t.string :body, null: false
      t.string :status, null: false, default: 'pending'
      t.text :answer_body
      t.datetime :answered_at
      t.boolean :folded, null: false, default: false

      t.timestamps
    end

    add_index :post_questions, [:post_id, :status]
    add_index :post_questions, [:asker_id, :created_at]
  end
end
