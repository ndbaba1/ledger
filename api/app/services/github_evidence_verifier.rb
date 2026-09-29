# Turns a pasted URL into an Evidence record. GitHub PR and issue links are
# verified live against the GitHub API, using the signed-in user's own OAuth
# token; everything else (and anything the API can't confirm) is stored as a
# plain, unverified link so adding evidence never fails outright.
class GithubEvidenceVerifier
  PR_URL = %r{\Ahttps?://github\.com/(?<owner>[^/]+)/(?<repo>[^/]+)/pull/(?<number>\d+)/?\z}
  ISSUE_URL = %r{\Ahttps?://github\.com/(?<owner>[^/]+)/(?<repo>[^/]+)/issues/(?<number>\d+)/?\z}

  def initialize(writeup, url, user)
    @writeup = writeup
    @url = url
    @user = user
  end

  def call
    if (m = PR_URL.match(@url))
      verify_pull_request(m)
    elsif (m = ISSUE_URL.match(@url))
      verify_issue(m)
    else
      @writeup.evidence.create!(
        key: next_key, kind: 'link', url: @url,
        title: link_title, detail: 'added by you · link only', status: 'linked'
      )
    end
  end

  private

  def client
    @client ||= Octokit::Client.new(access_token: @user.github_token)
  end

  def verify_pull_request(m)
    owner, repo, number = m[:owner], m[:repo], m[:number].to_i
    nwo = "#{owner}/#{repo}"
    pr = client.pull_request(nwo, number)
    authored = pr.user.login.casecmp?(@user.github_login) && pr.merged_at.present?
    reviewed = !authored && approved_by_user?(nwo, number)

    @writeup.evidence.create!(
      key: next_key, kind: 'github_pr', url: @url,
      title: "GitHub PR ##{number} · #{pr.title}", detail: "#{nwo} · #{format_month(pr.merged_at || pr.created_at)}",
      status: 'fetched', repo: nwo, number: number,
      authored_by_user: authored, merged_at: pr.merged_at, verified_at: Time.current,
      snapshot: { title: pr.title, mergedAt: pr.merged_at&.iso8601, additions: pr.additions, deletions: pr.deletions, reviewed: reviewed }
    )
  rescue => e
    failed_evidence('github_pr', nwo, number, e)
  end

  def verify_issue(m)
    owner, repo, number = m[:owner], m[:repo], m[:number].to_i
    nwo = "#{owner}/#{repo}"
    issue = client.issue(nwo, number)
    participated = issue.user.login.casecmp?(@user.github_login) || commented_by_user?(nwo, number)

    @writeup.evidence.create!(
      key: next_key, kind: 'github_issue', url: @url,
      title: "GitHub issue ##{number} · #{issue.title}", detail: "#{nwo} · #{format_month(issue.created_at)}",
      status: 'fetched', repo: nwo, number: number,
      authored_by_user: false, verified_at: Time.current,
      snapshot: { title: issue.title, participated: participated }
    )
  rescue => e
    failed_evidence('github_issue', nwo, number, e)
  end

  def approved_by_user?(nwo, number)
    client.pull_request_reviews(nwo, number).any? do |review|
      review.state == 'APPROVED' && review.user.login.casecmp?(@user.github_login)
    end
  rescue Octokit::Error
    false
  end

  def commented_by_user?(nwo, number)
    client.issue_comments(nwo, number).any? { |c| c.user.login.casecmp?(@user.github_login) }
  rescue Octokit::Error
    false
  end

  def failed_evidence(kind, nwo, number, error)
    @writeup.evidence.create!(
      key: next_key, kind: kind, url: @url,
      title: "GitHub #{kind == 'github_pr' ? 'PR' : 'issue'} ##{number}", detail: nwo,
      status: 'failed', repo: nwo, number: number,
      failure_reason: failure_reason_for(error)
    )
  end

  def failure_reason_for(error)
    case error
    when Octokit::NotFound
      "Couldn't verify — #{@url} may be a private repo (version 1 only verifies public repos), or the link is wrong."
    when Octokit::Unauthorized, Octokit::Forbidden, Octokit::TooManyRequests
      "GitHub rejected the request — try again shortly."
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
