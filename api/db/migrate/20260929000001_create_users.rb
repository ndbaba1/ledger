class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.bigint :github_id, null: false
      t.string :github_login, null: false
      t.string :handle, null: false
      t.string :name, null: false
      t.string :initials, null: false
      t.integer :avatar_hue, null: false
      t.string :headline
      t.string :location
      t.text :stack, array: true, default: [], null: false
      t.text :github_token

      t.timestamps
    end

    add_index :users, :github_id, unique: true
    add_index :users, :handle, unique: true
  end
end
