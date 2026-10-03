require 'rails_helper'

RSpec.describe 'GET /api/v1/github/app/setup', type: :request do
  let(:user) { create(:user, github_id: 1001, github_login: 'octocat', github_token: 'gho_test') }
  let(:writeup) { create(:writeup, user: user) }

  before { sign_in_as(user) }

  def pr_body(private_repo: true)
    {
      title: 'Revert pool size', merged_at: '2026-09-20T10:00:00Z', created_at: '2026-09-19T10:00:00Z',
      user: { id: 1001, login: 'octocat' }, additions: 5, deletions: 5,
      base: { repo: { private: private_repo } }
    }
  end

  it 'rejects a bad state without touching anything' do
    get '/api/v1/github/app/setup', params: { installation_id: '999', setup_action: 'install', state: 'garbage' }

    expect(response).to redirect_to(Rails.application.config.x.app_url)
  end

  it 'rejects an expired state' do
    state = nil
    travel_to 20.minutes.ago do
      state = GithubApp.sign_setup_state(user_id: user.id, writeup_id: writeup.id)
    end

    get '/api/v1/github/app/setup', params: { installation_id: '999', setup_action: 'install', state: state }

    expect(response).to redirect_to(Rails.application.config.x.app_url)
  end

  it 're-verifies the write-up’s pending evidence and redirects to the editor with ?installed=1' do
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/9').to_return(
      status: 404, body: { message: 'Not Found' }.to_json, headers: { 'Content-Type' => 'application/json' }
    )
    stub_installation_missing('acme', 'checkout')
    post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/9' }
    expect(json['evidence'].last['failureCode']).to eq('app_not_installed')

    # The person just installed the app on acme.
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/9').to_return(
      status: 200, body: pr_body.to_json, headers: { 'Content-Type' => 'application/json' }
    )
    stub_installation_found('acme', 'checkout')
    stub_installation_token
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/9')
      .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
      .to_return(status: 200, body: pr_body.to_json, headers: { 'Content-Type' => 'application/json' })

    state = GithubApp.sign_setup_state(user_id: user.id, writeup_id: writeup.id)
    get '/api/v1/github/app/setup', params: { installation_id: '4242', setup_action: 'install', state: state }

    expect(response).to redirect_to("#{Rails.application.config.x.app_url}/write/#{writeup.id}?installed=1")

    get "/api/v1/writeups/#{writeup.id}"
    evidence = json['evidence'].first
    expect(evidence['status']).to eq('fetched')
    expect(evidence['authoredByMe']).to eq(true)
    expect(evidence).not_to have_key('failureCode')
  end

  it 'redirects to New write-up with the URL refilled, for a draft_url state (no write-up to return to)' do
    state = GithubApp.sign_setup_state(user_id: user.id, draft_url: 'https://github.com/acme/checkout/pull/9')

    get '/api/v1/github/app/setup', params: { installation_id: '4242', setup_action: 'install', state: state }

    expect(response).to redirect_to(
      "#{Rails.application.config.x.app_url}/new?url=https%3A%2F%2Fgithub.com%2Facme%2Fcheckout%2Fpull%2F9&installed=1",
    )
  end
end
