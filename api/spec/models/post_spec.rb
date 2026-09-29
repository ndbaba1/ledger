require 'rails_helper'

RSpec.describe Post, type: :model do
  it 'refreshes the search vector from the title, tags and body on save' do
    post = create(:post, title: 'Checkout p99 latency spike', tags: ['postgres', 'pgbouncer'])
    row = ActiveRecord::Base.connection.select_one(
      "SELECT search_vector::text FROM posts WHERE id = #{post.id}"
    )
    expect(row['search_vector']).to include("'checkout'")
    expect(row['search_vector']).to include("'postgr'")
  end

  it 'finds posts by full-text search across title, tags and body' do
    create(:post, title: 'Checkout p99 latency spike', summary: 'A config change halved the pool.')
    create(:post, title: 'Unrelated design doc', summary: 'Nothing to do with pools.', slug: 'unrelated-design-doc')

    results = Post.search('checkout')
    expect(results.map(&:title)).to eq(['Checkout p99 latency spike'])
  end

  it 'reports whether a given user hit the post' do
    post = create(:post)
    reader = create(:user)
    expect(post.hit_by?(reader)).to be false
    create(:hit, post: post, user: reader)
    expect(post.hit_by?(reader)).to be true
  end
end
