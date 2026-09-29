class CreateWriteups < ActiveRecord::Migration[8.1]
  def change
    create_table :writeups do |t|
      t.references :user, null: false, foreign_key: true
      t.string :type, null: false
      t.string :status, null: false, default: 'draft'
      t.string :title, null: false, default: ''
      t.jsonb :fields, null: false, default: {}

      t.timestamps
    end

    add_index :writeups, :type
    add_index :writeups, :status
  end
end
