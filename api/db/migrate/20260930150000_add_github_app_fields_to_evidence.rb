class AddGithubAppFieldsToEvidence < ActiveRecord::Migration[8.1]
  def change
    add_column :evidence, :private, :boolean, default: false, null: false
    add_column :evidence, :failure_code, :string
    add_column :evidence, :install_url, :string
    add_column :evidence, :owner, :string
  end
end
