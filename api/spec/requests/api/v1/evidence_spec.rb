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
    end

    it 'stores a plain link unverified for a private repo (404)' do
      stub_request(:get, 'https://api.github.com/repos/acme/private-repo/pulls/7')
        .to_return(status: 404, body: { message: 'Not Found' }.to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/private-repo/pull/7' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['status']).to eq('failed')
      expect(evidence['detail']).to eq('acme/private-repo')
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
