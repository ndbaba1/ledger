require 'rails_helper'

RSpec.describe 'Drafts API', type: :request do
  include ActiveJob::TestHelper

  let(:user) { create(:user, github_id: 1001, github_login: 'octocat', github_token: 'gho_test') }

  before do
    sign_in_as(user)
    stub_repository
    ENV['ANTHROPIC_API_KEY'] = 'sk-test'
  end

  after { ENV.delete('ANTHROPIC_API_KEY') }

  def stub_repository(owner: 'acme', repo: 'checkout', private_repo: false)
    stub_request(:get, "https://api.github.com/repos/#{owner}/#{repo}")
      .to_return(status: 200, body: { private: private_repo }.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_pr(number, body:, private_repo: false)
    full = { base: { repo: { private: private_repo } } }.merge(body)
    stub_request(:get, "https://api.github.com/repos/acme/checkout/pulls/#{number}")
      .to_return(status: 200, body: full.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_reviews(number, reviews = [])
    stub_request(:get, "https://api.github.com/repos/acme/checkout/pulls/#{number}/reviews")
      .with(query: hash_including({}))
      .to_return(status: 200, body: reviews.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_comments(number, comments = [])
    stub_request(:get, "https://api.github.com/repos/acme/checkout/issues/#{number}/comments")
      .with(query: hash_including({}))
      .to_return(status: 200, body: comments.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def merged_pr(number:, body: 'Real content here', title: 'Fix the pool', user_id: 1001, login: 'octocat', merged_at: '2026-09-20T10:00:00Z')
    { number: number, title: title, body: body, created_at: '2026-09-19T10:00:00Z', merged_at: merged_at, user: { id: user_id, login: login } }
  end

  describe 'POST /api/v1/drafts — verification gate' do
    it "doesn't draft an unmerged PR, and makes no LLM call" do
      stub_pr(1, body: merged_pr(number: 1, merged_at: nil))
      stub_reviews(1)

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/1' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to eq("This PR isn't merged yet. Ledger drafts from merged PRs — merge it first, or paste the issue it fixes.")
      expect(Writeup.count).to eq(0)
      expect(DraftRequest.count).to eq(0)
      expect(WebMock).not_to have_requested(:post, 'https://api.anthropic.com/v1/messages')
    end

    it "doesn't draft someone else's merged PR, and says so with their login" do
      stub_pr(2, body: merged_pr(number: 2, user_id: 2002, login: 'someone-else'))
      stub_reviews(2)

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/2' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to eq("This PR was authored by someone-else and you didn't review it, so Ledger can't draft it as your work.")
      expect(Writeup.count).to eq(0)
      expect(DraftRequest.count).to eq(0)
    end

    it "doesn't draft an issue the user never touched" do
      stub_repository
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/issues/5')
        .to_return(status: 200, body: { title: 'Bug', body: 'x', created_at: '2026-09-01T00:00:00Z', user: { id: 2002, login: 'someone-else' } }.to_json,
                   headers: { 'Content-Type' => 'application/json' })
      stub_comments(5, [])

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/issues/5' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to eq("You didn't open or comment on this issue, so Ledger can't confirm you worked on it.")
      expect(Writeup.count).to eq(0)
      expect(DraftRequest.count).to eq(0)
    end

    it 'returns the install-flow response for a private repo with no app installation' do
      stub_pr(6, body: merged_pr(number: 6), private_repo: true)
      stub_installation_missing('acme', 'checkout')

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/6' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['failureCode']).to eq('app_not_installed')
      expect(json['installUrl']).to be_present
      expect(Writeup.count).to eq(0)

      # The writeup created to attach evidence to is destroyed right away, so
      # the signed state carries the pasted URL instead of a writeup id —
      # GithubApp::SetupsController sends the person back to New write-up
      # with it refilled, not to an editor that no longer exists.
      state = URI.decode_www_form(URI.parse(json['installUrl']).query).to_h['state']
      payload = GithubApp.verify_setup_state(state)
      expect(payload['user_id']).to eq(user.id)
      expect(payload['draft_url']).to eq('https://github.com/acme/checkout/pull/6')
      expect(payload).not_to have_key('writeup_id')
    end

    it 'rejects a non-GitHub-PR-or-issue URL without touching GitHub' do
      post_json '/api/v1/drafts', params: { url: 'https://example.com/whatever' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to eq('Paste a GitHub pull request or issue link.')
      expect(WebMock).not_to have_requested(:get, %r{api\.github\.com})
    end
  end

  describe 'POST /api/v1/drafts — Anthropic not configured' do
    it 'fails fast with no job enqueued and no cap usage when ANTHROPIC_API_KEY is unset' do
      ENV.delete('ANTHROPIC_API_KEY')
      stub_pr(60, body: merged_pr(number: 60))
      stub_reviews(60, [])
      stub_comments(60, [])

      expect do
        post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/60', template: 'incident' }
      end.not_to have_enqueued_job(DraftFromSourceJob)

      expect(response).to have_http_status(:service_unavailable)
      expect(json['status']).to eq('failed')
      expect(json['error']).to eq('Drafting is unavailable right now. Start from a template.')
      dr = DraftRequest.find(json['draftId'])
      expect(dr.counts_toward_cap).to be false
      expect(dr.writeup_id).to be_present
      expect(Writeup.exists?(dr.writeup_id)).to be true
    end
  end

  describe 'POST /api/v1/drafts — private repo consent' do
    before do
      stub_pr(10, body: merged_pr(number: 10), private_repo: true)
      stub_installation_found('acme', 'checkout')
      stub_installation_token
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/10')
        .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 200, body: merged_pr(number: 10).to_json, headers: { 'Content-Type' => 'application/json' })
    end

    it 'requires consent and drafts nothing yet' do
      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/10' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['code']).to eq('consent_required')
      expect(Writeup.count).to eq(0)
      expect(DraftRequest.count).to eq(0)
    end

    it 'proceeds once consent is on record' do
      user.update!(private_drafting_consent_at: Time.current)
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/10/reviews')
        .with(query: hash_including({}), headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 200, body: [].to_json, headers: { 'Content-Type' => 'application/json' })
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/issues/10/comments')
        .with(query: hash_including({}), headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 200, body: [].to_json, headers: { 'Content-Type' => 'application/json' })

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/10', template: 'incident' }

      expect(response).to have_http_status(:accepted)
      expect(json['status']).to eq('drafting')
      expect(DraftRequest.last.drafted_from_private).to be true
    end

    it 'requires consent again once withdrawn' do
      user.update!(private_drafting_consent_at: Time.current)
      delete_json '/api/v1/me/private_drafting_consent'

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/10' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['code']).to eq('consent_required')
    end
  end

  describe 'POST /api/v1/drafts — empty source' do
    before do
      stub_pr(20, body: merged_pr(number: 20, body: ''))
      stub_reviews(20, [])
      stub_comments(20, [])
    end

    it 'creates a blank draft with evidence attached, no LLM call, when a template is given' do
      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/20', template: 'incident' }

      expect(response).to have_http_status(:created)
      expect(json['status']).to eq('ready')
      writeup = Writeup.find(json['writeupId'])
      expect(writeup.evidence.count).to eq(1)
      expect(writeup.title).to eq('')
      dr = DraftRequest.find(json['draftId'])
      expect(dr.counts_toward_cap).to be false
      expect(WebMock).not_to have_requested(:post, 'https://api.anthropic.com/v1/messages')
    end

    it 'asks for a template instead of drafting, with no writeup left behind, when none is given' do
      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/20' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['status']).to eq('needs_template')
      expect(json['note']).to eq('Not enough in the source to draft from — pick a template')
      expect(Writeup.count).to eq(0)
      dr = DraftRequest.last
      expect(dr.status).to eq('needs_template')
      expect(dr.counts_toward_cap).to be false
      expect(dr.writeup_id).to be_nil
    end
  end

  describe 'POST /api/v1/drafts — a real draft job' do
    it 'enqueues DraftFromSourceJob and returns drafting' do
      stub_pr(30, body: merged_pr(number: 30))
      stub_reviews(30, [])
      stub_comments(30, [])

      expect do
        post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/30', template: 'incident' }
      end.to have_enqueued_job(DraftFromSourceJob)

      expect(response).to have_http_status(:accepted)
      expect(json['status']).to eq('drafting')
      expect(DraftRequest.last.writeup).to be_present
    end
  end

  describe 'POST /api/v1/drafts — dedup' do
    it 'returns the existing in-flight request for the same URL instead of starting another' do
      writeup = create(:writeup, user: user)
      existing = create(:draft_request, user: user, writeup: writeup, source_url: 'https://github.com/acme/checkout/pull/40', status: 'drafting')

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/40' }

      expect(response).to have_http_status(:accepted)
      expect(json['draftId']).to eq(existing.id.to_s)
      expect(Writeup.count).to eq(1)
      expect(WebMock).not_to have_requested(:get, %r{api\.github\.com})
    end

    it 'starts a new one for a stale in-flight request' do
      writeup = create(:writeup, user: user)
      create(:draft_request, user: user, writeup: writeup, source_url: 'https://github.com/acme/checkout/pull/41', status: 'drafting', created_at: 4.minutes.ago)
      stub_pr(41, body: merged_pr(number: 41))
      stub_reviews(41, [])
      stub_comments(41, [])

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/41', template: 'incident' }

      expect(response).to have_http_status(:accepted)
      expect(DraftRequest.count).to eq(2)
    end
  end

  describe 'POST /api/v1/drafts — daily cap' do
    it 'is enforced from draft_requests, not per IP, and includes resetAt' do
      10.times { |i| create(:draft_request, user: user, writeup: create(:writeup, user: user), source_url: "https://github.com/acme/checkout/pull/#{100 + i}", status: 'ready', counts_toward_cap: true, created_at: i.hours.ago) }

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/999' }

      expect(response).to have_http_status(:too_many_requests)
      expect(json['resetAt']).to be_present
      expect(WebMock).not_to have_requested(:get, %r{api\.github\.com})
    end

    it 'does not count needs_template, empty-source, or failed drafts toward the cap' do
      create_list(:draft_request, 10, user: user, writeup: nil, source_url: 'https://github.com/acme/checkout/pull/1', status: 'needs_template', counts_toward_cap: false)
      stub_pr(50, body: merged_pr(number: 50, body: ''))
      stub_reviews(50, [])
      stub_comments(50, [])

      post_json '/api/v1/drafts', params: { url: 'https://github.com/acme/checkout/pull/50', template: 'incident' }

      expect(response).to have_http_status(:created)
    end
  end

  describe 'GET /api/v1/drafts/:id' do
    it 'is scoped to the current user' do
      other = create(:user, github_id: 2002, github_login: 'someone-else')
      dr = create(:draft_request, user: other, writeup: create(:writeup, user: other))

      get "/api/v1/drafts/#{dr.id}"

      expect(response).to have_http_status(:not_found)
    end

    it 'fails a stale drafting request as interrupted, keeping the writeup' do
      writeup = create(:writeup, user: user)
      dr = create(:draft_request, user: user, writeup: writeup, status: 'drafting', created_at: 4.minutes.ago)

      get "/api/v1/drafts/#{dr.id}"

      expect(response).to have_http_status(:ok)
      expect(json['status']).to eq('failed')
      expect(json['error']).to eq(DraftRequest::INTERRUPTED_MESSAGE)
      expect(json['writeupId']).to eq(writeup.id.to_s)
      expect(dr.reload.counts_toward_cap).to be false
    end
  end
end
