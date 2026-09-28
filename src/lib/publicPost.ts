import type { PostSection, PublicPost, RedactionRule, TeamRecord } from '../api/types'
import { readMinutes, wordCount } from './format'
import { removeCitations, stripInline } from './inline'
import { SECTION_LABELS } from './labels'
import { redactToString } from './redact'

/**
 * The public sections a record turns into, before redaction. Citations are
 * dropped because they point at private sources. For decisions, the decision
 * itself is shown up top (see `buildPost`), so it is not repeated here.
 */
export function rawPostSections(r: TeamRecord): PostSection[] {
  const labels = SECTION_LABELS[r.type]
  const c = removeCitations
  const list = (items: string[]) => items.map((x) => `- ${c(x)}`).join('\n')
  return [
    { heading: r.type === 'decision' ? 'Context' : 'Problem', body: c(r.symptom), kind: 'text' },
    ...(r.ruledOut.length
      ? [
          {
            heading: r.type === 'decision' ? 'Options considered' : 'Investigation',
            body: list(r.ruledOut),
            kind: r.type === 'decision' ? ('rejected' as const) : ('dead_ends' as const),
          },
        ]
      : []),
    ...(r.type === 'decision' ? [] : [{ heading: labels.rootCause, body: c(r.rootCause), kind: 'text' as const }]),
    { heading: r.type === 'decision' ? 'Consequences' : 'Solution', body: c(r.fix), kind: 'text' },
    ...(r.notes.length ? [{ heading: 'Follow-ups', body: list(r.notes), kind: 'list' as const }] : []),
  ]
}

/** Every piece of text that will be published, for counting matches. */
export function publishableTexts(r: TeamRecord): string[] {
  return [
    r.title,
    ...r.tags,
    ...rawPostSections(r).map((s) => s.body),
    ...(r.type === 'decision' ? [removeCitations(r.rootCause)] : []),
    ...(r.context ? [r.context] : []),
    ...(r.lesson ? [r.lesson] : []),
  ]
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
  const clean = (t: string) => redactToString(removeCitations(t), rules)
  const sections = rawPostSections(r)
    .map((s) => ({ ...s, body: redactBody(s.body, rules) }))
    .filter((s) => s.body.length > 0)
  return {
    ...meta,
    type: r.type,
    title: redactToString(r.title, rules),
    // Tags that had to be rewritten into prose are dropped rather than published.
    tags: r.tags.filter((t) => redactToString(t, rules) === t),
    summary: clean(r.lesson || r.rootCause),
    ...(r.context ? { context: clean(r.context) } : {}),
    ...(r.type === 'decision' ? { decision: clean(r.rootCause) } : {}),
    sections,
    ...(r.result ? { result: r.result } : {}),
    ...(r.lesson ? { lesson: clean(r.lesson) } : {}),
    promotedFromRecordId: r.id,
  }
}

export function postMinutes(post: Pick<PublicPost, 'sections' | 'decision' | 'lesson'>): number {
  const text = [post.decision ?? '', ...post.sections.map((s) => s.body), post.lesson ?? ''].join(' ')
  return readMinutes(wordCount(stripInline(text)))
}
