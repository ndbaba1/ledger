# Builds the text DraftWriter sends to the LLM: one labelled block per PR/
# issue, review, comment and linked item. Never persists anything — `#call`
# returns the text in memory only, meant to be used and discarded within a
# single job run (see DraftFromSourceJob).
#
# Deliberately reads only `.title`/`.body` off GitHub API objects — never
# calls an endpoint that returns file/diff content (no pull_request_files, no
# pull_request_comments/pull_request_review_comments, which carry diff_hunk
# and path). `pull_request_reviews` gives the review's own summary comment,
# not inline diff comments.
#
# Client selection duplicates a small piece of GithubEvidenceVerifier's
# OAuth-then-GitHub-App fallback rather than sharing one client object with
# it — this service also needs clients for repos other than the anchor (a
# linked issue or PR can live in a different repo), so a single shared client
# wouldn't fit either caller cleanly.
class GithubSourceContext
  CAP = 30_000

  CLOSES_KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b/i
  INLINE_REF = %r{(?:#{CLOSES_KEYWORD}\s*:?\s*)(?:(?<owner>[\w.-]+)/(?<repo>[\w.-]+))?#(?<number>\d+)}
  URL_REF = %r{https?://(?:www\.)?github\.com/(?<owner>[\w.-]+)/(?<repo>[\w.-]+)/issues/(?<number>\d+)}

  # issue_state/issue_state_reason/user_merged_pr_present are only set when
  # the anchor itself is an issue (kind == :issue) — they gate whether
  # DraftWriter may let an outcome section (TemplateSections' `outcome` flag)
  # claim a fix at all (see #fix_allowed? and app/prompts/draft_v3.md's rule
  # 9). A PR-sourced draft is never gated: starting from a PR already implies
  # the work happened.
  Result = Struct.new(:text, :labels, :blank, :kind, :issue_state, :issue_state_reason, :user_merged_pr_present, keyword_init: true) do
    def blank? = blank

    def fix_allowed?
      return true unless kind == :issue

      issue_state == 'closed' && issue_state_reason == 'completed' && user_merged_pr_present
    end

    def fix_missing_reason
      return nil if fix_allowed?
      return 'Issue still open.' unless issue_state == 'closed'
      return 'Closed without a fix.' if issue_state_reason == 'not_planned'

      'No merged PR of yours closed this issue.'
    end
  end

  def initialize(writeup, url, user)
    @writeup = writeup
    @user = user
    @parsed = GithubEvidenceVerifier.parse_url(url) or raise ArgumentError, 'not a GitHub PR or issue URL'
    @clients = {}
    @user_merged_pr_present = false
  end

  # Cheap check: the anchor's own title/body and top-level comments/reviews
  # only — no linked items, no labelling, no capping. Used synchronously
  # (not from the job) to decide whether to even start a background draft.
  def likely_empty?
    if @parsed[:kind] == :pr
      pr = fetch_pull_request
      body_blank?(pr.body) &&
        !meaningful?(fetch_issue_comments(@parsed[:owner], @parsed[:repo], @parsed[:number])) &&
        !meaningful?(fetch_pr_reviews(@parsed[:owner], @parsed[:repo], @parsed[:number]))
    else
      issue = fetch_issue
      body_blank?(issue.body) && !meaningful?(fetch_issue_comments(@parsed[:owner], @parsed[:repo], @parsed[:number]))
    end
  rescue *GithubEvidenceVerifier::TEMPORARY_ERRORS => e
    raise GithubEvidenceVerifier::TemporaryFailure, e.message
  end

  def call
    chunks = @parsed[:kind] == :pr ? pr_chunks : issue_chunks
    anchor_body = @parsed[:kind] == :pr ? fetch_pull_request.body : fetch_issue.body
    has_comments = chunks.any? { |c| c[:trim] && c[:text].to_s.strip.present? }
    blank = body_blank?(anchor_body) && !has_comments
    Result.new(
      text: assemble(chunks), labels: chunks.map { |c| c[:label] }.uniq, blank: blank,
      kind: @parsed[:kind], issue_state: anchor_issue_state, issue_state_reason: anchor_issue_state_reason,
      user_merged_pr_present: @user_merged_pr_present
    )
  rescue *GithubEvidenceVerifier::TEMPORARY_ERRORS => e
    raise GithubEvidenceVerifier::TemporaryFailure, e.message
  end

  private

  # ---- anchor (PR or issue) ---------------------------------------------

  def pr_chunks
    pr = fetch_pull_request
    [
      { label: "PR ##{@parsed[:number]}#{you_suffix(pr.user)}", text: body_text(pr), trim: false, at: pr.created_at },
      *review_chunks(@parsed[:owner], @parsed[:repo], @parsed[:number]),
      *comment_chunks(@parsed[:owner], @parsed[:repo], @parsed[:number]),
      *linked_issue_chunks(pr)
    ]
  end

  def issue_chunks
    issue = fetch_issue
    [
      { label: "ISSUE ##{@parsed[:number]}#{you_suffix(issue.user)}", text: issue_body_text(issue), trim: false, at: issue.created_at },
      *comment_chunks(@parsed[:owner], @parsed[:repo], @parsed[:number]),
      *linked_pr_chunks
    ]
  end

  def fetch_pull_request
    @pr ||= client_for!(@parsed[:owner], @parsed[:repo]).pull_request(nwo(@parsed[:owner], @parsed[:repo]), @parsed[:number])
  end

  def fetch_issue
    @issue ||= client_for!(@parsed[:owner], @parsed[:repo]).issue(nwo(@parsed[:owner], @parsed[:repo]), @parsed[:number])
  end

  def anchor_issue_state
    fetch_issue.state if @parsed[:kind] == :issue
  end

  def anchor_issue_state_reason
    fetch_issue.state_reason if @parsed[:kind] == :issue
  end

  # ---- reviews / comments, reusable for the anchor and for linked PRs ---

  def review_chunks(owner, repo, number)
    client = client_for(owner, repo)
    return [] unless client

    client.pull_request_reviews(nwo(owner, repo), number, per_page: 100).filter_map do |r|
      next if bot?(r.user) || r.body.to_s.strip.empty?

      { label: "REVIEW by #{r.user.login}#{you_suffix(r.user)}", text: r.body, trim: true, at: r.submitted_at }
    end
  rescue Octokit::NotFound
    []
  end

  def comment_chunks(owner, repo, number)
    fetch_issue_comments(owner, repo, number).filter_map do |c|
      next if bot?(c.user)

      { label: "COMMENT by #{c.user.login}#{you_suffix(c.user)}", text: c.body, trim: true, at: c.created_at }
    end
  end

  def fetch_issue_comments(owner, repo, number)
    client = client_for(owner, repo)
    return [] unless client

    client.issue_comments(nwo(owner, repo), number, per_page: 100)
  rescue Octokit::NotFound
    []
  end

  def fetch_pr_reviews(owner, repo, number)
    client = client_for(owner, repo)
    return [] unless client

    client.pull_request_reviews(nwo(owner, repo), number, per_page: 100)
  rescue Octokit::NotFound
    []
  end

  # ---- linked items -------------------------------------------------------

  # Issues this PR's title/body reference with a closing keyword or a bare
  # issues/N URL — read-only context, not added as evidence.
  def linked_issue_chunks(pr)
    extract_refs(pr.title.to_s + "\n" + pr.body.to_s).filter_map do |ref|
      client = client_for(ref[:owner], ref[:repo])
      next unless client

      issue = client.issue(nwo(ref[:owner], ref[:repo]), ref[:number])
      { label: "ISSUE ##{ref[:number]}#{you_suffix(issue.user)}", text: issue_body_text(issue), trim: false, at: issue.created_at }
    rescue Octokit::NotFound
      nil
    end
  end

  # PRs that reference this issue via GitHub's timeline (cross-referenced
  # events). Only a merged PR authored or reviewed by the user — verified
  # the same way as any other evidence, and attached as evidence either way
  # — has its content included.
  def linked_pr_chunks
    linked_pr_refs.flat_map do |ref|
      pr_url = "https://github.com/#{ref[:owner]}/#{ref[:repo]}/pull/#{ref[:number]}"
      evidence = attach_evidence(pr_url)
      next [] unless evidence&.verified?

      @user_merged_pr_present ||= evidence.authored_by_user?

      client = client_for(ref[:owner], ref[:repo])
      next [] unless client

      pr = client.pull_request(nwo(ref[:owner], ref[:repo]), ref[:number])
      [
        { label: "PR ##{ref[:number]}#{you_suffix(pr.user)}", text: body_text(pr), trim: false, at: pr.created_at },
        *review_chunks(ref[:owner], ref[:repo], ref[:number]),
        *comment_chunks(ref[:owner], ref[:repo], ref[:number])
      ]
    end
  end

  def linked_pr_refs
    client = client_for!(@parsed[:owner], @parsed[:repo])
    events = client.issue_timeline(nwo(@parsed[:owner], @parsed[:repo]), @parsed[:number], per_page: 100)
    events.filter_map do |e|
      next unless e.event == 'cross-referenced'

      source = e.source&.issue
      next unless source&.pull_request

      { owner: source.repository&.owner&.login || @parsed[:owner], repo: source.repository&.name || @parsed[:repo], number: source.number }
    end.uniq
  rescue Octokit::NotFound
    []
  end

  def attach_evidence(pr_url)
    GithubEvidenceVerifier.new(@writeup, pr_url, @user).call
    Evidence.find_by(writeup_id: @writeup.id, url: pr_url)
  rescue GithubEvidenceVerifier::DuplicateLink
    Evidence.find_by(writeup_id: @writeup.id, url: pr_url)
  rescue GithubEvidenceVerifier::InvalidLink
    nil
  end

  def extract_refs(text)
    refs = []
    text.scan(INLINE_REF) do
      m = Regexp.last_match
      refs << { owner: m[:owner] || @parsed[:owner], repo: m[:repo] || @parsed[:repo], number: m[:number].to_i }
    end
    text.scan(URL_REF) do
      m = Regexp.last_match
      refs << { owner: m[:owner], repo: m[:repo], number: m[:number].to_i }
    end
    refs.uniq
  end

  # ---- clients --------------------------------------------------------------

  def nwo(owner, repo) = "#{owner}/#{repo}"

  # nil when this repo can't be read at all (shouldn't happen for the anchor,
  # whose access was already established by GithubEvidenceVerifier — but a
  # linked item can live in a repo Ledger has no access to).
  def client_for(owner, repo)
    key = nwo(owner, repo)
    return @clients[key] if @clients.key?(key)

    @clients[key] =
      begin
        oauth_client.repository(key).private ? app_client_for(owner, repo) : oauth_client
      rescue Octokit::NotFound
        app_client_for(owner, repo)
      end
  end

  def client_for!(owner, repo)
    client_for(owner, repo) or raise GithubEvidenceVerifier::TemporaryFailure, "Couldn't reach GitHub"
  end

  def oauth_client
    @oauth_client ||= Octokit::Client.new(access_token: @user.github_token, auto_paginate: true)
  end

  def app_client_for(owner, repo)
    installation_id = GithubApp.installation_for(owner, repo)
    return nil unless installation_id

    GithubApp.installation_client(installation_id)
  end

  # ---- text assembly ---------------------------------------------------------

  def body_text(obj) = "#{obj.title}\n\n#{obj.body}".strip

  # Prepended to the source issue's and every linked issue's text, e.g.
  # "state: closed (completed) on 2026-09-28" or "state: open" — see
  # app/prompts/draft_v2.md's rules on what an issue's state does and
  # doesn't license a draft to claim.
  def issue_body_text(issue) = "#{issue_state_line(issue)}\n\n#{body_text(issue)}"

  def issue_state_line(issue)
    return 'state: open' unless issue.state == 'closed'

    reason = issue.state_reason
    date = issue.closed_at&.strftime('%Y-%m-%d')
    "state: closed#{reason ? " (#{reason})" : ''}#{date ? " on #{date}" : ''}"
  end

  def body_blank?(body) = body.to_s.strip.empty?

  def meaningful?(items) = items.any? { |i| !bot?(i.user) && i.body.to_s.strip.present? }

  def bot?(user)
    return true if user.nil?

    user.type == 'Bot' || user.login.to_s.end_with?('[bot]')
  end

  def you_suffix(user) = user&.id == @user.github_id ? ' (you)' : ''

  # Keeps the main body and linked bodies whole; trims oldest comments/
  # reviews first when over CAP.
  def assemble(chunks)
    kept = chunks.dup
    trimmable = kept.select { |c| c[:trim] }.sort_by { |c| c[:at] || Time.at(0) }
    text = render(kept)
    while text.length > CAP && trimmable.any?
      kept = kept - [trimmable.shift]
      text = render(kept)
    end
    text
  end

  def render(chunks)
    chunks.map { |c| "[#{c[:label]}]\n#{c[:text]}" }.join("\n\n")
  end
end
