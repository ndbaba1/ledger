import type { ID, RecordType, Source, TeamRecord, Writeup, WriteupFields } from '../api/types'

export type FieldKey = 'context' | 'symptom' | 'constraints' | 'rootCause' | 'flow' | 'ruledOut' | 'fix' | 'lesson'

export interface FieldDef {
  key: FieldKey
  label: string
  help: string
  /** 'short' = one line, 'text' = paragraph, 'lines' = one item per line. */
  kind: 'short' | 'text' | 'lines'
  required?: boolean
  /** For text fields: prompt shown in the empty editor. For lists: example first item. */
  placeholder?: string
  /** For list fields: what one item is called ("dead end", "constraint"). */
  itemName?: string
  /** For list fields: show 01, 02… instead of bullets. */
  numbered?: boolean
}

export interface TypeInfo {
  label: string
  blurb: string
  /** Example of the kind of thing this type is for. */
  example: string
  fields: FieldDef[]
}

const context: FieldDef = {
  key: 'context',
  label: 'Environment',
  help: 'Versions, scale and the service or job involved. Shown under the title.',
  kind: 'short',
  placeholder: 'PostgreSQL 16 · PgBouncer · checkout-api at peak',
}
const lesson: FieldDef = {
  key: 'lesson',
  label: 'Lesson',
  help: 'The one thing you’d tell the next engineer. It becomes the highlighted takeaway.',
  kind: 'text',
  placeholder: 'Alert on waiting clients, not on database CPU.',
}

function problemFields(deadEndsHelp: string): FieldDef[] {
  return [
    context,
    {
      key: 'symptom',
      label: 'Problem',
      help: 'What was wrong, and how it showed up.',
      kind: 'text',
      required: true,
      placeholder: 'p99 went from 310ms to 4.2s at lunchtime peak…',
    },
    {
      key: 'ruledOut',
      label: 'Dead ends',
      help: deadEndsHelp,
      kind: 'lines',
      itemName: 'dead end',
      numbered: true,
      placeholder: 'Scaled read replicas — primary CPU was only 41%',
    },
    {
      key: 'rootCause',
      label: 'Root cause',
      help: 'What was actually going on, and how you proved it.',
      kind: 'text',
      required: true,
      placeholder: 'A config change halved the pool, so clients queued…',
    },
    {
      key: 'fix',
      label: 'Solution',
      help: 'What you changed, and anything you added so it can’t recur.',
      kind: 'text',
      required: true,
      placeholder: 'Reverted, then derived the pool size from worker count…',
    },
    lesson,
  ]
}

export const TYPE_INFO: Record<RecordType, TypeInfo> = {
  incident: {
    label: 'Incident',
    blurb: 'Something broke or slowed down in production.',
    example: 'Checkout p99 hit 4.2s after a config change',
    fields: problemFields('One per line: what you checked that turned out not to be the cause.'),
  },
  investigation: {
    label: 'Investigation',
    blurb: 'A puzzling bug or behaviour you had to dig into.',
    example: 'Why a “read-only” login could delete rows',
    fields: problemFields('One per line: what you tried or suspected first.'),
  },
  decision: {
    label: 'Decision',
    blurb: 'A choice between options, recorded with the reasoning.',
    example: 'Derive pool sizes from worker count',
    fields: [
      context,
      { key: 'symptom', label: 'Context', help: 'What prompted the decision.', kind: 'text', required: true, placeholder: 'Pool sizes were hand-set and drifted…' },
      {
        key: 'rootCause',
        label: 'Decision',
        help: 'What you decided, in a sentence or two. Shown up top.',
        kind: 'text',
        required: true,
        placeholder: 'Compute pool size from workers × threads × pods.',
      },
      {
        key: 'ruledOut',
        label: 'Options rejected',
        help: 'Each option, and why you didn’t pick it.',
        kind: 'lines',
        required: true,
        itemName: 'option',
        numbered: true,
        placeholder: 'Keep hand-tuning — relies on people remembering',
      },
      {
        key: 'fix',
        label: 'Consequences',
        help: 'What changes because of this, good and bad.',
        kind: 'text',
        required: true,
        placeholder: 'Every service picks this up on its next deploy…',
      },
      lesson,
    ],
  },
  design: {
    label: 'Design',
    blurb: 'A system, service or feature you designed and built.',
    example: 'Webhook delivery with retries and a dead-letter queue',
    fields: [
      context,
      { key: 'symptom', label: 'Goal', help: 'What it needs to do, and for whom.', kind: 'text', required: true, placeholder: 'Deliver webhooks at least once without blocking the API…' },
      {
        key: 'constraints',
        label: 'Constraints',
        help: 'Scale, latency, cost, deadlines.',
        kind: 'lines',
        itemName: 'constraint',
        placeholder: 'About 2,000 events per second at peak',
      },
      { key: 'rootCause', label: 'Design', help: 'How it works.', kind: 'text', required: true, placeholder: 'Write each event to an outbox table in the same transaction…' },
      {
        key: 'flow',
        label: 'Architecture',
        help: 'The main path through the system, in order. It becomes a diagram.',
        kind: 'lines',
        itemName: 'component',
        numbered: true,
        placeholder: 'API writes the change and an outbox row',
      },
      {
        key: 'ruledOut',
        label: 'Alternatives',
        help: 'Each option you considered, and why not.',
        kind: 'lines',
        itemName: 'alternative',
        numbered: true,
        placeholder: 'Kafka — a new cluster to run for a two-person team',
      },
      {
        key: 'fix',
        label: 'Rollout',
        help: 'How it shipped: flags, migrations, backfills. Needed before publishing.',
        kind: 'text',
        placeholder: 'Dual-sent behind a flag for a week, then moved customers in 10% cohorts…',
      },
      lesson,
    ],
  },
}

export const EMPTY_FIELDS: WriteupFields = {
  title: '',
  context: '',
  symptom: '',
  constraints: [],
  rootCause: '',
  flow: [],
  ruledOut: [],
  fix: '',
  lesson: '',
  signals: [],
}

export interface Requirement {
  label: string
  done: boolean
}

/** What must be true before a write-up can be published to the team. */
export function publishRequirements(w: Pick<Writeup, keyof WriteupFields | 'type' | 'status' | 'evidence'>): Requirement[] {
  const info = TYPE_INFO[w.type]
  const filled = (k: FieldKey) => {
    const v = w[k]
    return Array.isArray(v) ? v.some((x) => x.trim()) : v.trim().length > 0
  }
  const reqs: Requirement[] = [{ label: 'A title', done: w.title.trim().length > 0 }]
  for (const f of info.fields) {
    if (f.required) reqs.push({ label: f.label, done: filled(f.key) })
  }
  if (w.type === 'design') {
    reqs.push({ label: 'Marked as shipped', done: w.status === 'shipped' })
    reqs.push({ label: 'Rollout', done: filled('fix') })
    reqs.push({ label: 'A result after launch', done: Boolean(w.result?.label && w.result.before && w.result.after) })
  }
  reqs.push({
    label: 'A verified PR you authored or reviewed',
    done: w.evidence.some((e) => e.kind === 'github_pr' && e.verified),
  })
  return reqs
}

export function publishBlockers(w: Parameters<typeof publishRequirements>[0]): string[] {
  return publishRequirements(w)
    .filter((r) => !r.done)
    .map((r) => r.label)
}

/** Split a textarea into list items: one per non-empty line, leading bullets removed. */
export function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}

/** Shape a write-up as a record, for previewing and for publishing. */
export function writeupToRecord(
  w: Writeup,
  opts: { id: ID; publishedAt: string; authorId: ID },
): TeamRecord {
  const evidence: Source[] = w.evidence.map((e, i) => ({ ...e, key: `S${i + 1}` }))
  return {
    id: opts.id,
    type: w.type,
    title: w.title.trim(),
    tags: [],
    authorIds: [opts.authorId],
    publishedAt: opts.publishedAt,
    symptom: w.symptom.trim(),
    rootCause: w.rootCause.trim(),
    ruledOut: w.ruledOut,
    fix: w.fix.trim(),
    lesson: w.lesson.trim(),
    ...(w.context.trim() ? { context: w.context.trim() } : {}),
    ...(w.result && w.result.label && w.result.before && w.result.after ? { result: w.result } : {}),
    ...(w.constraints.length ? { constraints: w.constraints } : {}),
    ...(w.flow.length ? { flow: w.flow } : {}),
    ...(w.signals.length ? { signals: w.signals } : {}),
    notes: [],
    sources: evidence,
    questions: [],
    history: [{ at: opts.publishedAt, byId: opts.authorId, summary: 'Published from a write-up' }],
    relatedIds: [],
  }
}
