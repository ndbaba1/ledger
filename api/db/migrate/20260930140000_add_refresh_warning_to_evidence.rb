class AddRefreshWarningToEvidence < ActiveRecord::Migration[8.1]
  def change
    add_column :evidence, :refresh_warning, :string unless column_exists?(:evidence, :refresh_warning)

    # Already nullable in every environment we've seen, but make it explicit
    # and safe to run regardless (dropping a NOT NULL that isn't there is a
    # no-op in Postgres).
    change_column_null :evidence, :repo, true

    dedupe_evidence!

    unless index_exists?(:evidence, %i[writeup_id key], unique: true)
      add_index :evidence, %i[writeup_id key], unique: true
    end
    unless index_exists?(:evidence, %i[writeup_id url], unique: true)
      add_index :evidence, %i[writeup_id url], unique: true
    end
  end

  private

  # Same writeup_id + url, or same writeup_id + key: keep the oldest row of
  # each group, drop the rest. Needed before the unique indexes above can be
  # (re-)added on a database that somehow ended up with duplicates.
  def dedupe_evidence!
    execute <<~SQL.squish
      DELETE FROM evidence e
      USING evidence keeper
      WHERE e.writeup_id = keeper.writeup_id
        AND e.url = keeper.url
        AND e.id > keeper.id
    SQL

    execute <<~SQL.squish
      DELETE FROM evidence e
      USING evidence keeper
      WHERE e.writeup_id = keeper.writeup_id
        AND e.key = keeper.key
        AND e.id > keeper.id
    SQL
  end
end
