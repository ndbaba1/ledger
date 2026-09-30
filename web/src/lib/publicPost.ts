import type { EvidenceBadgeType, PostSection, PublicPost, RedactionRule, TeamRecord, VerifiedEvidenceItem } from '../api/types'
import { readMinutes, wordCount } from './format'
import { removeCitations, stripInline } from './inline'
import { SECTION_LABELS } from './labels'
import { redactToString } from './redact'

/**
 * A record's sections in reading order, for every type. `text` transforms
 * each run of text (e.g. dropping private citations for a public post).
 * Decisions show the decision itself up top, so it isn't repeated here.
 */
export function sectionsFor(r: TeamRecord, text: (t: string) => string = (t) => t): PostSection[] {
  const list = (items: string[]) => items.map((x) => `- ${text(x)}`).join('\n')
  const notes: PostSection[] = r.notes.length ? [{ heading: 'Follow-ups', body: list(r.notes), kind: 'list' }] : []

  if (r.type === 'design') {
    return [
      { heading: 'Goal', body: text(r.symptom), kind: 'text' },
      ...(r.constraints?.length ? [{ heading: 'Constraints', body: list(r.constraints), kind: 'list' as const }] : []),
      { heading: 'Design', body: text(r.rootCause), kind: 'text' },
      ...(r.flow?.length ? [{ heading: 'Architecture', body: list(r.flow), kind: 'flow' as const }] : []),
      ...(r.ruledOut.length ? [{ heading: 'Alternatives', body: list(r.ruledOut), kind: 'rejected' as const }] : []),
      { heading: 'Rollout', body: text(r.fix), kind: 'text' },
      ...notes,
    ]
  }
  if (r.type === 'decision') {
    return [
      { heading: 'Context', body: text(r.symptom), kind: 'text' },
      ...(r.ruledOut.length ? [{ heading: 'Options considered', body: list(r.ruledOut), kind: 'rejected' as const }] : []),
      { heading: 'Consequences', body: text(r.fix), kind: 'text' },
      ...notes,
    ]
  }
  return [
    { heading: 'Problem', body: text(r.symptom), kind: 'text' },
    ...(r.ruledOut.length ? [{ heading: 'Investigation', body: list(r.ruledOut), kind: 'dead_ends' as const }] : []),
    { heading: SECTION_LABELS[r.type].rootCause, body: text(r.rootCause), kind: 'text' },
    { heading: 'Solution', body: text(r.fix), kind: 'text' },
    ...notes,
  ]
}

/** The public sections of a record, before redaction: private citations removed. */
export function rawPostSections(r: TeamRecord): PostSection[] {
  return sectionsFor(r, removeCitations)
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

export interface EvidenceGroup {
  badgeType: EvidenceBadgeType
  label: string
  items: VerifiedEvidenceItem[]
}

const BADGE_TYPE_LABELS: Record<EvidenceBadgeType, string> = {
  authored_merged: 'Authored & merged',
  reviewed: 'Reviewed & approved',
  participated: 'Took part in',
}

/** Display order for grouped evidence, regardless of the order items arrived in. */
const BADGE_TYPE_ORDER: EvidenceBadgeType[] = ['authored_merged', 'reviewed', 'participated']

/** Buckets verified evidence by badge type, in a fixed order, dropping empty buckets. */
export function groupVerifiedEvidence(items: VerifiedEvidenceItem[]): EvidenceGroup[] {
  return BADGE_TYPE_ORDER.map((badgeType) => ({
    badgeType,
    label: BADGE_TYPE_LABELS[badgeType],
    items: items.filter((item) => item.badgeType === badgeType),
  })).filter((group) => group.items.length > 0)
}

/** "3 PRs" / "1 issue" — every item in a group shares a kind, so the first one decides the noun. */
export function evidenceCountLabel(items: VerifiedEvidenceItem[]): string {
  const noun = items[0]?.kind === 'github_issue' ? 'issue' : 'PR'
  return `${items.length} ${noun}${items.length === 1 ? '' : 's'}`
}
