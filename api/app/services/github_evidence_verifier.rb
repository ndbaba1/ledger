# Turns a pasted URL into an Evidence record. GitHub PR and issue links are
# verified live against the GitHub API, using the signed-in user's own OAuth
# token (scoped to `read:user` only — see config/initializers/omniauth.rb — so
# private repos are never actually readable that way). When the OAuth token
# can't see a repo (404, or an explicit private flag), GithubApp is asked
# whether the Ledger GitHub App is installed there instead; if so, its
# installation token does the same author/approved/participated checks.
#
# Three rules this class keeps:
# - Only a definite answer from GitHub changes a badge (not merged, not yours,
#   deleted, no longer installed with a *new* definite answer). A temporary
#   failure (expired sign-in, rate limit, GitHub or network down, an
#   installation token that fails to mint) never removes a badge earned before.
# - Nothing learned from the API about a private repo is stored unless the
#   signed-in user authored, approved or participated in it themselves — and
#   even then, only the author ever sees the title. Everyone else sees a
#   generic "private GitHub project" badge.
# - A repo the app isn't installed on yet is not a failure to report loudly:
#   it's an actionable one (install_url), re-checked on demand or the moment
#   the app is installed (see Api::V1::GithubAppSetupsController).
class GithubEvidenceVerifier
  # Raised to the controller, which returns 422 with the message.
  class InvalidLink < StandardError; end
  class DuplicateLink < StandardError; end

  # A failure that says nothing about the evidence itself.
  class TemporaryFailure < StandardError; end

  GITHUB_HOST = /\A(?:www\.)?github\.com\z/i
  PR_PATH = %r{\A/(?<owner>[^/]+)/(?<repo>[^/]+)/pull/(?<number>\d+)(?:/.*)?\z}
  ISSUE_PATH = %r{\A/(?<owner>[^/]+)/(?<repo>[^/]+)/issues/(?<number>\d+)(?:/.*)?\z}

  TEMPORARY_ERRORS = [
    Octokit::Unauthorized,
    Octokit::TooManyRequests,
    Octokit::Forbidden,
    Octokit::ServerError,
    Faraday::Error,
    TemporaryFailure
  ].freeze

  APP_NOT_INSTALLED = 'app_not_installed'

  def initialize(writeup, url, user)
    @writeup = writeup
    @url = url.to_s.strip
    @user = user
  end

  # ---- adding evidence --------------------------------------------------------

  def call
    if (m = match(PR_PATH))
      reject_duplicate!(canonical_url(m, 'pull'))
      verify_pull_request(m)
    elsif (m = match(ISSUE_PATH))
      reject_duplicate!(canonical_url(m, 'issues'))
      verify_issue(m)
    else
      verify_plain_link
    end
  end

  # ---- re-checking on republish -------------------------------------------------

  # Re-checks stored GitHub evidence against GitHub's current state (a PR can be
  # reverted, a repo can go private). Never raises: a definite answer updates
  # the badge; a temporary failure keeps the previous result and sets
  # refresh_warning for the editor to show.
  def self.refresh(evidence, user)
    return unless evidence.kind.in?(%w[github_pr github_issue])

    new(evidence.writeup, evidence.url, user).refresh(evidence)
  end

  def refresh(evidence)
    if evidence.kind == 'github_pr' && (m = match(PR_PATH))
      refresh_pull_request(evidence, m)
    elsif evidence.kind == 'github_issue' && (m = match(ISSUE_PATH))
      refresh_issue(evidence, m)
    end
  end

  private

  def refresh_pull_request(evidence, m)
    nwo = "#{m[:owner]}/#{m[:repo]}"
    pr = client.pull_request(nwo, m[:number])
    return refresh_pull_request_via_app(evidence, m) if pr.base.repo.private

    merged = pr.merged_at.present?
    authored = merged && pr.user.id == @user.github_id
    reviewed = !authored && merged && approved_by_user?(nwo, m[:number])

    evidence.update!(
      status: 'fetched', authored_by_user: authored, merged_at: pr.merged_at, verified_at: Time.current,
      failure_reason: pr_badge_note(pr.user.id, pr.user.login, merged, authored, reviewed),
      failure_code: nil, refresh_warning: nil, private: false, owner: nil, install_url: nil,
      snapshot: evidence.snapshot.to_h.merge('title' => pr.title, 'mergedAt' => pr.merged_at&.iso8601, 'reviewed' => reviewed)
    )
  rescue Octokit::NotFound
    refresh_pull_request_via_app(evidence, m)
  rescue *TEMPORARY_ERRORS => e
    evidence.update!(refresh_warning: temporary_reason_for(e))
  end

  def refresh_issue(evidence, m)
    nwo = "#{m[:owner]}/#{m[:repo]}"
    return refresh_issue_via_app(evidence, m) if client.repository(nwo).private

    issue = client.issue(nwo, m[:number])
    participated = issue.user.id == @user.github_id || commented_by_user?(nwo, m[:number])

    evidence.update!(
      status: 'fetched', verified_at: Time.current,
      failure_reason: issue_badge_note(issue.user.login, participated),
      failure_code: nil, refresh_warning: nil, private: false, owner: nil, install_url: nil,
      snapshot: evidence.snapshot.to_h.merge('title' => issue.title, 'participated' => participated)
    )
  rescue Octokit::NotFound
    refresh_issue_via_app(evidence, m)
  rescue *TEMPORARY_ERRORS => e
    evidence.update!(refresh_warning: temporary_reason_for(e))
  end

  # The OAuth token can't see this repo (or it's flagged private outright) —
  # ask GithubApp whether Ledger's app is installed there and, if so, re-check
  # with its installation token. A missing installation is never treated as a
  # definite "gone": it just means we still can't look, so the previous badge
  # (if any) stands with a refresh_warning explaining why.
  def refresh_pull_request_via_app(evidence, m)
    installation_id = GithubApp.installation_for(m[:owner], m[:repo])
    return keep_badge_app_not_installed!(evidence, m[:owner]) if installation_id.nil?

    app_client = GithubApp.installation_client(installation_id)
    nwo = "#{m[:owner]}/#{m[:repo]}"
    pr = app_client.pull_request(nwo, m[:number])
    merged = pr.merged_at.present?
    authored = merged && pr.user.id == @user.github_id
    reviewed = !authored && merged && approved_by_user?(nwo, m[:number], client: app_client)

    if authored || reviewed
      evidence.update!(
        status: 'fetched', authored_by_user: authored, merged_at: pr.merged_at, verified_at: Time.current,
        title: "GitHub PR ##{m[:number]} · #{pr.title}", detail: "private GitHub project · #{format_month(pr.merged_at)}",
        repo: nwo, private: true, owner: m[:owner], failure_code: nil, install_url: nil,
        failure_reason: nil, refresh_warning: nil,
        snapshot: evidence.snapshot.to_h.merge('title' => pr.title, 'mergedAt' => pr.merged_at&.iso8601, 'reviewed' => reviewed)
      )
    else
      evidence.update!(
        status: 'failed', authored_by_user: false, merged_at: merged ? pr.merged_at : nil,
        title: "GitHub PR ##{m[:number]}", detail: '', repo: nil, private: true, owner: m[:owner],
        failure_code: nil, install_url: nil, refresh_warning: nil, snapshot: {},
        failure_reason: "You didn't author or approve this PR."
      )
    end
  rescue Octokit::NotFound
    mark_gone!(evidence, 'PR', m[:number])
  rescue *TEMPORARY_ERRORS => e
    evidence.update!(refresh_warning: temporary_reason_for(e))
  end

  def refresh_issue_via_app(evidence, m)
    installation_id = GithubApp.installation_for(m[:owner], m[:repo])
    return keep_badge_app_not_installed!(evidence, m[:owner]) if installation_id.nil?

    app_client = GithubApp.installation_client(installation_id)
    nwo = "#{m[:owner]}/#{m[:repo]}"
    issue = app_client.issue(nwo, m[:number])
    participated = issue.user.id == @user.github_id || commented_by_user?(nwo, m[:number], client: app_client)

    if participated
      evidence.update!(
        status: 'fetched', verified_at: Time.current,
        title: "GitHub issue ##{m[:number]} · #{issue.title}", detail: "private GitHub project · #{format_month(issue.created_at)}",
        repo: nwo, private: true, owner: m[:owner], failure_code: nil, install_url: nil,
        failure_reason: nil, refresh_warning: nil,
        snapshot: evidence.snapshot.to_h.merge('title' => issue.title, 'participated' => true)
      )
    else
      evidence.update!(
        status: 'failed', title: "GitHub issue ##{m[:number]}", detail: '', repo: nil,
        private: true, owner: m[:owner], failure_code: nil, install_url: nil, refresh_warning: nil, snapshot: {},
        failure_reason: "You didn't author or comment on this issue."
      )
    end
  rescue Octokit::NotFound
    mark_gone!(evidence, 'issue', m[:number])
  rescue *TEMPORARY_ERRORS => e
    evidence.update!(refresh_warning: temporary_reason_for(e))
  end

  # The app was never installed (still true on "Check again"), or was
  # installed and got removed since — either way, GitHub can't be asked right
  # now. Whatever badge exists (none, for the first case) is left alone.
  def keep_badge_app_not_installed!(evidence, owner)
    if evidence.failure_code == APP_NOT_INSTALLED
      evidence.update!(
        failure_reason: app_not_installed_reason(owner), install_url: GithubApp.install_url, refresh_warning: nil
      )
    else
      evidence.update!(
        refresh_warning: "The Ledger app was removed from #{owner}. Badge kept from #{format_month(evidence.verified_at)}."
      )
    end
  end

  # Deleted, or no longer visible even with the app installed: a definite
  # answer, so the badge goes.
  def mark_gone!(evidence, noun, number)
    evidence.update!(
      status: 'failed', authored_by_user: false, merged_at: nil,
      title: "GitHub #{noun} ##{number}", detail: '', repo: nil, snapshot: {},
      private: false, owner: nil, failure_code: nil, install_url: nil,
      failure_reason: 'Not found, or a private repo Ledger can’t see.', refresh_warning: nil
    )
  end

  # Accepts http(s)://github.com and www.github.com; ignores a trailing path
  # segment (/files, /commits, /checks…), query string and #anchor.
  def match(path_regex)
    uri = URI.parse(@url)
    return nil unless uri.is_a?(URI::HTTP) && uri.host&.match?(GITHUB_HOST)

    m = path_regex.match(uri.path)
    return nil unless m

    { owner: m[:owner], repo: m[:repo], number: m[:number].to_i }
  rescue URI::InvalidURIError
    nil
  end

  def canonical_url(m, path)
    "https://github.com/#{m[:owner]}/#{m[:repo]}/#{path}/#{m[:number]}"
  end

  def reject_duplicate!(url)
    raise DuplicateLink, 'Already added.' if @writeup.evidence.exists?(url: url)
  end

  def client
    @client ||= Octokit::Client.new(access_token: @user.github_token, auto_paginate: true)
  end

  def verify_pull_request(m)
    nwo = "#{m[:owner]}/#{m[:repo]}"
    number = m[:number]
    url = canonical_url(m, 'pull')
    pr = client.pull_request(nwo, number)
    return verify_pull_request_via_app(m, url, number) if pr.base.repo.private

    merged = pr.merged_at.present?
    authored = merged && pr.user.id == @user.github_id
    reviewed = !authored && merged && approved_by_user?(nwo, number)

    create_evidence!(
      kind: 'github_pr', url: url,
      title: "GitHub PR ##{number} · #{pr.title}", detail: "#{nwo} · #{format_month(pr.merged_at || pr.created_at)}",
      status: 'fetched', repo: nwo, number: number,
      authored_by_user: authored, merged_at: pr.merged_at, verified_at: Time.current,
      failure_reason: pr_badge_note(pr.user.id, pr.user.login, merged, authored, reviewed),
      snapshot: { title: pr.title, mergedAt: pr.merged_at&.iso8601, additions: pr.additions, deletions: pr.deletions, reviewed: reviewed }
    )
  rescue Octokit::NotFound
    verify_pull_request_via_app(m, url, number)
  rescue *TEMPORARY_ERRORS => e
    failed_evidence('github_pr', url, number, temporary_reason_for(e))
  end

  def verify_issue(m)
    nwo = "#{m[:owner]}/#{m[:repo]}"
    number = m[:number]
    url = canonical_url(m, 'issues')
    return verify_issue_via_app(m, url, number) if client.repository(nwo).private

    issue = client.issue(nwo, number)
    participated = issue.user.id == @user.github_id || commented_by_user?(nwo, number)

    create_evidence!(
      kind: 'github_issue', url: url,
      title: "GitHub issue ##{number} · #{issue.title}", detail: "#{nwo} · #{format_month(issue.created_at)}",
      status: 'fetched', repo: nwo, number: number,
      authored_by_user: false, verified_at: Time.current,
      failure_reason: issue_badge_note(issue.user.login, participated),
      snapshot: { title: issue.title, participated: participated }
    )
  rescue Octokit::NotFound
    verify_issue_via_app(m, url, number)
  rescue *TEMPORARY_ERRORS => e
    failed_evidence('github_issue', url, number, temporary_reason_for(e))
  end

  # The OAuth client can't see this repo — ask GithubApp whether Ledger's app
  # is installed there and, if so, check the PR with its installation token.
  def verify_pull_request_via_app(m, url, number)
    installation_id = GithubApp.installation_for(m[:owner], m[:repo])
    return app_not_installed_evidence('github_pr', url, number, m[:owner]) unless installation_id

    nwo = "#{m[:owner]}/#{m[:repo]}"
    app_client = GithubApp.installation_client(installation_id)
    pr = app_client.pull_request(nwo, number)
    merged = pr.merged_at.present?
    authored = merged && pr.user.id == @user.github_id
    reviewed = !authored && merged && approved_by_user?(nwo, number, client: app_client)

    if authored || reviewed
      create_evidence!(
        kind: 'github_pr', url: url,
        title: "GitHub PR ##{number} · #{pr.title}", detail: "private GitHub project · #{format_month(pr.merged_at)}",
        status: 'fetched', repo: nwo, number: number, private: true, owner: m[:owner],
        authored_by_user: authored, merged_at: pr.merged_at, verified_at: Time.current,
        snapshot: { title: pr.title, mergedAt: pr.merged_at&.iso8601, reviewed: reviewed }
      )
    else
      create_evidence!(
        kind: 'github_pr', url: url,
        title: "GitHub PR ##{number}", detail: '',
        status: 'failed', repo: nil, number: number, private: true, owner: m[:owner],
        failure_reason: "You didn't author or approve this PR."
      )
    end
  rescue Octokit::NotFound
    failed_evidence('github_pr', url, number, 'Not found, or a private repo Ledger can’t see.')
  rescue *TEMPORARY_ERRORS => e
    failed_evidence('github_pr', url, number, temporary_reason_for(e))
  end

  def verify_issue_via_app(m, url, number)
    installation_id = GithubApp.installation_for(m[:owner], m[:repo])
    return app_not_installed_evidence('github_issue', url, number, m[:owner]) unless installation_id

    nwo = "#{m[:owner]}/#{m[:repo]}"
    app_client = GithubApp.installation_client(installation_id)
    issue = app_client.issue(nwo, number)
    participated = issue.user.id == @user.github_id || commented_by_user?(nwo, number, client: app_client)

    if participated
      create_evidence!(
        kind: 'github_issue', url: url,
        title: "GitHub issue ##{number} · #{issue.title}", detail: "private GitHub project · #{format_month(issue.created_at)}",
        status: 'fetched', repo: nwo, number: number, private: true, owner: m[:owner],
        authored_by_user: false, verified_at: Time.current,
        snapshot: { title: issue.title, participated: true }
      )
    else
      create_evidence!(
        kind: 'github_issue', url: url,
        title: "GitHub issue ##{number}", detail: '',
        status: 'failed', repo: nil, number: number, private: true, owner: m[:owner],
        failure_reason: "You didn't author or comment on this issue."
      )
    end
  rescue Octokit::NotFound
    failed_evidence('github_issue', url, number, 'Not found, or a private repo Ledger can’t see.')
  rescue *TEMPORARY_ERRORS => e
    failed_evidence('github_issue', url, number, temporary_reason_for(e))
  end

  def verify_plain_link
    uri = URI.parse(@url)
    unless uri.is_a?(URI::HTTP) && uri.host.present?
      raise InvalidLink, 'Only http(s) links can be added.'
    end

    reject_duplicate!(@url)
    create_evidence!(
      kind: 'link', url: @url,
      title: "Link · #{uri.host}", detail: 'added by you · link only', status: 'linked'
    )
  rescue URI::InvalidURIError
    raise InvalidLink, 'That doesn’t look like a link.'
  end

  # Ledger's GitHub App isn't installed on this owner — an actionable failure,
  # not a dead end: the editor offers to install it and check again.
  def app_not_installed_evidence(kind, url, number, owner)
    create_evidence!(
      kind: kind, url: url,
      title: "GitHub #{kind == 'github_pr' ? 'PR' : 'issue'} ##{number}", detail: '',
      status: 'failed', repo: nil, number: number, private: true, owner: owner,
      failure_code: APP_NOT_INSTALLED, failure_reason: app_not_installed_reason(owner),
      install_url: GithubApp.install_url
    )
  end

  def app_not_installed_reason(owner)
    "Ledger can't see this repo. Install the Ledger app on #{owner} to verify private work."
  end

  # Author-only: the public API must not return failed evidence (see
  # PostSerializer), so the repo name of a private or missing repo never shows.
  def failed_evidence(kind, url, number, reason)
    create_evidence!(
      kind: kind, url: url,
      title: "GitHub #{kind == 'github_pr' ? 'PR' : 'issue'} ##{number}", detail: '',
      status: 'failed', repo: nil, number: number, failure_reason: reason
    )
  end

  # Why a PR earned no badge, for the editor. nil when it earned one.
  def pr_badge_note(pr_author_id, pr_author_login, merged, authored, reviewed)
    return nil if authored || reviewed
    return 'Not merged yet.' unless merged

    if pr_author_id == @user.github_id
      nil
    else
      "Authored by #{pr_author_login}, and not approved by you — you're signed in as #{@user.github_login}."
    end
  end

  def issue_badge_note(issue_author_login, participated)
    return nil if participated

    "Opened by #{issue_author_login}, with no comments from #{@user.github_login} — Ledger couldn't confirm you worked on this."
  end

  # These raise TemporaryFailure instead of answering "no" when GitHub can't
  # be asked, so a blip never reads as "you didn't review this". `client:`
  # is overridden with the installation client when checking a private repo.
  def approved_by_user?(nwo, number, client: self.client)
    client.pull_request_reviews(nwo, number, per_page: 100).any? do |review|
      review.state == 'APPROVED' && review.user&.id == @user.github_id
    end
  rescue Octokit::NotFound
    false
  rescue *TEMPORARY_ERRORS => e
    raise TemporaryFailure, e.message
  end

  def commented_by_user?(nwo, number, client: self.client)
    client.issue_comments(nwo, number, per_page: 100).any? { |c| c.user&.id == @user.github_id }
  rescue Octokit::NotFound
    false
  rescue *TEMPORARY_ERRORS => e
    raise TemporaryFailure, e.message
  end

  def temporary_reason_for(error)
    case error
    when Octokit::Unauthorized
      'Your GitHub sign-in expired — sign in again.'
    when Octokit::TooManyRequests
      'GitHub is rate-limiting us — try again shortly.'
    when Octokit::Forbidden
      'GitHub refused the request — try again shortly, or sign in again.'
    else
      "Couldn't reach GitHub — try again shortly."
    end
  end

  def format_month(time)
    time&.strftime('%b %Y')
  end

  # Keys are S1, S2… per write-up. The unique index on (writeup_id, key)
  # catches a race between two adds; retry once with the next key.
  def create_evidence!(attrs)
    attempts = 0
    begin
      @writeup.evidence.create!(attrs.merge(key: next_key))
    rescue ActiveRecord::RecordNotUnique
      attempts += 1
      raise if attempts > 1 || @writeup.evidence.exists?(url: attrs[:url])

      retry
    end
  end

  def next_key
    max = @writeup.evidence.pluck(:key).map { |k| k[1..].to_i }.max || 0
    "S#{max + 1}"
  end
end
