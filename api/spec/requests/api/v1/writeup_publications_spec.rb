require 'rails_helper'

RSpec.describe 'POST /api/v1/writeups/:id/publish', type: :request do
  let(:user) { create(:user, github_login: 'octocat', github_token: 'gho_test') }

  before { sign_in_as(user) }

  it 'refuses to publish with missing requirements, listing what is missing' do
    writeup = create(:writeup, user: user, title: '', fields: { 'symptom' => '', 'rootCause' => '', 'fix' => '' })

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:unprocessable_content)
    expect(json['error']).to include('A title', 'Problem', 'Root cause', 'Solution', 'An MR, PR or issue as evidence')
  end

  it 'publishes a complete write-up to the profile and returns a PublicPost' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    create(:evidence, writeup: writeup, kind: 'github_pr', authored_by_user: true, merged_at: Time.zone.parse('2026-09-01'), repo: 'acme/checkout')

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:created)
    expect(json['slug']).to eq('checkout-p99-latency-spike')
    expect(json['authorId']).to eq(user.id.to_s)
    expect(json['badges']).to include(hash_including('label' => 'Authored & merged the fix'))
    expect(User.find(user.id).posts.count).to eq(1)
  end

  it 're-publishing an already-published write-up just returns the existing post' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    create(:evidence, writeup: writeup, kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout')
    post_json "/api/v1/writeups/#{writeup.id}/publish"
    first_slug = json['slug']

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:ok)
    expect(json['slug']).to eq(first_slug)
    expect(Post.count).to eq(1)
  end
end
