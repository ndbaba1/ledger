class ConvertPostFollowUpsToJsonb < ActiveRecord::Migration[8.1]
  def up
    add_column :posts, :follow_ups_jsonb, :jsonb, null: false, default: []

    Post.reset_column_information
    Post.find_each do |post|
      converted = post.follow_ups.map { |answer| { 'answer' => answer } }
      post.update_column(:follow_ups_jsonb, converted)
    end

    remove_column :posts, :follow_ups
    rename_column :posts, :follow_ups_jsonb, :follow_ups
  end

  def down
    add_column :posts, :follow_ups_text, :text, array: true, null: false, default: []

    Post.reset_column_information
    Post.find_each do |post|
      converted = post.follow_ups.filter_map { |f| f['answer'] }
      post.update_column(:follow_ups_text, converted)
    end

    remove_column :posts, :follow_ups
    rename_column :posts, :follow_ups_text, :follow_ups
  end
end
