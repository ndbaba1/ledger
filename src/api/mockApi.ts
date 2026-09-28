import { NotFoundError, type LedgerApi } from './client'
import * as seed from './fixtures'
import type {
  Badge,
  Draft,
  Gap,
  GapStatus,
  ID,
  PromotionPlan,
  RedactionRule,
  SearchHit,
  Source,
  TeamRecord,
} from './types'
import { isValidUrl, sourceFromUrl } from '../lib/sources'
import { stripInline } from '../lib/inline'
import { monthYear } from '../lib/format'
import { buildPost, publishableTexts } from '../lib/publicPost'

export interface MockApiOptions {
  /** Artificial latency so loading states are visible. Use 0 in tests. */
  latencyMs?: number
  now?: () => Date
}

const INDUSTRY_LABEL = 'a fintech company'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .split('-')
    .slice(0, 8)
    .join('-')
}

/** An in-memory implementation of the API, seeded from fixtures. */
export function createMockApi(options: MockApiOptions = {}): LedgerApi {
  const latency = options.latencyMs ?? 180
  const now = options.now ?? (() => new Date())

  const db = {
    users: clone(seed.users),
    workspace: clone(seed.workspace),
    drafts: clone(seed.drafts),
    cases: clone(seed.cases),
    records: clone(seed.records),
    posts: clone(seed.posts),
    rules: clone(seed.promotionRules),
  }

  const respond = <T,>(value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(clone(value)), latency))

  const fail = (err: Error): Promise<never> =>
    new Promise((_, reject) => setTimeout(() => reject(err), latency))

  const draftById = (id: ID): Draft => {
    const d = db.drafts.find((x) => x.id === id || x.slug === id)
    if (!d) throw new NotFoundError(`Draft ${id}`)
    return d
  }
  const recordById = (id: ID): TeamRecord => {
    const r = db.records.find((x) => x.id === id)
    if (!r) throw new NotFoundError(`Record ${id}`)
    return r
  }
  const gapById = (draft: Draft, gapId: ID): Gap => {
    const g = draft.gaps.find((x) => x.id === gapId)
    if (!g) throw new NotFoundError(`Gap ${gapId}`)
    return g
  }

  // Wraps a synchronous operation so thrown errors become rejected promises.
  const run = <T,>(fn: () => T): Promise<T> => {
    try {
      return respond(fn())
    } catch (e) {
      return fail(e instanceof Error ? e : new Error(String(e)))
    }
  }

  const setGap = (draftId: ID, gapId: ID, status: GapStatus, answer?: string) =>
    run(() => {
      const d = draftById(draftId)
      const g = gapById(d, gapId)
      g.status = status
      g.answer = answer
      return d
    })

  const nextRecordId = (): ID => {
    const max = db.records.reduce((m, r) => Math.max(m, Number(r.id.split('-')[1]) || 0), 0)
    return `LR-${max + 1}`
  }

  const plannedRules = (record: TeamRecord): RedactionRule[] => {
    if (db.rules[record.id]) return clone(db.rules[record.id])
    const names = db.users
      .filter((u) => u.id !== seed.ME_ID && publishableTexts(record).some((t) => t.includes(u.name)))
      .map((u) => ({ match: u.name, with: 'a teammate' }))
    const rules: RedactionRule[] = []
    if (names.length) rules.push({ id: 'teammates', label: 'Teammate names', replacements: names, enabled: true })
    rules.push({
      id: 'workspace',
      label: 'Team name',
      replacements: [{ match: db.workspace.name, with: 'The team' }],
      enabled: true,
    })
    return rules
  }

  const badgeFor = (source: Source, record: TeamRecord): Badge | null => {
    const when = monthYear(record.publishedAt)
    const host = source.kind.startsWith('github') ? 'GitHub' : 'GitLab'
    if ((source.kind === 'gitlab_mr' || source.kind === 'github_pr') && source.authoredByMe) {
      return { label: 'Authored & merged the fix', detail: `private ${host} project · ${when}`, verified: true }
    }
    if ((source.kind === 'gitlab_issue' || source.kind === 'github_issue') && source.hops === 0) {
      return { label: 'Participated in the investigation', detail: when, verified: true }
    }
    return null
  }

  const api: LedgerApi = {
    me: () => run(() => db.users.find((u) => u.id === seed.ME_ID)!),
    workspace: () => respond(db.workspace),
    users: (ids) => respond(db.users.filter((u) => ids.includes(u.id))),

    listDrafts: () =>
      respond(
        db.drafts
          .filter((d) => d.status === 'needs_review')
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),
    getDraft: (id) => run(() => draftById(id)),
    answerGap: (draftId, gapId, answer) => {
      if (!answer.trim()) return fail(new Error('Write an answer or paste a link first.'))
      return setGap(draftId, gapId, 'answered', answer.trim())
    },
    keepGapUnverified: (draftId, gapId) => setGap(draftId, gapId, 'kept_unverified'),
    removeGapClaim: (draftId, gapId) => setGap(draftId, gapId, 'removed'),
    reopenGap: (draftId, gapId) => setGap(draftId, gapId, 'open'),

    addSource: (draftId, url) =>
      run(() => {
        if (!isValidUrl(url)) throw new Error('That doesn’t look like a link. Paste a full https:// URL.')
        const d = draftById(draftId)
        if (d.sources.some((s) => s.url === url.trim())) throw new Error('That source is already in the case file.')
        d.sources.push(sourceFromUrl(url, d.sources))
        return d
      }),

    approveDraft: (draftId) =>
      run(() => {
        const d = draftById(draftId)
        const open = d.gaps.filter((g) => g.status === 'open').length
        if (open) throw new Error(`Resolve ${open} open gap${open === 1 ? '' : 's'} first.`)
        if (d.status === 'published' && d.publishedRecordId) return recordById(d.publishedRecordId)
        const at = now().toISOString()
        const record: TeamRecord = {
          id: nextRecordId(),
          type: d.type,
          title: d.title,
          tags: [d.service],
          authorIds: d.coAuthorIds,
          publishedAt: at,
          symptom: d.summary,
          rootCause: d.rootCause,
          ruledOut: d.timeline.filter((t) => t.kind === 'dead_end').map((t) => t.text),
          fix: d.fix,
          lesson: '',
          notes: d.gaps.filter((g) => g.status === 'answered' && g.answer).map((g) => g.answer!),
          sources: d.sources,
          questions: [],
          history: [{ at, byId: seed.ME_ID, summary: `Published from draft ${d.slug}` }],
          relatedIds: [],
        }
        db.records.unshift(record)
        d.status = 'published'
        d.publishedRecordId = record.id
        return record
      }),

    listCases: () => respond(db.cases),

    listRecords: () => respond([...db.records].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))),
    getRecord: (id) => run(() => recordById(id)),

    askQuestion: (recordId, body) =>
      run(() => {
        if (!body.trim()) throw new Error('Write a question first.')
        const r = recordById(recordId)
        r.questions.push({
          id: `q${r.questions.length + 1}_${Date.now().toString(36)}`,
          authorId: seed.ME_ID,
          authorRole: r.authorIds.includes(seed.ME_ID) ? 'author' : 'reader',
          body: body.trim(),
          at: now().toISOString(),
        })
        return r
      }),

    answerQuestion: (recordId, questionId, body) =>
      run(() => {
        if (!body.trim()) throw new Error('Write an answer first.')
        const r = recordById(recordId)
        const q = r.questions.find((x) => x.id === questionId)
        if (!q) throw new NotFoundError(`Question ${questionId}`)
        q.answer = { authorId: seed.ME_ID, body: body.trim(), at: now().toISOString() }
        return r
      }),

    foldAnswer: (recordId, questionId) =>
      run(() => {
        const r = recordById(recordId)
        const q = r.questions.find((x) => x.id === questionId)
        if (!q?.answer) throw new Error('Only answered questions can be folded in.')
        if (!q.folded) {
          q.folded = true
          r.notes.push(q.answer.body)
          r.history.push({ at: now().toISOString(), byId: seed.ME_ID, summary: 'Folded an answer from Q&A into the record' })
        }
        return r
      }),

    search: (query, type) =>
      run(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean)
        const pool = db.records.filter((r) => !type || r.type === type)
        if (!words.length) {
          return pool.map<SearchHit>((record) => ({ record, excerpt: stripInline(record.symptom) }))
        }
        const hits: (SearchHit & { score: number })[] = []
        for (const record of pool) {
          const fields = [record.title, record.tags.join(' '), ...recordText(record)].map(stripInline)
          const haystack = fields.join('\n').toLowerCase()
          if (!words.every((w) => haystack.includes(w))) continue
          const title = record.title.toLowerCase()
          const score = words.reduce(
            (sum, w) => sum + (title.includes(w) ? 2 : 0) + (record.tags.some((t) => t.includes(w)) ? 1 : 0),
            0,
          )
          const field = fields.slice(2).find((f) => f.toLowerCase().includes(words[0])) ?? stripInline(record.symptom)
          hits.push({ record, excerpt: excerptAround(field, words[0]), score })
        }
        return hits
          .sort((a, b) => b.score - a.score || b.record.publishedAt.localeCompare(a.record.publishedAt))
          .map(({ record, excerpt }) => ({ record, excerpt }))
      }),

    getPromotionPlan: (recordId) =>
      run<PromotionPlan>(() => {
        const r = recordById(recordId)
        return {
          recordId: r.id,
          slug: r.promotedPostSlug ?? slugify(r.title),
          rules: plannedRules(r),
          industryLabel: INDUSTRY_LABEL,
          workspaceName: db.workspace.name,
          evidence: r.sources.map((source) => ({ source, becomes: badgeFor(source, r) })),
        }
      }),

    publishPost: (recordId, opts) =>
      run(() => {
        const r = recordById(recordId)
        const rules = plannedRules(r).map((rule) => ({ ...rule, enabled: opts.enabledRuleIds.includes(rule.id) }))
        const post = buildPost(r, rules, {
          authorId: seed.ME_ID,
          slug: r.promotedPostSlug ?? slugify(r.title),
          publishedAt: now().toISOString(),
          employerLine:
            opts.employerMode === 'hidden'
              ? undefined
              : `at ${opts.employerMode === 'industry' ? INDUSTRY_LABEL : db.workspace.name}`,
          badges: r.sources.map((s) => badgeFor(s, r)).filter((b): b is Badge => b !== null),
        })
        db.posts = [post, ...db.posts.filter((p) => p.slug !== post.slug)]
        if (!r.promotedPostSlug) {
          r.history.push({ at: post.publishedAt, byId: seed.ME_ID, summary: 'Promoted to a public post' })
        }
        r.promotedPostSlug = post.slug
        return post
      }),

    getProfile: (handle) =>
      run(() => {
        const user = db.users.find((u) => u.handle === handle)
        if (!user) throw new NotFoundError(`@${handle}`)
        const posts = db.posts
          .filter((p) => p.authorId === user.id)
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        return { user, posts }
      }),

    getPost: (handle, slug) =>
      run(() => {
        const author = db.users.find((u) => u.handle === handle)
        const post = author && db.posts.find((p) => p.authorId === author.id && p.slug === slug)
        if (!author || !post) throw new NotFoundError('Post')
        return { post, author }
      }),
  }

  return api
}

function recordText(r: TeamRecord): string[] {
  return [r.symptom, r.rootCause, ...r.ruledOut, r.fix, r.lesson, ...r.notes]
}

function excerptAround(text: string, word: string, radius = 70): string {
  const at = text.toLowerCase().indexOf(word)
  if (at === -1 || text.length <= radius * 2) return text
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + word.length + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}
