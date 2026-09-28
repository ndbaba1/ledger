import type { PostSection, PublicPost, RedactionRule, TeamRecord } from '../api/types'
import { readMinutes, wordCount } from './format'
import { removeCitations, stripInline } from './inline'
import { SECTION_LABELS } from './labels'
import { redactToString } from './redact'

/**
 * The public sections a record turns into, before redaction. Citations are
 * dropped because they point at private sources.
 */
export function rawPostSections(r: TeamRecord): PostSection[] {
  const labels = SECTION_LABELS[r.type]
  const c = removeCitations
  const sections: PostSection[] = [
    { heading: labels.symptom, body: c(r.symptom) },
    ...(r.ruledOut.length ? [{ heading: labels.ruledOut, body: r.ruledOut.map((x) => `- ${c(x)}`).join('\n') }] : []),
    { heading: labels.rootCause, body: c(r.rootCause) },
    { heading: labels.fix, body: c(r.fix) },
    ...(r.notes.length ? [{ heading: 'Follow-ups', body: r.notes.map((n) => `- ${c(n)}`).join('\n') }] : []),
    ...(r.lesson ? [{ heading: 'The lesson', body: c(r.lesson) }] : []),
  ]
  return sections
}

/** Every piece of text that will be published, for counting matches. */
export function publishableTexts(r: TeamRecord): string[] {
  return [r.title, ...r.tags, ...rawPostSections(r).map((s) => s.body)]
}

/** Apply redactions line by line so list markers survive. */
function redactBody(body: string, rules: RedactionRule[]): string {
  return body
    .split('\n')
    .map((line) => {
      const bullet = line.startsWith('- ')
      const text = redactToString(bullet ? line.slice(2) : line, rules)
      return bullet ? (text ? `- ${text}` : '') : text
    })
    .filter((line) => line.length > 0)
    .join('\n')
}

export function buildPost(
  r: TeamRecord,
  rules: RedactionRule[],
  meta: Pick<PublicPost, 'slug' | 'publishedAt' | 'employerLine' | 'badges' | 'authorId'>,
): PublicPost {
  const sections = rawPostSections(r)
    .map((s) => ({ heading: s.heading, body: redactBody(s.body, rules) }))
    .filter((s) => s.body.length > 0)
  return {
    ...meta,
    type: r.type,
    title: redactToString(r.title, rules),
    // Tags that had to be rewritten into prose are dropped rather than published.
    tags: r.tags.filter((t) => redactToString(t, rules) === t),
    summary: redactToString(removeCitations(r.lesson || r.rootCause), rules),
    sections,
    promotedFromRecordId: r.id,
  }
}

export function postMinutes(post: Pick<PublicPost, 'sections'>): number {
  return readMinutes(wordCount(stripInline(post.sections.map((s) => s.body).join(' '))))
}
