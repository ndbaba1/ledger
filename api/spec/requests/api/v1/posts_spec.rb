require 'rails_helper'

RSpec.describe 'Post, thread and hit endpoints', type: :request do
  let(:author) { create(:user, handle: 'hannahl') }
  let(:post_record) { create(:post, user: author, title: 'Retries turned a blip into an outage') }

  describe 'GET /api/v1/users/:handle/posts/:slug' do
    it 'returns the post and its author' do
      get "/api/v1/users/hannahl/posts/#{post_record.slug}"
      expect(response).to have_http_status(:ok)
      expect(json['post']['title']).to eq('Retries turned a blip into an outage')
      expect(json['author']['handle']).to eq('hannahl')
    end

    it '404s for an unknown slug' do
      get '/api/v1/users/hannahl/posts/nope'
      expect(response).to have_http_status(:not_found)
    end

    it 'splits evidence into unverified (flat) and verified (grouped), and never shows failed evidence' do
      writeup = post_record.writeup
      create(:evidence, writeup: writeup, key: 'S1', kind: 'github_pr', authored_by_user: true,
                         repo: 'acme/checkout', url: 'https://github.com/acme/checkout/pull/1')
      create(:evidence, writeup: writeup, key: 'S2', kind: 'github_pr', authored_by_user: false,
                         repo: 'acme/checkout', url: 'https://github.com/acme/checkout/pull/2')
      create(:evidence, writeup: writeup, key: 'S3', kind: 'link', status: 'linked', url: 'https://example.com/notes')
      create(:evidence, writeup: writeup, key: 'S4', kind: 'github_pr', status: 'failed',
                         failure_reason: 'Private repo — not supported yet.', url: 'https://github.com/acme/secret/pull/9')

      get "/api/v1/users/hannahl/posts/#{post_record.slug}"

      urls = json['post']['evidence'].map { |e| e['url'] }
      expect(urls).to contain_exactly('https://github.com/acme/checkout/pull/2', 'https://example.com/notes')
      expect(json['post']['evidence'].map { |e| e['verified'] }).to all(be false)

      expect(json['post']['verifiedEvidence'].length).to eq(1)
      expect(json['post']['verifiedEvidence'].first).to include('kind' => 'github_pr', 'badgeType' => 'authored_merged', 'url' => 'https://github.com/acme/checkout/pull/1')
    end
  end

  describe 'GET .../posts/:slug — grouped verified evidence' do
    def stub_pull_request(number, body)
      stub_request(:get, "https://api.github.com/repos/acme/checkout/pulls/#{number}")
        .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
    end

    def pr_body(user_id:, login:, merged_at: '2026-09-20T10:00:00Z')
      { title: 'Revert pool size', merged_at: merged_at, created_at: '2026-09-19T10:00:00Z',
        user: { id: user_id, login: login }, additions: 5, deletions: 5, base: { repo: { private: false } } }
    end

    it 'returns number, title, repo and url for a public verified PR' do
      writeup = post_record.writeup
      create(:evidence, writeup: writeup, key: 'S1', kind: 'github_pr', authored_by_user: true,
                         number: 1, repo: 'acme/checkout', url: 'https://github.com/acme/checkout/pull/1',
                         merged_at: '2026-09-20T10:00:00Z', snapshot: { 'title' => 'Revert pool size' })

      get "/api/v1/users/hannahl/posts/#{post_record.slug}"

      item = json['post']['verifiedEvidence'].first
      expect(item).to eq(
        'kind' => 'github_pr', 'badgeType' => 'authored_merged', 'number' => 1,
        'title' => 'Revert pool size', 'repo' => 'acme/checkout', 'url' => 'https://github.com/acme/checkout/pull/1',
        'date' => '2026-09-20T10:00:00Z'
      )
    end

    it 'omits number, title, repo and url for a verified private PR, keeping only kind/badgeType/date' do
      writeup = post_record.writeup
      create(:evidence, writeup: writeup, key: 'S1', kind: 'github_pr', authored_by_user: true, private: true,
                         owner: 'acme', number: 1, repo: 'acme/checkout', title: 'GitHub PR #1 · Revert pool size',
                         url: 'https://github.com/acme/checkout/pull/1', merged_at: '2026-09-20T10:00:00Z',
                         snapshot: { 'title' => 'Revert pool size' })

      get "/api/v1/users/hannahl/posts/#{post_record.slug}"

      item = json['post']['verifiedEvidence'].first
      expect(item).to eq('kind' => 'github_pr', 'badgeType' => 'authored_merged', 'private' => true, 'date' => '2026-09-20T10:00:00Z')
      expect(item).not_to have_key('title')
      expect(item).not_to have_key('url')
      expect(item).not_to have_key('repo')
      expect(item).not_to have_key('number')
    end

    it 'buckets a reviewed PR as "reviewed" and a participated issue as "participated"' do
      writeup = post_record.writeup
      create(:evidence, writeup: writeup, key: 'S1', kind: 'github_pr', authored_by_user: false,
                         number: 2, repo: 'acme/checkout', url: 'https://github.com/acme/checkout/pull/2',
                         merged_at: '2026-09-20T10:00:00Z', snapshot: { 'title' => 'Fix pool', 'reviewed' => true })
      create(:evidence, writeup: writeup, key: 'S2', kind: 'github_issue', number: 9,
                         repo: 'acme/checkout', url: 'https://github.com/acme/checkout/issues/9',
                         snapshot: { 'title' => 'Flaky test', 'participated' => true, 'createdAt' => '2026-08-01T00:00:00Z' })

      get "/api/v1/users/hannahl/posts/#{post_record.slug}"

      types = json['post']['verifiedEvidence'].map { |e| e['badgeType'] }
      expect(types).to contain_exactly('reviewed', 'participated')
    end

    it 're-checks evidence verified before the GitHub App change on republish, clearing repo/title/url once its repo turns private' do
      writeup = post_record.writeup
      # As it would have been stored under the old public-only verifier: no
      # `private` column value set (defaults false), full public details.
      create(:evidence, writeup: writeup, key: 'S1', kind: 'github_pr', authored_by_user: true,
                         number: 1, repo: 'acme/checkout', url: 'https://github.com/acme/checkout/pull/1',
                         merged_at: '2026-09-01T00:00:00Z', snapshot: { 'title' => 'Revert pool size' })

      sign_in_as(author)
      private_pr_body = pr_body(user_id: author.github_id, login: author.github_login).merge(base: { repo: { private: true } })
      stub_pull_request(1, private_pr_body)
      stub_installation_found('acme', 'checkout')
      stub_installation_token
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/1')
        .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 200, body: private_pr_body.to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/publish", params: { summary: 'Repo went private' }
      expect(response).to have_http_status(:ok)

      get "/api/v1/users/hannahl/posts/#{post_record.slug}"
      item = json['post']['verifiedEvidence'].first
      expect(item['private']).to be true
      expect(item).not_to have_key('title')
      expect(item).not_to have_key('url')
      expect(item).not_to have_key('repo')
    end
  end

  describe 'GET .../thread' do
    it 'returns an empty thread when nobody has asked anything yet' do
      get "/api/v1/users/hannahl/posts/#{post_record.slug}/thread"
      expect(response).to have_http_status(:ok)
      expect(json).to eq('questions' => [], 'askers' => [], 'mine' => [], 'hitCount' => 0, 'hitByMe' => false)
    end
  end

  describe 'POST .../hit' do
    it 'requires sign-in' do
      post_json "/api/v1/users/hannahl/posts/#{post_record.slug}/hit"
      expect(response).to have_http_status(:unauthorized)
    end

    it 'toggles a hit on and back off' do
      reader = create(:user)
      sign_in_as(reader)

      post_json "/api/v1/users/hannahl/posts/#{post_record.slug}/hit"
      expect(response).to have_http_status(:ok)
      expect(json['hitCount']).to eq(1)
      expect(json['hitByMe']).to eq(true)

      post_json "/api/v1/users/hannahl/posts/#{post_record.slug}/hit"
      expect(json['hitCount']).to eq(0)
      expect(json['hitByMe']).to eq(false)
    end

    it "forbids hitting your own post" do
      sign_in_as(author)
      post_json "/api/v1/users/hannahl/posts/#{post_record.slug}/hit"
      expect(response).to have_http_status(:forbidden)
    end
  end
end
