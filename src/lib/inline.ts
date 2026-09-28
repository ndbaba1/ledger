/** Tokens for the tiny inline markup used in records: `code` spans and [S1] citations. */
export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'cite'; key: string }
  | { type: 'ref'; n: number }

const PATTERN = /`([^`]+)`|\[(S\d+)\]|\[(\d{1,2})\]/g

export function tokenizeInline(text: string): InlineToken[] {
  const out: InlineToken[] = []
  let last = 0
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) })
    if (m[1] !== undefined) out.push({ type: 'code', value: m[1] })
    else if (m[2] !== undefined) out.push({ type: 'cite', key: m[2] })
    else out.push({ type: 'ref', n: Number(m[3]) })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out
}

/** Plain text with markup removed, for excerpts, search and word counts. */
export function stripInline(text: string): string {
  return removeCitations(text).replace(/`([^`]+)`/g, '$1')
}

/** Drop [S1]-style citations (they point at private sources) but keep `code`. */
export function removeCitations(text: string): string {
  return text.replace(/\s*\[S\d+\]/g, '')
}
