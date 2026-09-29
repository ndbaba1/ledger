class AddGithubProfileFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :avatar_url, :string
    # `website` and `linkedin` are editable in Ledger (website defaults from
    # GitHub's blog field on first sign-in); `company` mirrors GitHub as-is.
    add_column :users, :website, :string
    add_column :users, :linkedin, :string
    add_column :users, :company, :string
  end
end
