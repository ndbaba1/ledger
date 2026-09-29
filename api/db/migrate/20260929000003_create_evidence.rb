class CreateEvidence < ActiveRecord::Migration[8.1]
  def change
    create_table :evidence do |t|
      t.references :writeup, null: false, foreign_key: true
      t.string :key, null: false
      t.string :kind, null: false
      t.string :url, null: false
      t.string :title, null: false
      t.string :detail
      t.string :status, null: false, default: 'linked'
      t.string :repo
      t.integer :number
      t.boolean :authored_by_user, null: false, default: false
      t.datetime :merged_at
      t.datetime :verified_at
      t.jsonb :snapshot, null: false, default: {}
      t.string :failure_reason

      t.timestamps
    end

    add_index :evidence, %i[writeup_id key], unique: true
  end
end
