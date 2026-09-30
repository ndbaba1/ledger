require 'rails_helper'

RSpec.describe 'GET /api/v1/me/questions', type: :request do
  let(:author) { create(:user, handle: 'hannahl') }

  it 'requires sign-in' do
    get '/api/v1/me/questions'
    expect(response).to have_http_status(:unauthorized)
  end

  it 'lists pending questions across my posts, oldest first, with post and asker' do
    post_a = create(:post, user: author, slug: 'post-a', title: 'Post A')
    post_b = create(:post, user: author, slug: 'post-b', title: 'Post B')
    asker = create(:user, handle: 'reader1')

    older = create(:post_question, post: post_a, asker: asker, body: 'Older question', created_at: 2.hours.ago)
    newer = create(:post_question, post: post_b, asker: asker, body: 'Newer question', created_at: 1.hour.ago)
    create(:post_question, post: post_a, asker: asker, body: 'Already answered', status: 'answered', answer_body: 'yep')

    sign_in_as(author)
    get '/api/v1/me/questions'

    expect(response).to have_http_status(:ok)
    expect(json.map { |q| q['id'] }).to eq([older.id.to_s, newer.id.to_s])
    expect(json.first['post']).to eq('slug' => 'post-a', 'title' => 'Post A')
    expect(json.first['asker']).to include('handle' => 'reader1')
  end

  it "never includes another author's pending questions" do
    mine = create(:post, user: author, slug: 'mine', title: 'Mine')
    someone_else = create(:user, handle: 'other-author')
    theirs = create(:post, user: someone_else, slug: 'theirs', title: 'Theirs')
    asker = create(:user, handle: 'reader1')
    create(:post_question, post: theirs, asker: asker)
    mine_q = create(:post_question, post: mine, asker: asker)

    sign_in_as(author)
    get '/api/v1/me/questions'

    expect(json.map { |q| q['id'] }).to eq([mine_q.id.to_s])
  end
end
