class RemoveDefaultWriteupStatus < ActiveRecord::Migration[8.1]
  def change
    # The Writeup model decides the default (proposed for designs, draft for
    # everything else) — a DB-level default would always win over that logic.
    change_column_default :writeups, :status, from: 'draft', to: nil
  end
end
