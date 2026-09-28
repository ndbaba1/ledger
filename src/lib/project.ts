import type {
  ID,
  ProjectCandidate,
  ProjectOptions,
  ProjectRecordRef,
  PublicProject,
  RecordType,
  RedactionRule,
  TeamRecord,
} from '../api/types'
import { redactToString } from './redact'

/**
 * One rule set for a whole project: each record's promotion rules merged by
 * rule, so "Service names" covers every service any of the records mention.
 * Record IDs never appear in a project, so that rule is left out.
 */
export function mergeRules(perRecord: RedactionRule[][]): RedactionRule[] {
  const byId = new Map<ID, RedactionRule>()
  for (const rules of perRecord) {
    for (const rule of rules) {
      if (rule.id === 'record-ids') continue
      const have = byId.get(rule.id)
      if (!have) {
        byId.set(rule.id, { ...rule, replacements: [...rule.replacements] })
        continue
      }
      for (const r of rule.replacements) {
        if (!have.replacements.some((x) => x.match === r.match)) have.replacements.push(r)
      }
    }
  }
  return [...byId.values()]
}

/** Who you have to be to say you led it: an author of its design or decision record. */
export function canClaimLead(records: TeamRecord[], meId: ID): boolean {
  return records.some((r) => (r.type === 'design' || r.type === 'decision') && r.authorIds.includes(meId))
}

/** What stops a project from being published, in plain words. Empty means it can go. */
export function projectProblems(candidate: ProjectCandidate, records: TeamRecord[], options: ProjectOptions, meId: ID): string[] {
  const problems: string[] = []
  const chosen = records.filter((r) => options.recordIds.includes(r.id))
  const title = options.title.trim()
  if (!title) problems.push('Give the project a name.')
  else if (title.length > 100) problems.push('Keep the name under 100 characters.')
  if (!chosen.length) problems.push('Include at least one record.')
  if (options.recordIds.some((id) => !candidate.recordIds.includes(id))) problems.push('Only records from this project can be included.')
  const notMine = chosen.filter((r) => !r.authorIds.includes(meId))
  if (notMine.length) problems.push(`You didn’t write ${notMine.map((r) => r.id).join(', ')}, so it can’t be evidence on your profile.`)
  if (options.role === 'led' && !canClaimLead(chosen, meId)) {
    problems.push('“Led” needs a design or decision record you wrote. Choose “Contributed”, or include one.')
  }
  if (options.decisionRecordIds.some((id) => !options.recordIds.includes(id))) problems.push('Key decisions must come from included records.')
  if (options.outcomeRecordId && !chosen.some((r) => r.id === options.outcomeRecordId && r.result)) {
    problems.push('The outcome must be the result of an included record.')
  }
  return problems
}

const minIso = (xs: string[]) => xs.reduce((a, b) => (b < a ? b : a))
const maxIso = (xs: string[]) => xs.reduce((a, b) => (b > a ? b : a))

/**
 * The public project. Ledger writes everything except the name: counts come
 * from the merged changes, decisions and outcome are quoted from records, and
 * all of it passes through the enabled redaction rules.
 */
export function buildProject(
  candidate: ProjectCandidate,
  records: TeamRecord[],
  options: ProjectOptions,
  ctx: { authorId: ID; slug: string; publishedAt: string; rules: RedactionRule[]; employerLine?: string },
): PublicProject {
  const rules = ctx.rules.map((r) => ({ ...r, enabled: options.enabledRuleIds.includes(r.id) }))
  const clean = (t: string) => redactToString(t, rules)
  const chosen = records.filter((r) => options.recordIds.includes(r.id))
  const ref = (r: TeamRecord): ProjectRecordRef => ({
    type: r.type,
    title: clean(r.title),
    ...(r.promotedPostSlug ? { postSlug: r.promotedPostSlug } : {}),
  })
  const order: Record<RecordType, number> = { design: 0, decision: 1, investigation: 2, incident: 3 }
  const outcomeRecord = chosen.find((r) => r.id === options.outcomeRecordId && r.result)

  const tagCount = new Map<string, number>()
  for (const r of chosen) for (const t of r.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  const dates = [...candidate.changes.map((c) => c.mergedAt), ...chosen.map((r) => r.publishedAt)]
  const authored = candidate.changes.filter((c) => c.role === 'authored').length

  return {
    slug: ctx.slug,
    authorId: ctx.authorId,
    title: clean(options.title.trim()),
    role: options.role,
    period: { from: minIso(dates), to: maxIso(dates) },
    ...(ctx.employerLine ? { employerLine: ctx.employerLine } : {}),
    changes: {
      total: candidate.changes.length,
      authored,
      reviewed: candidate.changes.length - authored,
      items: [...candidate.changes]
        .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
        .map((c) => ({ title: clean(c.title), role: c.role, mergedAt: c.mergedAt })),
    },
    records: [...chosen].sort((a, b) => order[a.type] - order[b.type]).map(ref),
    decisions: chosen.filter((r) => options.decisionRecordIds.includes(r.id)).map(ref),
    ...(outcomeRecord?.result
      ? {
          outcome: {
            label: clean(outcomeRecord.result.label),
            before: outcomeRecord.result.before,
            after: outcomeRecord.result.after,
            ...(outcomeRecord.promotedPostSlug ? { postSlug: outcomeRecord.promotedPostSlug } : {}),
          },
        }
      : {}),
    tags: [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([t]) => t),
    publishedAt: ctx.publishedAt,
  }
}

const RECORD_NOUN: Record<RecordType, [string, string]> = {
  design: ['design record', 'design records'],
  decision: ['decision record', 'decision records'],
  investigation: ['investigation', 'investigations'],
  incident: ['incident report', 'incident reports'],
}

/** "3 design records", "1 incident report"… in a stable order. */
export function recordCounts(records: ProjectRecordRef[]): { type: RecordType; label: string; publicCount: number }[] {
  const types: RecordType[] = ['design', 'decision', 'investigation', 'incident']
  return types.flatMap((type) => {
    const of = records.filter((r) => r.type === type)
    if (!of.length) return []
    return [{ type, label: `${of.length} ${RECORD_NOUN[type][of.length === 1 ? 0 : 1]}`, publicCount: of.filter((r) => r.postSlug).length }]
  })
}

/** "Aug – Sep 2026" or "Sep 2026". */
export function periodLabel(period: { from: string; to: string }): string {
  const f = new Date(period.from)
  const t = new Date(period.to)
  const m = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const y = (d: Date) => d.getUTCFullYear()
  if (y(f) === y(t) && f.getUTCMonth() === t.getUTCMonth()) return `${m(t)} ${y(t)}`
  if (y(f) === y(t)) return `${m(f)} – ${m(t)} ${y(t)}`
  return `${m(f)} ${y(f)} – ${m(t)} ${y(t)}`
}
