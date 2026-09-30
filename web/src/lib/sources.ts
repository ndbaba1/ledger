import type { Source, SourceKind } from '../api/types'

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  slack: 'Slack',
  gitlab_issue: 'GitLab issue',
  gitlab_mr: 'GitLab MR',
  github_issue: 'GitHub issue',
  github_pr: 'GitHub PR',
  doc: 'Doc',
  link: 'Link',
}

/** Kinds Ledger can fetch through a connector; everything else is kept as a link. */
const FETCHABLE: ReadonlySet<SourceKind> = new Set([
  'slack',
  'gitlab_issue',
  'gitlab_mr',
  'github_issue',
  'github_pr',
])

export function detectSourceKind(rawUrl: string): SourceKind {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return 'link'
  }
  const host = url.hostname.toLowerCase()
  const path = url.pathname

  if (host === 'slack.com' || host.endsWith('.slack.com')) return 'slack'
  if (host === 'docs.google.com' || host.endsWith('.atlassian.net') || host === 'notion.so' || host.endsWith('.notion.site')) {
    return 'doc'
  }
  if (host === 'github.com') {
    if (/^\/[^/]+\/[^/]+\/pull\/\d+/.test(path)) return 'github_pr'
    if (/^\/[^/]+\/[^/]+\/issues\/\d+/.test(path)) return 'github_issue'
    return 'link'
  }
  // GitLab.com and self-managed GitLab both use /-/issues/ and /-/merge_requests/.
  if (/\/-\/merge_requests\/\d+/.test(path)) return 'gitlab_mr'
  if (/\/-\/issues\/\d+/.test(path)) return 'gitlab_issue'
  return 'link'
}

export function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Build the source a pasted link turns into, keyed after the existing ones. */
export function sourceFromUrl(rawUrl: string, existing: Source[]): Source {
  const url = rawUrl.trim()
  const kind = detectSourceKind(url)
  const next = existing.reduce((max, s) => Math.max(max, Number(s.key.slice(1)) || 0), 0) + 1
  const parsed = new URL(url)
  const ref = shortRef(kind, parsed)
  // The mock has no real GitHub to check against, so a pasted PR is simply
  // trusted as one you authored and merged — the same happy path the real
  // backend's GithubEvidenceVerifier confirms for a live account.
  const isGithubPr = kind === 'github_pr'
  return {
    key: `S${next}`,
    kind,
    title: ref ? `${SOURCE_KIND_LABEL[kind]} ${ref}` : `${SOURCE_KIND_LABEL[kind]} · ${parsed.hostname}`,
    detail: FETCHABLE.has(kind) ? 'added by you · queued to fetch' : 'added by you · link only',
    status: FETCHABLE.has(kind) ? 'fetched' : 'linked',
    url,
    hops: 0,
    ...(isGithubPr ? { authoredByMe: true, verified: true } : {}),
  }
}

function shortRef(kind: SourceKind, url: URL): string | null {
  const n = url.pathname.match(/\/(\d+)(?:\/|$)/)?.[1]
  if (!n) return null
  if (kind === 'gitlab_mr') return `!${n}`
  if (kind === 'gitlab_issue' || kind === 'github_issue' || kind === 'github_pr') return `#${n}`
  return null
}
