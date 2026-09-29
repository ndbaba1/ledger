import type { RedactionRule } from '../api/types'

export type SegmentKind = 'plain' | 'replaced' | 'removed'

export interface Segment {
  text: string
  kind: SegmentKind
  /** For replaced/removed segments, what the original text was. */
  original?: string
}

interface Hit {
  start: number
  end: number
  with: string
}

/**
 * Split text into plain and redacted segments using the enabled rules.
 * Longer matches win when two overlap, so "checkout-api-v2" is not
 * half-replaced by a rule for "checkout-api".
 */
export function redact(text: string, rules: RedactionRule[]): Segment[] {
  const pairs = rules
    .filter((r) => r.enabled)
    .flatMap((r) => r.replacements)
    .filter((p) => p.match.length > 0)
    .sort((a, b) => b.match.length - a.match.length)

  const hits: Hit[] = []
  for (const pair of pairs) {
    let from = 0
    for (;;) {
      const at = text.indexOf(pair.match, from)
      if (at === -1) break
      const end = at + pair.match.length
      if (!hits.some((h) => at < h.end && end > h.start)) {
        hits.push({ start: at, end, with: pair.with })
      }
      from = end
    }
  }
  hits.sort((a, b) => a.start - b.start)

  const out: Segment[] = []
  let cursor = 0
  for (const h of hits) {
    if (h.start > cursor) out.push({ text: text.slice(cursor, h.start), kind: 'plain' })
    const original = text.slice(h.start, h.end)
    out.push(
      h.with === ''
        ? { text: original, kind: 'removed', original }
        : { text: h.with, kind: 'replaced', original },
    )
    cursor = h.end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), kind: 'plain' })
  return out
}

/** The text a reader will see: replacements applied, removals dropped, spacing tidied. */
export function redactToString(text: string, rules: RedactionRule[]): string {
  return redact(text, rules)
    .filter((s) => s.kind !== 'removed')
    .map((s) => s.text)
    .join('')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** How many times each rule's strings appear across the given texts. */
export function countMatches(rule: RedactionRule, texts: string[]): number {
  let n = 0
  for (const t of texts) {
    for (const p of rule.replacements) {
      if (!p.match) continue
      let from = 0
      for (;;) {
        const at = t.indexOf(p.match, from)
        if (at === -1) break
        n++
        from = at + p.match.length
      }
    }
  }
  return n
}
