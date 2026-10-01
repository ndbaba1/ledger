class AddDraftingFieldsToWriteups < ActiveRecord::Migration[8.1]
  def change
    add_column :writeups, :draft_source_url, :string
    add_column :writeups, :draft_model, :string
    add_column :writeups, :draft_prompt_version, :string
    add_column :writeups, :drafted_at, :datetime
    add_column :writeups, :drafted_from_private, :boolean, null: false, default: false
    add_column :writeups, :draft_sections_meta, :jsonb, null: false, default: {}
  end
end
