class CreateDraftRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :draft_requests do |t|
      t.references :user, null: false, foreign_key: true
      t.references :writeup, foreign_key: true
      t.string :source_url, null: false
      t.string :template
      t.string :status, null: false, default: 'drafting'
      t.string :error
      t.string :note
      t.boolean :drafted_from_private, null: false, default: false
      # Only ever set true by the job, at the moment it saves genuine
      # LLM-drafted content — every other outcome (needs_template,
      # empty-source, failed, stale) leaves this false.
      t.boolean :counts_toward_cap, null: false, default: false

      t.timestamps
    end

    add_index :draft_requests, %i[user_id created_at]
    add_index :draft_requests, %i[user_id source_url status]
  end
end
