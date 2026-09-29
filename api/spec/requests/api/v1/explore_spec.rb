require 'rails_helper'

RSpec.describe 'GET /api/v1/explore', type: :request do
  it 'works with no one signed in' do
    author = create(:user)
    create(:post, user: author, title: 'Checkout p99 latency spike', tags: %w[postgres pgbouncer])
    create(:post, user: author, title: 'Kafka consumer lag', tags: %w[kafka], slug: 'kafka-consumer-lag')

    get '/api/v1/explore'

    expect(response).to have_http_status(:ok)
    expect(json['total']).to eq(2)
    expect(json['items'].map { |i| i['post']['title'] }).to contain_exactly('Checkout p99 latency spike', 'Kafka consumer lag')
    expect(json['items'].first['hitByMe']).to eq(false)
    expect(json['tags']).to include({ 'tag' => 'postgres', 'count' => 1 }, { 'tag' => 'kafka', 'count' => 1 })
  end

  it 'filters by full-text query, type and tag' do
    author = create(:user)
    create(:post, user: author, title: 'Checkout p99 latency spike', type: 'incident', tags: ['postgres'])
    create(:post, user: author, title: 'Rate limiting design', type: 'design', tags: ['redis'], slug: 'rate-limiting-design')

    get '/api/v1/explore', params: { query: 'checkout' }
    expect(json['items'].map { |i| i['post']['title'] }).to eq(['Checkout p99 latency spike'])

    get '/api/v1/explore', params: { type: 'design' }
    expect(json['items'].map { |i| i['post']['title'] }).to eq(['Rate limiting design'])

    get '/api/v1/explore', params: { tag: 'redis' }
    expect(json['items'].map { |i| i['post']['title'] }).to eq(['Rate limiting design'])
  end

  it "reports the viewer's own hits" do
    author = create(:user)
    reader = create(:user)
    post = create(:post, user: author)
    create(:hit, user: reader, post: post)
    sign_in_as(reader)

    get '/api/v1/explore'

    expect(json['items'].first['hitByMe']).to eq(true)
  end
end
