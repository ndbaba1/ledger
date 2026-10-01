require 'rails_helper'

RSpec.describe GithubSourceContext do
  let(:user) { create(:user, github_id: 1001, github_login: 'octocat', github_token: 'gho_test') }
  let(:writeup) { create(:writeup, user: user) }

  before { stub_repository }

  def stub_pr(number, body:)
    stub_request(:get, "https://api.github.com/repos/acme/checkout/pulls/#{number}")
      .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_issue(number, body:)
    stub_request(:get, "https://api.github.com/repos/acme/checkout/issues/#{number}")
      .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_comments(number, comments)
    stub_request(:get, "https://api.github.com/repos/acme/checkout/issues/#{number}/comments")
      .with(query: hash_including({}))
      .to_return(status: 200, body: comments.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_reviews(number, reviews)
    stub_request(:get, "https://api.github.com/repos/acme/checkout/pulls/#{number}/reviews")
      .with(query: hash_including({}))
      .to_return(status: 200, body: reviews.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def stub_repository(owner: 'acme', repo: 'checkout', private_repo: false)
    stub_request(:get, "https://api.github.com/repos/#{owner}/#{repo}")
      .to_return(status: 200, body: { private: private_repo }.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  def pr_body(number:, title: 'Fix the thing', body: 'Some body text', user_id: 2002, login: 'someone-else', merged_at: '2026-09-20T10:00:00Z')
    { number: number, title: title, body: body, created_at: '2026-09-19T10:00:00Z', merged_at: merged_at,
      user: { id: user_id, login: login }, base: { repo: { private: false } } }
  end

  describe '#call on a PR' do
    it 'labels the PR, drops bot comments, and marks the user’s own comment' do
      stub_pr(42, body: pr_body(number: 42))
      stub_reviews(42, [{ state: 'APPROVED', body: 'Looks good', submitted_at: '2026-09-19T12:00:00Z', user: { id: 1001, login: 'octocat' } }])
      stub_comments(42, [
        { id: 1, body: 'LGTM', created_at: '2026-09-19T13:00:00Z', user: { id: 1001, login: 'octocat' } },
        { id: 2, body: 'CI results', created_at: '2026-09-19T13:05:00Z', user: { id: 9, login: 'ci[bot]', type: 'Bot' } }
      ])

      result = described_class.new(writeup, 'https://github.com/acme/checkout/pull/42', user).call

      expect(result.text).to include('[PR #42]', 'Fix the thing', 'Some body text')
      expect(result.text).to include('[REVIEW by octocat (you)]', 'Looks good')
      expect(result.text).to include('[COMMENT by octocat (you)]', 'LGTM')
      expect(result.text).not_to include('CI results', 'ci[bot]')
      expect(result.labels).to include('PR #42', 'REVIEW by octocat (you)', 'COMMENT by octocat (you)')
    end

    it 'includes a linked issue referenced by a closing keyword, read-only (not added as evidence)' do
      stub_pr(42, body: pr_body(number: 42, body: 'Fixes #12 for real this time'))
      stub_reviews(42, [])
      stub_comments(42, [])
      stub_issue(12, body: { title: 'Checkout crashes', body: 'Steps to repro', created_at: '2026-09-01T00:00:00Z', user: { id: 2002, login: 'someone-else' } })

      result = described_class.new(writeup, 'https://github.com/acme/checkout/pull/42', user).call

      expect(result.text).to include('[ISSUE #12]', 'Checkout crashes', 'Steps to repro')
      expect(writeup.evidence.count).to eq(0)
    end

    it 'never requests diff/file endpoints' do
      stub_pr(42, body: pr_body(number: 42))
      stub_reviews(42, [])
      stub_comments(42, [])

      described_class.new(writeup, 'https://github.com/acme/checkout/pull/42', user).call

      expect(WebMock).not_to have_requested(:get, %r{/pulls/42/files})
      expect(WebMock).not_to have_requested(:get, %r{/pulls/42/comments\z})
    end

    it 'keeps the main body whole and trims the oldest comments first when over the cap' do
      stub_pr(42, body: pr_body(number: 42, body: 'X' * 1_000))
      stub_reviews(42, [])
      old_comment = { id: 1, body: 'O' * 20_000, created_at: '2026-09-01T00:00:00Z', user: { id: 1001, login: 'octocat' } }
      new_comment = { id: 2, body: 'N' * 20_000, created_at: '2026-09-19T00:00:00Z', user: { id: 1001, login: 'octocat' } }
      stub_comments(42, [old_comment, new_comment])

      result = described_class.new(writeup, 'https://github.com/acme/checkout/pull/42', user).call

      expect(result.text.length).to be <= GithubSourceContext::CAP
      expect(result.text).to include('X' * 1_000)
      expect(result.text).not_to include('O' * 20_000)
      expect(result.text).to include('N' * 20_000)
    end
  end

  describe '#call blank?' do
    it 'is true when the body is empty and there are no meaningful comments, even though the title is always present' do
      stub_pr(45, body: pr_body(number: 45, body: ''))
      stub_reviews(45, [])
      stub_comments(45, [])

      result = described_class.new(writeup, 'https://github.com/acme/checkout/pull/45', user).call

      expect(result.blank?).to be true
    end

    it 'is false once a review or comment has content, even if the body is empty' do
      stub_pr(46, body: pr_body(number: 46, body: ''))
      stub_reviews(46, [{ state: 'APPROVED', body: 'Nice work', submitted_at: '2026-09-19T12:00:00Z', user: { id: 1001, login: 'octocat' } }])
      stub_comments(46, [])

      result = described_class.new(writeup, 'https://github.com/acme/checkout/pull/46', user).call

      expect(result.blank?).to be false
    end
  end

  describe '#likely_empty? on a PR' do
    it 'is true when the body is blank and there are no meaningful comments' do
      stub_pr(43, body: pr_body(number: 43, body: ''))
      stub_reviews(43, [])
      stub_comments(43, [{ id: 1, body: '', created_at: '2026-09-19T13:00:00Z', user: { id: 9, login: 'ci[bot]', type: 'Bot' } }])

      expect(described_class.new(writeup, 'https://github.com/acme/checkout/pull/43', user).likely_empty?).to be true
    end

    it 'is false once there is a real comment' do
      stub_pr(44, body: pr_body(number: 44, body: ''))
      stub_reviews(44, [])
      stub_comments(44, [{ id: 1, body: 'Here is context', created_at: '2026-09-19T13:00:00Z', user: { id: 1001, login: 'octocat' } }])

      expect(described_class.new(writeup, 'https://github.com/acme/checkout/pull/44', user).likely_empty?).to be false
    end
  end

  describe '#call on an issue with a linked PR' do
    def stub_timeline(number, events)
      stub_request(:get, "https://api.github.com/repos/acme/checkout/issues/#{number}/timeline")
        .with(query: hash_including({}))
        .to_return(status: 200, body: events.to_json, headers: { 'Content-Type' => 'application/json' })
    end

    let(:cross_ref_event) do
      { event: 'cross-referenced',
        source: { issue: { number: 99, pull_request: { url: 'x' }, repository: { name: 'checkout', owner: { login: 'acme' } } } } }
    end

    it "includes a linked merged PR authored by the user, and attaches it as evidence" do
      stub_issue(80, body: { title: 'Flaky test', body: 'It fails sometimes', created_at: '2026-09-01T00:00:00Z', user: { id: 2002, login: 'someone-else' } })
      stub_comments(80, [])
      stub_timeline(80, [cross_ref_event])
      stub_pr(99, body: pr_body(number: 99, title: 'Fix flaky test', body: 'Added a retry', user_id: 1001, login: 'octocat'))
      stub_reviews(99, [])
      stub_comments(99, [])

      result = described_class.new(writeup, 'https://github.com/acme/checkout/issues/80', user).call

      expect(result.text).to include('[PR #99]', 'Fix flaky test', 'Added a retry')
      evidence = writeup.evidence.find_by(url: 'https://github.com/acme/checkout/pull/99')
      expect(evidence).to be_present
      expect(evidence.verified?).to be true
    end

    it "attaches but excludes the content of a linked PR that isn't merged/authored/reviewed by the user" do
      stub_issue(80, body: { title: 'Flaky test', body: 'It fails sometimes', created_at: '2026-09-01T00:00:00Z', user: { id: 2002, login: 'someone-else' } })
      stub_comments(80, [])
      stub_timeline(80, [cross_ref_event])
      stub_pr(99, body: pr_body(number: 99, title: 'Someone else’s fix', user_id: 2002, login: 'someone-else'))
      stub_reviews(99, [])

      result = described_class.new(writeup, 'https://github.com/acme/checkout/issues/80', user).call

      expect(result.text).not_to include('Someone else’s fix')
      evidence = writeup.evidence.find_by(url: 'https://github.com/acme/checkout/pull/99')
      expect(evidence).to be_present
      expect(evidence.verified?).to be false
    end
  end
end
