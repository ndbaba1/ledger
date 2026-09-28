/**
 * Inline markup used in records and write-ups — a small Markdown subset:
 * `code`, **bold**, *italic*, [text](https://…), plus [S1] source citations
 * and [1] numbered references.
 */
export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'cite'; key: string }
  | { type: 'ref'; n: number }

const PATTERN =
  /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\[(S\d+)\]|\[(\d{1,2})\]|\*\*(?=\S)([^*]+?)\*\*|\*(?=[^\s*])([^*]+?)\*/g

export function tokenizeInline(text: string): InlineToken[] {
  const out: InlineToken[] = []
  let last = 0
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) })
    if (m[1] !== undefined) out.push({ type: 'code', value: m[1] })
    else if (m[2] !== undefined) out.push({ type: 'link', text: m[2], href: m[3] })
    else if (m[4] !== undefined) out.push({ type: 'cite', key: m[4] })
    else if (m[5] !== undefined) out.push({ type: 'ref', n: Number(m[5]) })
    else if (m[6] !== undefined) out.push({ type: 'bold', value: m[6] })
    else out.push({ type: 'italic', value: m[7] })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out
}

/** Plain text with markup removed, for excerpts, search and word counts. */
export function stripInline(text: string): string {
  return removeCitations(text)
    .replace(/^```.*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\s][^*]*)\*/g, '$1')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Drop [S1]-style citations (they point at private sources) but keep other markup. */
export function removeCitations(text: string): string {
  return text.replace(/\s*\[S\d+\]/g, '')
}
