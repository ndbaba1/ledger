import { describe, expect, it } from 'vitest'
import type { RedactionRule } from '../api/types'
import { removeCitations, stripInline, tokenizeInline } from '../lib/inline'
import { countMatches, redact, redactToString } from '../lib/redact'
import { detectSourceKind, isValidUrl, sourceFromUrl } from '../lib/sources'
import { relativeTime, shortDate } from '../lib/format'

const rules: RedactionRule[] = [
  { id: 'svc', label: 'Services', enabled: true, replacements: [{ match: 'checkout-api', with: 'the checkout service' }] },
  { id: 'url', label: 'Links', enabled: true, replacements: [{ match: 'See grafana.internal.', with: '' }] },
  { id: 'off', label: 'Disabled', enabled: false, replacements: [{ match: 'p99', with: 'latency' }] },
]

describe('redact', () => {
  it('replaces and removes matches from enabled rules only', () => {
    const segs = redact('checkout-api p99 spiked. See grafana.internal.', rules)
    expect(segs).toEqual([
      { text: 'the checkout service', kind: 'replaced', original: 'checkout-api' },
      { text: ' p99 spiked. ', kind: 'plain' },
      { text: 'See grafana.internal.', kind: 'removed', original: 'See grafana.internal.' },
    ])
  })

  it('produces readable text with removals dropped', () => {
    expect(redactToString('checkout-api p99 spiked. See grafana.internal.', rules)).toBe('the checkout service p99 spiked.')
  })

  it('prefers the longest match when rules overlap', () => {
    const overlapping: RedactionRule[] = [
      { id: 'a', label: 'a', enabled: true, replacements: [{ match: 'checkout-api', with: 'X' }] },
      { id: 'b', label: 'b', enabled: true, replacements: [{ match: 'checkout-api-v2', with: 'Y' }] },
    ]
    expect(redactToString('checkout-api-v2 and checkout-api', overlapping)).toBe('Y and X')
  })

  it('counts every occurrence across texts', () => {
    expect(countMatches(rules[0], ['checkout-api and checkout-api', 'checkout-api'])).toBe(3)
  })
})

describe('inline markup', () => {
  it('tokenizes code spans and citations', () => {
    expect(tokenizeInline('Set `pool` to 40 [S3].')).toEqual([
      { type: 'text', value: 'Set ' },
      { type: 'code', value: 'pool' },
      { type: 'text', value: ' to 40 ' },
      { type: 'cite', key: 'S3' },
      { type: 'text', value: '.' },
    ])
  })

  it('strips markup for excerpts and keeps code when only removing citations', () => {
    expect(stripInline('Set `pool` to 40 [S3] [S4].')).toBe('Set pool to 40.')
    expect(removeCitations('Set `pool` [S1].')).toBe('Set `pool`.')
  })
})

describe('sources', () => {
  it.each([
    ['https://acme.slack.com/archives/C01/p123', 'slack'],
    ['https://gitlab.com/platform/checkout/-/issues/4821', 'gitlab_issue'],
    ['https://gitlab.acme.dev/platform/checkout/-/merge_requests/1932', 'gitlab_mr'],
    ['https://github.com/vaultkit-inc/agent-db-scan/pull/12', 'github_pr'],
    ['https://github.com/vaultkit-inc/agent-db-scan/issues/3', 'github_issue'],
    ['https://docs.google.com/document/d/abc', 'doc'],
    ['https://grafana.internal/d/chk', 'link'],
    ['not a url', 'link'],
  ] as const)('detects %s as %s', (url, kind) => {
    expect(detectSourceKind(url)).toBe(kind)
  })

  it('validates urls', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('javascript:alert(1)')).toBe(false)
    expect(isValidUrl('example.com')).toBe(false)
  })

  it('keys a new source after existing ones and names it from the URL', () => {
    const s = sourceFromUrl('https://gitlab.com/a/b/-/merge_requests/77', [
      { key: 'S1', kind: 'link', title: 'x', detail: '', status: 'linked', hops: 0 },
      { key: 'S6', kind: 'link', title: 'y', detail: '', status: 'linked', hops: 0 },
    ])
    expect(s.key).toBe('S7')
    expect(s.title).toBe('GitLab MR !77')
    expect(s.status).toBe('fetched')
  })
})

describe('format', () => {
  const now = new Date('2026-09-28T18:00:00Z')
  it('formats relative times', () => {
    expect(relativeTime('2026-09-28T17:59:30Z', now)).toBe('just now')
    expect(relativeTime('2026-09-28T17:30:00Z', now)).toBe('30m ago')
    expect(relativeTime('2026-09-28T13:00:00Z', now)).toBe('5h ago')
    expect(relativeTime('2026-09-25T18:00:00Z', now)).toBe('3d ago')
  })
  it('adds the year only when it differs', () => {
    expect(shortDate('2026-03-31T12:00:00Z', now)).toBe('Mar 31')
    expect(shortDate('2025-03-31T12:00:00Z', now)).toBe('Mar 31, 2025')
  })
})
