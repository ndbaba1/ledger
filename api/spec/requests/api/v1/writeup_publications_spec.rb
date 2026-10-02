require 'rails_helper'

RSpec.describe 'POST /api/v1/writeups/:id/publish', type: :request do
  let(:user) { create(:user, github_id: 1001, github_login: 'octocat', github_token: 'gho_test') }

  before { sign_in_as(user) }

  it 'refuses to publish with missing requirements, listing what is missing' do
    writeup = create(:writeup, user: user, title: '', fields: { 'symptom' => '', 'rootCause' => '', 'fix' => '' })

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:unprocessable_content)
    expect(json['error']).to include('A title', 'Problem', 'Root cause', 'Solution', 'At least one piece of evidence EngLog could check with GitHub.')
  end

  it 'blocks publishing when the only evidence is an unverified PR or a plain link' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    create(:evidence, writeup: writeup, kind: 'github_pr', authored_by_user: false, repo: 'acme/checkout')
    create(:evidence, writeup: writeup, kind: 'link', key: 'S2', url: 'https://example.com/notes')

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:unprocessable_content)
    expect(json['error']).to include('At least one piece of evidence EngLog could check with GitHub.')
  end

  it 'publishes an incident whose only verified evidence is a participated-in issue' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    create(:evidence, writeup: writeup, kind: 'github_issue', repo: 'acme/checkout', snapshot: { 'participated' => true })

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:created)
  end

  it 'still requires a verified PR specifically for a design, not just any evidence' do
    writeup = create(:writeup, :design, user: user, status: 'shipped',
                                fields: { 'symptom' => 'Stop noisy tenants.', 'rootCause' => 'Rate limit at the edge.',
                                          'fix' => 'Rolled out to 100%.', 'result' => { 'label' => 'p99', 'before' => '310ms', 'after' => '40ms' } })
    create(:evidence, writeup: writeup, kind: 'github_issue', repo: 'acme/checkout',
                       url: 'https://github.com/acme/checkout/issues/1', snapshot: { 'participated' => true })

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:unprocessable_content)
    expect(json['error']).to include('At least one piece of evidence EngLog could check with GitHub.')

    create(:evidence, writeup: writeup, key: 'S2', kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout')
    post_json "/api/v1/writeups/#{writeup.id}/publish"
    expect(response).to have_http_status(:created)
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

  it 'attaching a merged PR through the real evidence endpoint, then publishing, produces an Authored & merged badge' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')

    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/9')
      .to_return(status: 200, body: {
        title: 'Revert pool size', merged_at: '2026-09-20T10:00:00Z',
        user: { id: 1001, login: 'octocat' }, additions: 5, deletions: 5,
        base: { repo: { private: false } }
      }.to_json, headers: { 'Content-Type' => 'application/json' })

    post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/9' }
    expect(json['evidence'].last).to include('status' => 'fetched', 'authoredByMe' => true)

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:created)
    expect(json['badges']).to include(hash_including('label' => 'Authored & merged the fix'))

    get "/api/v1/users/#{user.handle}"
    verified = json['posts'].flat_map { |p| p['badges'] }.count { |b| b['verified'] }
    expect(verified).to eq(1)
  end

  it 'republishing a post with attached PR evidence does not raise an unknown attribute error' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    create(:evidence, writeup: writeup, kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout')
    post_json "/api/v1/writeups/#{writeup.id}/publish"
    expect(response).to have_http_status(:created)

    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/42')
      .to_return(status: 200, body: {
        title: 'Revert pool size', merged_at: '2026-09-01T00:00:00Z',
        user: { id: user.github_id, login: user.github_login }, additions: 5, deletions: 5,
        base: { repo: { private: false } }
      }.to_json, headers: { 'Content-Type' => 'application/json' })

    post_json "/api/v1/writeups/#{writeup.id}/publish", params: { summary: 'Fixed a typo' }

    expect(response).to have_http_status(:ok)
  end

  it 'republishing requires a "what changed" summary, keeps the same slug and records a revision' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    create(:evidence, writeup: writeup, kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout')
    post_json "/api/v1/writeups/#{writeup.id}/publish"
    first_slug = json['slug']

    post_json "/api/v1/writeups/#{writeup.id}/publish"
    expect(response).to have_http_status(:unprocessable_content)
    expect(json['error']).to match(/what changed/i)

    writeup.update!(fields: writeup.fields.merge('fix' => 'Derived pool size from worker count instead.'))
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/42')
      .to_return(status: 200, body: {
        title: 'Revert pool size', merged_at: '2026-09-01T00:00:00Z',
        user: { id: user.github_id, login: user.github_login }, additions: 5, deletions: 5,
        base: { repo: { private: false } }
      }.to_json, headers: { 'Content-Type' => 'application/json' })
    post_json "/api/v1/writeups/#{writeup.id}/publish", params: { summary: 'Clarified the fix' }

    expect(response).to have_http_status(:ok)
    expect(json['slug']).to eq(first_slug)
    expect(Post.count).to eq(1)
    expect(json['revisions'].length).to eq(1)
    expect(json['revisions'].first).to include('summary' => 'Clarified the fix')
    expect(json['revisions'].first['createdAt']).to be_present

    post = Post.find_by(slug: first_slug)
    expect(post.revisions.count).to eq(1)
    expect(post.revisions.first.summary).to eq('Clarified the fix')
  end

  it 'keeps the badge and sets a refresh_warning, visible on the write-up, when re-checking fails temporarily' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    create(:evidence, writeup: writeup, kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout')
    post_json "/api/v1/writeups/#{writeup.id}/publish"

    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/42').to_return(status: 401)

    post_json "/api/v1/writeups/#{writeup.id}/publish", params: { summary: 'Fixed a typo' }

    expect(response).to have_http_status(:ok)
    expect(json['badges']).to include(hash_including('label' => 'Authored & merged the fix'))

    get "/api/v1/writeups/#{writeup.id}"
    evidence = json['evidence'].first
    expect(evidence['refreshWarning']).to eq('Your GitHub sign-in expired — sign in again.')
    expect(evidence['authoredByMe']).to eq(true)
  end

  it 'rejects a change summary over 140 characters' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    create(:evidence, writeup: writeup, kind: 'github_pr', authored_by_user: true, repo: 'acme/checkout')
    post_json "/api/v1/writeups/#{writeup.id}/publish"

    post_json "/api/v1/writeups/#{writeup.id}/publish", params: { summary: 'x' * 141 }
    expect(response).to have_http_status(:unprocessable_content)
    expect(json['error']).to match(/140 characters/)
  end

  it 'publishes a verified private PR with a redacted public badge — no url, title or repo' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')

    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/90')
      .to_return(status: 200, body: {
        title: 'Revert pool size', merged_at: '2026-09-20T10:00:00Z',
        user: { id: 1001, login: 'octocat' }, additions: 5, deletions: 5,
        base: { repo: { private: true } }
      }.to_json, headers: { 'Content-Type' => 'application/json' })
    stub_installation_found('acme', 'checkout')
    stub_installation_token
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/90')
      .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
      .to_return(status: 200, body: {
        title: 'Revert pool size', merged_at: '2026-09-20T10:00:00Z',
        user: { id: 1001, login: 'octocat' }, additions: 5, deletions: 5,
        base: { repo: { private: true } }
      }.to_json, headers: { 'Content-Type' => 'application/json' })

    post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/90' }
    evidence = json['evidence'].last
    expect(evidence['private']).to be true
    expect(evidence['title']).to include('Revert pool size')

    post_json "/api/v1/writeups/#{writeup.id}/publish"

    expect(response).to have_http_status(:created)
    badge = json['badges'].first
    expect(badge['label']).to eq('Authored & merged the fix')
    expect(badge['detail']).to eq('private GitHub project · Sep 2026')
    expect(badge).not_to have_key('url')
    expect(json.to_s).not_to include('Revert pool size')
    expect(json.to_s).not_to include('acme/checkout')
  end

  it 'republishing after the app is uninstalled keeps the badge and sets a refresh_warning' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')

    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/91')
      .to_return(status: 200, body: {
        title: 'Revert pool size', merged_at: '2026-09-20T10:00:00Z',
        user: { id: 1001, login: 'octocat' }, additions: 5, deletions: 5,
        base: { repo: { private: true } }
      }.to_json, headers: { 'Content-Type' => 'application/json' })
    stub_installation_found('acme', 'checkout')
    stub_installation_token
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/91')
      .with(headers: { 'Authorization' => 'Bearer ghs_installation_token' })
      .to_return(status: 200, body: {
        title: 'Revert pool size', merged_at: '2026-09-20T10:00:00Z',
        user: { id: 1001, login: 'octocat' }, additions: 5, deletions: 5,
        base: { repo: { private: true } }
      }.to_json, headers: { 'Content-Type' => 'application/json' })
    post_json "/api/v1/writeups/#{writeup.id}/evidence", params: { url: 'https://github.com/acme/checkout/pull/91' }

    post_json "/api/v1/writeups/#{writeup.id}/publish"
    expect(json['badges']).to include(hash_including('label' => 'Authored & merged the fix'))

    # The repo is still private and the app is gone — the OAuth client 404s
    # (as it always would for a private repo) and now so does GithubApp.
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/91')
      .to_return(status: 404, body: { message: 'Not Found' }.to_json, headers: { 'Content-Type' => 'application/json' })
    stub_installation_missing('acme', 'checkout')

    post_json "/api/v1/writeups/#{writeup.id}/publish", params: { summary: 'Fixed a typo' }

    expect(response).to have_http_status(:ok)
    expect(json['badges']).to include(hash_including('label' => 'Authored & merged the fix'))

    get "/api/v1/writeups/#{writeup.id}"
    evidence = json['evidence'].first
    expect(evidence['refreshWarning']).to eq('The EngLog app was removed from acme. Badge kept from Sep 2026.')
    expect(evidence['authoredByMe']).to eq(true)
  end

  it 'drops a badge that no longer verifies on republish, but still publishes' do
    writeup = create(:writeup, user: user, title: 'Checkout p99 latency spike')
    evidence = create(:evidence, writeup: writeup, kind: 'github_pr', authored_by_user: true,
                                  repo: 'acme/checkout', number: 9, url: 'https://github.com/acme/checkout/pull/9',
                                  snapshot: { 'reviewed' => false })
    post_json "/api/v1/writeups/#{writeup.id}/publish"
    expect(json['badges']).to include(hash_including('label' => 'Authored & merged the fix'))

    # The PR is now reported as unmerged — the badge should drop, not block the republish.
    stub_request(:get, 'https://api.github.com/repos/acme/checkout/pulls/9')
      .to_return(status: 200, body: {
        title: evidence.title, merged_at: nil,
        user: { id: user.github_id, login: user.github_login }, additions: 5, deletions: 5,
        base: { repo: { private: false } }
      }.to_json, headers: { 'Content-Type' => 'application/json' })

    post_json "/api/v1/writeups/#{writeup.id}/publish", params: { summary: 'Reworded the summary' }

    expect(response).to have_http_status(:ok)
    expect(json['badges'] || []).not_to include(hash_including('label' => 'Authored & merged the fix'))
    expect(json['droppedBadges']).to include(evidence.title)
  end
end
