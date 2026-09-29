require 'rails_helper'

RSpec.describe 'GET /api/v1/topics/:tag', type: :request do
  it 'lists posts tagged with it, ranked by hits, with related tags' do
    author = create(:user)
    popular = create(:post, user: author, tags: %w[postgres pgbouncer], hit_count: 10, slug: 'popular')
    quiet = create(:post, user: author, tags: %w[postgres redis], hit_count: 1, slug: 'quiet')

    get '/api/v1/topics/postgres'

    expect(response).to have_http_status(:ok)
    expect(json['tag']).to eq('postgres')
    expect(json['items'].map { |i| i['post']['slug'] }).to eq([popular.slug, quiet.slug])
    expect(json['related']).to include({ 'tag' => 'pgbouncer', 'count' => 1 }, { 'tag' => 'redis', 'count' => 1 })
    expect(json['totalHits']).to eq(11)
  end

  it '404s for a tag with no posts' do
    get '/api/v1/topics/nonexistent'
    expect(response).to have_http_status(:not_found)
  end
end
