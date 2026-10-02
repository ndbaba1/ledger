require 'rails_helper'

RSpec.describe 'Writeup evidence API', type: :request do
  let(:user) { create(:user, github_id: 1001, github_login: 'octocat', github_token: 'gho_test') }
  let(:writeup) { create(:writeup, user: user) }

  before { sign_in_as(user) }

  def stub_pull_request(number, body: {}, status: 200)
    stub_request(:get, "https://api.github.com/repos/acme/checkout/pulls/#{number}")
      .to_return(status: status, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_reviews(number, reviews = [])
    stub_request(:get, "https://api.github.com/repos/acme/checkout/pulls/#{number}/reviews")
      .with(query: { 'per_page' => '100' })
      .to_return(status: 200, body: reviews.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def pr_body(user_id:, login:, merged_at: '2026-09-20T10:00:00Z', created_at: '2026-09-19T10:00:00Z', private_repo: false)
    {
      title: 'Revert pool size', merged_at: merged_at, created_at: created_at,
      user: { id: user_id, login: login }, additions: 5, deletions: 5,
      base: { repo: { private: private_repo } }
    }
  end

  describe 'POST /api/v1/writeups/:id/evidence — pull requests' do
    it 'verifies a merged PR authored by the signed-in user (matched by id)' do
      stub_pull_request(42, body: pr_body(user_id: 1001, login: 'octocat'))

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/42' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['kind']).to eq('github_pr')
      expect(evidence['status']).to eq('fetched')
      expect(evidence['authoredByMe']).to be true
      expect(evidence).not_to have_key('failureReason')
    end

    it "does not credit a same-named-but-different account (renamed login, different id)" do
      # Someone else now has the login "octocat" — must not be confused with our user by name alone.
      stub_pull_request(43, body: pr_body(user_id: 999_999, login: 'octocat'))
      stub_reviews(43)

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/43' }

      evidence = json['evidence'].last
      expect(evidence['authoredByMe']).to be false
      expect(evidence['failureReason']).to eq("Authored by octocat, and not approved by you — you're signed in as octocat.")
    end

    it 'explains a merged PR authored by someone else' do
      stub_pull_request(50, body: pr_body(user_id: 2002, login: 'someone-else'))
      stub_reviews(50)

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/50' }

      evidence = json['evidence'].last
      expect(evidence['authoredByMe']).to be false
      expect(evidence['failureReason']).to eq("Authored by someone-else, and not approved by you — you're signed in as octocat.")
    end

    it 'explains a PR by the signed-in user that is not merged yet' do
      stub_pull_request(51, body: pr_body(user_id: 1001, login: 'octocat', merged_at: nil))
      stub_reviews(51)

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/51' }

      evidence = json['evidence'].last
      expect(evidence['authoredByMe']).to be false
      expect(evidence['failureReason']).to eq('Not merged yet.')
    end

    it 'does not award the reviewed badge for an approval on an unmerged PR' do
      writeup.update!(title: 'Checkout p99 latency spike')
      create(:evidence, writeup: writeup, key: 'S1', kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout')
      stub_pull_request(52, body: pr_body(user_id: 2002, login: 'someone-else', merged_at: nil))
      stub_reviews(52, [{ state: 'APPROVED', user: { id: 1001, login: 'octocat' } }])

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/52' }
      evidence = json['evidence'].last
      expect(evidence['authoredByMe']).to be false
      expect(evidence['failureReason']).to eq('Not merged yet.')

      post_json "/api/v1/writeups/#{writeup.id}/publish"
      expect(json['badges'].length).to eq(1)
    end

    it 'awards the reviewed badge once the approved PR is merged' do
      stub_pull_request(53, body: pr_body(user_id: 2002, login: 'someone-else'))
      stub_reviews(53, [{ state: 'APPROVED', user: { id: 1001, login: 'octocat' } }])

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/53' }

      evidence = json['evidence'].last
      expect(evidence['authoredByMe']).to be false
      expect(evidence).not_to have_key('failureReason')
    end

    it 'fetches a private repo fine but asks GithubApp before trusting anything about it' do
      stub_pull_request(60, body: pr_body(user_id: 1001, login: 'octocat', private_repo: true))
      stub_installation_missing('acme', 'checkout')

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/60' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['status']).to eq('failed')
      expect(evidence['failureCode']).to eq('app_not_installed')
      expect(evidence['title']).to eq('GitHub PR #60')
      expect(evidence['title']).not_to include('Revert pool size')
      expect(evidence['detail']).to eq('')
    end

    it 'asks GithubApp when the OAuth client 404s (typical for a private repo it cannot see)' do
      stub_request(:get, 'https://api.github.com/repos/acme/private-repo/pulls/7')
        .to_return(status: 404, body: { message: 'Not Found' }.to_json, headers: { 'Content-Type' => 'application/json' })
      stub_installation_missing('acme', 'private-repo')

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/private-repo/pull/7' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['status']).to eq('failed')
      expect(evidence['detail']).to eq('')
      expect(evidence['failureCode']).to eq('app_not_installed')
      expect(evidence['failureReason']).to eq("EngLog can't see this repo. Install the EngLog app on acme to verify private work.")
      expect(evidence['installUrl']).to start_with("https://github.com/apps/#{GithubApp::SLUG}/installations/new")
      expect(evidence['owner']).to eq('acme')
    end

    it 'reports an expired GitHub sign-in' do
      stub_pull_request(61, status: 401, body: { message: 'Bad credentials' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/61' }

      evidence = json['evidence'].last
      expect(evidence['status']).to eq('failed')
      expect(evidence['failureReason']).to eq('Your GitHub sign-in expired — sign in again.')
    end

    it 'reports GitHub refusing the request' do
      stub_pull_request(62, status: 403, body: { message: 'rate limited' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/62' }

      evidence = json['evidence'].last
      expect(evidence['failureReason']).to eq('GitHub refused the request — try again shortly, or sign in again.')
    end

    it 'accepts www.github.com and normalizes to the canonical URL, ignoring a trailing /files' do
      stub_pull_request(63, body: pr_body(user_id: 1001, login: 'octocat'))

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://www.github.com/acme/checkout/pull/63/files?diff=split#comment' }

      evidence = json['evidence'].last
      expect(evidence['url']).to eq('https://github.com/acme/checkout/pull/63')
    end
  end

  describe 'POST /api/v1/writeups/:id/evidence — private repos with the GitHub App installed' do
    it 'verifies a merged private PR you authored, with a lock-worthy real title and a private badge detail' do
      stub_pull_request(70, body: pr_body(user_id: 1001, login: 'octocat', private_repo: true))
      stub_installation_found('acme', 'checkout')
      stub_installation_token
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/70')
        .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 200, body: pr_body(user_id: 1001, login: 'octocat').to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/70' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['status']).to eq('fetched')
      expect(evidence['authoredByMe']).to be true
      expect(evidence['private']).to be true
      expect(evidence['title']).to include('Revert pool size')
      expect(evidence['detail']).to match(/private GitHub project/)
      expect(evidence).not_to have_key('failureReason')
    end

    it "does not verify someone else's private PR, and stores no title" do
      stub_pull_request(71, body: pr_body(user_id: 1001, login: 'octocat', private_repo: true))
      stub_installation_found('acme', 'checkout')
      stub_installation_token
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/71')
        .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 200, body: pr_body(user_id: 2002, login: 'someone-else').to_json, headers: { 'Content-Type' => 'application/json' })
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/71/reviews')
        .with(query: { 'per_page' => '100' }, headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 200, body: [].to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/71' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['status']).to eq('failed')
      expect(evidence['failureReason']).to eq("You didn't author or approve this PR.")
      expect(evidence['title']).to eq('GitHub PR #71')
      expect(evidence['title']).not_to include('Revert pool size')
      expect(evidence['detail']).to eq('')
    end

    it "installed on the owner but not shared with this repo → failed evidence, not a 500" do
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/72')
        .to_return(status: 404, body: { message: 'Not Found' }.to_json, headers: { 'Content-Type' => 'application/json' })
      stub_installation_found('acme', 'checkout')
      stub_installation_token
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/72')
        .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 404, body: { message: 'Not Found' }.to_json, headers: { 'Content-Type' => 'application/json' })
      stub_request(:get, 'https://api.github.com/app/installations/4242')
        .to_return(status: 200, body: { id: 4242, account: { login: 'acme', type: 'Organization' } }.to_json,
                   headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/72' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['status']).to eq('failed')
      expect(evidence['failureCode']).to eq('repo_not_in_installation')
      expect(evidence['failureReason']).to eq("EngLog's app is installed on acme but can't see this repo. Add it under Repository access.")
      expect(evidence['installUrl']).to start_with('https://github.com/organizations/acme/settings/installations/4242')
      expect(evidence['title']).to eq('GitHub PR #72')
    end
  end

  describe 'POST /api/v1/writeups/:id/evidence — safety net' do
    it "422s instead of 500ing when an Octokit error the verifier doesn't specifically handle escapes it" do
      allow_any_instance_of(GithubEvidenceVerifier).to receive(:call).and_raise(Octokit::Error.new)

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/1' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to eq("Couldn't check that link with GitHub. Try again.")
    end
  end

  describe 'POST /api/v1/writeups/:id/evidence/:key/recheck' do
    it 're-runs the verifier once the app has been installed since' do
      stub_pull_request(72, body: pr_body(user_id: 1001, login: 'octocat', private_repo: true))
      stub_installation_missing('acme', 'checkout')
      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/72' }
      key = json['evidence'].last['key']
      expect(json['evidence'].last['failureCode']).to eq('app_not_installed')

      stub_pull_request(72, body: pr_body(user_id: 1001, login: 'octocat', private_repo: true))
      stub_installation_found('acme', 'checkout')
      stub_installation_token
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/72')
        .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
        .to_return(status: 200, body: pr_body(user_id: 1001, login: 'octocat').to_json, headers: { 'Content-Type' => 'application/json' })

      post_json "/api/v1/writeups/#{writeup.id}/evidence/#{key}/recheck"

      expect(response).to have_http_status(:ok)
      evidence = json['evidence'].last
      expect(evidence['status']).to eq('fetched')
      expect(evidence['authoredByMe']).to be true
      expect(evidence).not_to have_key('failureCode')
    end
  end

  describe 'POST /api/v1/writeups/:id/evidence — issues' do
    def stub_repository(private_repo: false)
      stub_request(:get, 'https://api.github.com/repos/acme/checkout')
        .to_return(status: 200, body: { private: private_repo }.to_json, headers: { 'Content-Type' => 'application/json' })
    end

    it 'follows pagination to find the signed-in user’s comment on a later page' do
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/issues/80')
        .to_return(status: 200, body: { title: 'Flaky test', created_at: '2026-09-01T00:00:00Z', user: { id: 2002, login: 'someone-else' } }.to_json,
                   headers: { 'Content-Type' => 'application/json' })
      stub_repository

      page1_url = 'https://api.github.com/repos/acme/checkout/issues/80/comments?per_page=100'
      page2_url = 'https://api.github.com/repos/acme/checkout/issues/80/comments?per_page=100&page=2'
      stub_request(:get, page1_url).to_return(
        status: 200, body: [{ id: 1, user: { id: 3003, login: 'bystander' } }].to_json,
        headers: { 'Content-Type' => 'application/json', 'Link' => "<#{page2_url}>; rel=\"next\"" }
      )
      stub_request(:get, page2_url).to_return(
        status: 200, body: [{ id: 2, user: { id: 1001, login: 'octocat' } }].to_json,
        headers: { 'Content-Type' => 'application/json' }
      )

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/issues/80' }

      evidence = json['evidence'].last
      expect(evidence['kind']).to eq('github_issue')
      expect(evidence).not_to have_key('failureReason')
    end

    it 'asks GithubApp before trusting anything about a private repo behind the issue' do
      stub_request(:get, 'https://api.github.com/repos/acme/checkout/issues/81')
        .to_return(status: 200, body: { title: 'Secret bug', created_at: '2026-09-01T00:00:00Z', user: { id: 1001, login: 'octocat' } }.to_json,
                   headers: { 'Content-Type' => 'application/json' })
      stub_repository(private_repo: true)
      stub_installation_missing('acme', 'checkout')

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/issues/81' }

      evidence = json['evidence'].last
      expect(evidence['status']).to eq('failed')
      expect(evidence['failureCode']).to eq('app_not_installed')
      expect(evidence['title']).to eq('GitHub issue #81')
      expect(evidence['title']).not_to include('Secret bug')
    end
  end

  describe 'POST /api/v1/writeups/:id/evidence — plain links' do
    it 'stores a non-github link without attempting to fetch it' do
      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://docs.google.com/document/d/abc' }

      expect(response).to have_http_status(:created)
      evidence = json['evidence'].last
      expect(evidence['kind']).to eq('link')
      expect(evidence['status']).to eq('linked')
    end

    it 'rejects an unparseable url' do
      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'not a url' }
      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'rejects a javascript: url' do
      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'javascript:alert(1)' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to eq('Only http(s) links can be added.')
    end

    it 'rejects a duplicate url' do
      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://docs.google.com/document/d/abc' }
      expect(response).to have_http_status(:created)

      post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://docs.google.com/document/d/abc' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json['error']).to eq('Already added.')
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
