class AddPrivateDraftingConsentAtToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :private_drafting_consent_at, :datetime
  end
end
