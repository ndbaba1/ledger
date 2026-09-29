require 'rails_helper'

RSpec.describe 'GET /api/v1/users/:handle', type: :request do
  it 'returns the profile with posts, empty projects, and the viewer’s hits' do
    author = create(:user, handle: 'hannahl', name: 'Hannah L.')
    post = create(:post, user: author, title: 'Retries turned a blip into an outage')
    reader = create(:user)
    create(:hit, user: reader, post: post)
    sign_in_as(reader)

    get '/api/v1/users/hannahl'

    expect(response).to have_http_status(:ok)
    expect(json['user']['handle']).to eq('hannahl')
    expect(json['posts'].map { |p| p['title'] }).to eq(['Retries turned a blip into an outage'])
    expect(json['projects']).to eq([])
    expect(json['hitByViewer']).to eq([post.slug])
  end

  it "404s for a handle that doesn't exist" do
    get '/api/v1/users/nobody'
    expect(response).to have_http_status(:not_found)
  end

  it 'counts verified PRs and distinct repos behind published posts' do
    author = create(:user, handle: 'hannahl')
    w1 = create(:writeup, user: author)
    create(:evidence, writeup: w1, kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout')
    create(:post, user: author, writeup: w1, slug: 'one')

    w2 = create(:writeup, user: author)
    create(:evidence, writeup: w2, kind: 'github_pr', authored_by_user: false, snapshot: { 'reviewed' => true }, repo: 'acme/billing')
    create(:post, user: author, writeup: w2, slug: 'two')

    # Unverified evidence (no badge) and evidence on an unpublished write-up must not count.
    w3 = create(:writeup, user: author)
    create(:evidence, writeup: w3, kind: 'github_pr', authored_by_user: false, repo: 'acme/unrelated')
    w4 = create(:writeup, user: author)
    create(:evidence, writeup: w4, kind: 'github_pr', authored_by_user: true, repo: 'acme/unpublished')

    get '/api/v1/users/hannahl'

    expect(json['verifiedPRs']).to eq(2)
    expect(json['repos']).to eq(2)
  end
end
