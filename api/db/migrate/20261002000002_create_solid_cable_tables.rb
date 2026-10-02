# Solid Cable's table, created directly in the primary database instead of a
# separate "cable" database — same root cause and fix as
# CreateSolidQueueTables. Nothing in this app currently uses Action Cable
# (no app/channels, no broadcasts), so this hasn't crashed in production yet,
# but config/cable.yml does configure `adapter: solid_cable` for production,
# and it would hit the exact same "relation does not exist" error the moment
# anything tried to use it.
#
# Table/index definitions are copied from db/cable_schema.rb (solid_cable
# 4.1.0) verbatim. Skipped if it already exists, so this is safe to run
# against a dev database that already loaded cable_schema.rb separately.
class CreateSolidCableTables < ActiveRecord::Migration[8.1]
  def change
    return if table_exists?(:solid_cable_messages)

    create_table :solid_cable_messages do |t|
      t.binary "channel", limit: 1024, null: false
      t.binary "payload", limit: 536_870_912, null: false
      t.datetime "created_at", null: false
      t.integer "channel_hash", limit: 8, null: false
      t.index ["channel_hash"], name: "index_solid_cable_messages_on_channel_hash"
      t.index ["created_at"], name: "index_solid_cable_messages_on_created_at"
    end
  end
end
