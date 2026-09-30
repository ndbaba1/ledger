# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_09_30_130000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "evidence", force: :cascade do |t|
    t.bigint "writeup_id", null: false
    t.string "key", null: false
    t.string "kind", null: false
    t.string "url", null: false
    t.string "title", null: false
    t.string "detail"
    t.string "status", default: "linked", null: false
    t.string "repo"
    t.integer "number"
    t.boolean "authored_by_user", default: false, null: false
    t.datetime "merged_at"
    t.datetime "verified_at"
    t.jsonb "snapshot", default: {}, null: false
    t.string "failure_reason"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["writeup_id", "key"], name: "index_evidence_on_writeup_id_and_key", unique: true
    t.index ["writeup_id", "url"], name: "index_evidence_on_writeup_id_and_url", unique: true
    t.index ["writeup_id"], name: "index_evidence_on_writeup_id"
  end

  create_table "hits", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "post_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["post_id"], name: "index_hits_on_post_id"
    t.index ["user_id", "post_id"], name: "index_hits_on_user_id_and_post_id", unique: true
    t.index ["user_id"], name: "index_hits_on_user_id"
  end

  create_table "post_questions", force: :cascade do |t|
    t.bigint "post_id", null: false
    t.bigint "asker_id", null: false
    t.string "body", null: false
    t.string "status", default: "pending", null: false
    t.text "answer_body"
    t.datetime "answered_at"
    t.boolean "folded", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["asker_id", "created_at"], name: "index_post_questions_on_asker_id_and_created_at"
    t.index ["asker_id"], name: "index_post_questions_on_asker_id"
    t.index ["post_id", "status"], name: "index_post_questions_on_post_id_and_status"
    t.index ["post_id"], name: "index_post_questions_on_post_id"
  end

  create_table "post_revisions", force: :cascade do |t|
    t.bigint "post_id", null: false
    t.string "summary", null: false
    t.jsonb "sections_snapshot", default: [], null: false
    t.datetime "created_at", null: false
    t.index ["post_id", "created_at"], name: "index_post_revisions_on_post_id_and_created_at"
    t.index ["post_id"], name: "index_post_revisions_on_post_id"
  end

  create_table "posts", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "writeup_id", null: false
    t.string "slug", null: false
    t.string "type", null: false
    t.string "title", null: false
    t.string "summary", null: false
    t.string "context"
    t.string "decision"
    t.jsonb "sections", default: [], null: false
    t.jsonb "result"
    t.string "lesson"
    t.text "tags", default: [], null: false, array: true
    t.jsonb "badges", default: [], null: false
    t.integer "hit_count", default: 0, null: false
    t.datetime "published_at", null: false
    t.text "search_body", default: "", null: false
    t.tsvector "search_vector"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "follow_ups", default: [], null: false
    t.index ["search_vector"], name: "index_posts_on_search_vector", using: :gin
    t.index ["tags"], name: "index_posts_on_tags", using: :gin
    t.index ["user_id", "slug"], name: "index_posts_on_user_id_and_slug", unique: true
    t.index ["user_id"], name: "index_posts_on_user_id"
    t.index ["writeup_id"], name: "index_posts_on_writeup_id"
  end

  create_table "users", force: :cascade do |t|
    t.bigint "github_id", null: false
    t.string "github_login", null: false
    t.string "handle", null: false
    t.string "name", null: false
    t.string "initials", null: false
    t.integer "avatar_hue", null: false
    t.string "headline"
    t.string "location"
    t.text "stack", default: [], null: false, array: true
    t.text "github_token"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "avatar_url"
    t.string "website"
    t.string "linkedin"
    t.string "company"
    t.index ["github_id"], name: "index_users_on_github_id", unique: true
    t.index ["handle"], name: "index_users_on_handle", unique: true
  end

  create_table "writeups", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "type", null: false
    t.string "status", null: false
    t.string "title", default: "", null: false
    t.jsonb "fields", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["status"], name: "index_writeups_on_status"
    t.index ["type"], name: "index_writeups_on_type"
    t.index ["user_id"], name: "index_writeups_on_user_id"
  end

  add_foreign_key "evidence", "writeups"
  add_foreign_key "hits", "posts"
  add_foreign_key "hits", "users"
  add_foreign_key "post_questions", "posts"
  add_foreign_key "post_questions", "users", column: "asker_id"
  add_foreign_key "post_revisions", "posts"
  add_foreign_key "posts", "users"
  add_foreign_key "posts", "writeups"
  add_foreign_key "writeups", "users"
end
