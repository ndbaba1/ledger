require 'rails_helper'

RSpec.describe 'Writeup evidence API', type: :request do
  let(:user) { create(:user, github_login: 'octocat', github_token: 'gho_test') }
  let(:writeup) { create(:writeup, user: user) }

  before { sign_in_as(user) }

  describe 'POST /api/v1/writeups/:id/evidence' do
    it 'verifies a merged PR authored by the signed-in user' do
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/42')
        .to_return(status: 200, body: {
          title: 'Revert pool size', merged_at: '2026-09-20T10:00:00Z',
          user: { login: 'octocat' }, additions: 5, deletions: 5
        }.to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/42' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['kind']).to eq('github_pr')
      expect(evidence['status']).to eq('fetched')
      expect(evidence['authoredByMe']).to be true
      expect(evidence).not_to have_key('failureReason')
    end

    it 'stores a plain link unverified for a private repo (404), explaining why' do
      stub_request(:get, 'https://api.github.com/repos/acme/private-repo/pulls/7')
        .to_return(status: 404, body: { message: 'Not Found' }.to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/private-repo/pull/7' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['status']).to eq('failed')
      expect(evidence['detail']).to eq('acme/private-repo')
      expect(evidence['failureReason']).to eq('Private repo — not supported yet.')
    end

    it "explains a merged PR authored by someone else" do
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/50')
        .to_return(status: 200, body: {
          title: 'Someone else’s fix', merged_at: '2026-09-20T10:00:00Z',
          user: { login: 'someone-else' }, additions: 1, deletions: 1
        }.to_json, headers: { 'Content-Type' => 'application/json' })
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/50/reviews')
        .to_return(status: 200, body: [].to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/50' }

      evidence = json['evidence'].last
      expect(evidence['authoredByMe']).to be false
      expect(evidence['failureReason']).to eq("Authored by someone-else — you're signed in as octocat.")
    end

    it 'explains a PR by the signed-in user that is not merged yet' do
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/51')
        .to_return(status: 200, body: {
          title: 'Work in progress', merged_at: nil, created_at: '2026-09-20T10:00:00Z',
          user: { login: 'octocat' }, additions: 1, deletions: 1
        }.to_json, headers: { 'Content-Type' => 'application/json' })
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/51/reviews')
        .to_return(status: 200, body: [].to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/51' }

      evidence = json['evidence'].last
      expect(evidence['authoredByMe']).to be false
      expect(evidence['failureReason']).to eq('Not merged yet.')
    end

    it 'stores a non-github link without attempting to fetch it' do
      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://docs.google.com/document/d/abc' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['kind']).to eq('link')
      expect(evidence['status']).to eq('linked')
    end

    it 'rejects an invalid url' do
      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'not a url' }
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe 'DELETE /api/v1/writeups/:id/evidence/:key' do
    it 'removes the evidence' do
      evidence = create(:evidence, writeup: writeup, key: 'S1')
      delete_json "/api/v1/writeups/#{writeup.id}/evidence/S1"
      expect(response).to have_http_status(:ok)
      expect(Evidence.exists?(evidence.id)).to be false
    end
  end
end
