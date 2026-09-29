# Turns a pasted URL into an Evidence record. GitHub PR and issue links are
# verified live against the GitHub API, using the signed-in user's own OAuth
# token (scoped to `read:user` only — see config/initializers/omniauth.rb —
# so private repos are never actually readable); everything else (and
# anything the API can't confirm) is stored as a plain, unverified link so
# adding evidence never fails outright.
class GithubEvidenceVerifier
  GITHUB_HOST = /\A(?:www\.)?github\.com\z/i
  PR_PATH = %r{\A/(?<owner>[^/]+)/(?<repo>[^/]+)/pull/(?<number>\d+)(?:/.*)?\z}
  ISSUE_PATH = %r{\A/(?<owner>[^/]+)/(?<repo>[^/]+)/issues/(?<number>\d+)(?:/.*)?\z}

  def initialize(writeup, url, user)
    @writeup = writeup
    @url = url
    @user = user
  end

  def call
    if (m = match(PR_PATH))
      verify_pull_request(m)
    elsif (m = match(ISSUE_PATH))
      verify_issue(m)
    else
      verify_plain_link
    end
  end

  private

  # Accepts github.com and www.github.com, and ignores a trailing path
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

  def client
    @client ||= Octokit::Client.new(access_token: @user.github_token, auto_paginate: true)
  end

  def verify_pull_request(m)
    nwo = "#{m[:owner]}/#{m[:repo]}"
    number = m[:number]
    url = canonical_url(m, 'pull')
    pr = client.pull_request(nwo, number)

    return private_repo_evidence('github_pr', url, nwo, number) if pr.base.repo.private

    pr_author_id = pr.user.id
    merged = pr.merged_at.present?
    authored = pr_author_id == @user.github_id && merged
    reviewed = !authored && merged && approved_by_user?(nwo, number)

    @writeup.evidence.create!(
      key: next_key, kind: 'github_pr', url: url,
      title: "GitHub PR ##{number} · #{pr.title}", detail: "#{nwo} · #{format_month(pr.merged_at || pr.created_at)}",
      status: 'fetched', repo: nwo, number: number,
      authored_by_user: authored, merged_at: pr.merged_at, verified_at: Time.current,
      failure_reason: pr_badge_note(pr_author_id, pr.user.login, merged, authored, reviewed),
      snapshot: { title: pr.title, mergedAt: pr.merged_at&.iso8601, additions: pr.additions, deletions: pr.deletions, reviewed: reviewed }
    )
  rescue Octokit::Error, Faraday::Error => e
    failed_evidence('github_pr', url, nwo, number, e)
  end

  def verify_issue(m)
    nwo = "#{m[:owner]}/#{m[:repo]}"
    number = m[:number]
    url = canonical_url(m, 'issues')
    issue = client.issue(nwo, number)

    return private_repo_evidence('github_issue', url, nwo, number) if client.repository(nwo).private

    issue_author_id = issue.user.id
    participated = issue_author_id == @user.github_id || commented_by_user?(nwo, number)

    @writeup.evidence.create!(
      key: next_key, kind: 'github_issue', url: url,
      title: "GitHub issue ##{number} · #{issue.title}", detail: "#{nwo} · #{format_month(issue.created_at)}",
      status: 'fetched', repo: nwo, number: number,
      authored_by_user: false, verified_at: Time.current,
      failure_reason: issue_badge_note(issue.user.login, participated),
      snapshot: { title: issue.title, participated: participated }
    )
  rescue Octokit::Error, Faraday::Error => e
    failed_evidence('github_issue', url, nwo, number, e)
  end

  def verify_plain_link
    @writeup.evidence.create!(
      key: next_key, kind: 'link', url: @url,
      title: link_title, detail: 'added by you · link only', status: 'linked'
    )
  end

  # Fetched fine, but the repo turned out to be private — never store what we
  # learned from the API (title, description) about a repo the URL alone
  # doesn't already reveal to whoever's looking at this write-up.
  def private_repo_evidence(kind, url, nwo, number)
    @writeup.evidence.create!(
      key: next_key, kind: kind, url: url,
      title: "GitHub #{kind == 'github_pr' ? 'PR' : 'issue'} ##{number}", detail: '',
      status: 'failed', repo: nwo, number: number,
      failure_reason: 'Private repo — not supported yet.'
    )
  end

  # Why this PR earned no badge, for the editor to show next to it. nil when
  # it did earn one (authored & merged, or reviewed).
  def pr_badge_note(pr_author_id, pr_author_login, merged, authored, reviewed)
    return nil if authored || reviewed

    if pr_author_id == @user.github_id
      merged ? nil : 'Not merged yet.'
    else
      "Authored by #{pr_author_login} — you're signed in as #{@user.github_login}."
    end
  end

  def issue_badge_note(issue_author_login, participated)
    return nil if participated

    "Opened by #{issue_author_login}, with no comments from #{@user.github_login} — Ledger couldn't confirm you worked on this."
  end

  def approved_by_user?(nwo, number)
    client.pull_request_reviews(nwo, number, per_page: 100).any? do |review|
      review.state == 'APPROVED' && review.user.id == @user.github_id
    end
  rescue Octokit::Error, Faraday::Error
    false
  end

  def commented_by_user?(nwo, number)
    client.issue_comments(nwo, number, per_page: 100).any? { |c| c.user.id == @user.github_id }
  rescue Octokit::Error, Faraday::Error
    false
  end

  def failed_evidence(kind, url, nwo, number, error)
    @writeup.evidence.create!(
      key: next_key, kind: kind, url: url,
      title: "GitHub #{kind == 'github_pr' ? 'PR' : 'issue'} ##{number}", detail: nwo,
      status: 'failed', repo: nwo, number: number,
      failure_reason: failure_reason_for(error)
    )
  end

  def failure_reason_for(error)
    case error
    when Octokit::NotFound
      'Not found, or a private repo (not supported yet).'
    when Octokit::Unauthorized
      "Your GitHub sign-in expired — sign in again."
    when Octokit::TooManyRequests, Octokit::Forbidden
      'GitHub is rate-limiting us — try again shortly.'
    else
      "Couldn't reach GitHub to verify this link."
    end
  end

  def link_title
    uri = URI.parse(@url)
    "Link · #{uri.host}"
  rescue URI::InvalidURIError
    'Link'
  end

  def format_month(time)
    time ? time.strftime('%b %Y') : nil
  end

  def next_key
    max = @writeup.evidence.pluck(:key).map { |k| k[1..].to_i }.max || 0
    "S#{max + 1}"
  end
end
