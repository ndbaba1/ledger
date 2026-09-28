import { NotFoundError, type LedgerApi } from './client'
import * as seed from './fixtures'
import type {
  Integration,
  Invite,
  WorkspaceRole,
  WorkspaceSettings,
  PostThread,
  TopicPage,
  ExploreResult,
  Writeup,
  AskAnswer,
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
import { removeCitations, stripInline } from '../lib/inline'
import { monthYear } from '../lib/format'
import { buildPost, publishableTexts } from '../lib/publicPost'
import { EMPTY_FIELDS, publishBlockers, toLines, writeupToRecord } from '../lib/writeups'
import { matchRecords } from '../lib/signals'

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
    posts: clone([...seed.posts, ...seed.communityPosts]),
    rules: clone(seed.promotionRules),
    writeups: clone(seed.writeups),
    publicQuestions: clone(seed.publicQuestions),
    hitsByMe: new Set(seed.hitsByMe),
    members: clone(seed.members),
    formerMembers: clone(seed.formerMembers),
    invites: clone(seed.invites),
    integrations: clone(seed.integrations),
    policy: clone(seed.policy),
    inviteLink: { token: seed.inviteLinkToken, enabled: true },
    autoJoinDomain: seed.autoJoinDomain as string | null,
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
  const postBy = (handle: string, slug: string) => {
    const author = db.users.find((u) => u.handle === handle)
    const post = author && db.posts.find((p) => p.authorId === author.id && p.slug === slug)
    if (!author || !post) throw new NotFoundError('Post')
    return { post, author }
  }

  /** Readers see answered questions; the author also sees pending ones to act on. */
  const thread = (handle: string, slug: string): PostThread => {
    const { post } = postBy(handle, slug)
    const key = `${handle}/${slug}`
    const all = db.publicQuestions[key] ?? []
    const isAuthor = post.authorId === seed.ME_ID
    const questions = all.filter((q) => q.status === 'answered' || (isAuthor && q.status === 'pending'))
    const mine = isAuthor ? [] : all.filter((q) => q.askerId === seed.ME_ID && q.status === 'pending')
    const askerIds = new Set([...questions, ...mine].map((q) => q.askerId))
    return {
      questions,
      askers: db.users.filter((u) => askerIds.has(u.id)),
      mine,
      hitCount: post.hitCount ?? 0,
      hitByMe: db.hitsByMe.has(key),
    }
  }

  const authorsQuestion = (handle: string, slug: string, questionId: ID) => {
    const { post } = postBy(handle, slug)
    if (post.authorId !== seed.ME_ID) throw new Error('Only the author can do that.')
    const q = (db.publicQuestions[`${handle}/${slug}`] ?? []).find((x) => x.id === questionId)
    if (!q) throw new NotFoundError('Question')
    return q
  }


  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  /** `@Handle` and bare `handle` become `@handle`; emails are lowercased. */
  const normalizeTarget = (raw: string) => {
    const t = raw.trim().toLowerCase()
    if (!t) return ''
    if (t.startsWith('@')) return t
    return t.includes('@') ? t : `@${t}`
  }
  const DAY = 86_400_000
  const PROVIDER_NAME: Record<Integration['provider'], string> = { gitlab: 'GitLab', github: 'GitHub', slack: 'Slack' }

  const myRole = (): WorkspaceRole => db.members.find((m) => m.userId === seed.ME_ID)?.role ?? 'member'
  const requireAdmin = () => {
    if (myRole() === 'member') throw new Error('Only workspace owners and admins can change this.')
  }
  const syncConnections = () => {
    db.workspace.connections = db.integrations
      .filter((i) => i.connected)
      .map((i) => ({ provider: i.provider, label: i.detail }))
  }

  const settings = (): WorkspaceSettings => {
    const users = new Map(db.users.map((u) => [u.id, u]))
    const order: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2 }
    return {
      workspace: db.workspace,
      myRole: myRole(),
      members: db.members
        .map(({ userId, ...m }) => ({ ...m, user: users.get(userId)! }))
        .filter((m) => m.user)
        .sort((a, b) => order[a.role] - order[b.role] || a.user.name.localeCompare(b.user.name)),
      formerMembers: db.formerMembers
        .map(({ userId, ...m }) => ({ ...m, user: users.get(userId)! }))
        .filter((m) => m.user)
        .sort((a, b) => b.leftAt.localeCompare(a.leftAt)),
      invites: [...db.invites]
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
        .map(({ userId, ...inv }): Invite => (userId ? { ...inv, user: users.get(userId) } : inv)),
      inviteLink: db.inviteLink,
      autoJoinDomain: db.autoJoinDomain,
      integrations: db.integrations,
      policy: db.policy,
    }
  }

  const ownerCount = () => db.members.filter((m) => m.role === 'owner').length

  const writeupById = (id: ID): Writeup => {
    const w = db.writeups.find((x) => x.id === id)
    if (!w) throw new NotFoundError(`Write-up ${id}`)
    return w
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

  /** Internal record IDs (LR-212) mean nothing outside the team; describe them instead. */
  const recordIdRule = (record: TeamRecord): RedactionRule | null => {
    const ids = [...new Set(publishableTexts(record).join(' ').match(/\bLR-\d+\b/g) ?? [])]
    if (!ids.length) return null
    const noun: Record<TeamRecord['type'], string> = {
      incident: 'an earlier incident',
      investigation: 'an earlier investigation',
      decision: 'an earlier decision',
      design: 'an earlier design',
    }
    return {
      id: 'record-ids',
      label: 'Internal record IDs',
      replacements: ids.map((id) => {
        const ref = db.records.find((x) => x.id === id)
        return { match: id, with: ref ? noun[ref.type] : 'an earlier record' }
      }),
      enabled: true,
    }
  }

  const plannedRules = (record: TeamRecord): RedactionRule[] => {
    const idRule = recordIdRule(record)
    return [...baseRules(record), ...(idRule ? [idRule] : [])]
  }

  const baseRules = (record: TeamRecord): RedactionRule[] => {
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
      const what = record.type === 'design' ? 'the implementation' : record.type === 'decision' ? 'the change' : 'the fix'
      return { label: `Authored & merged ${what}`, detail: `private ${host} project · ${when}`, verified: true }
    }
    if ((source.kind === 'gitlab_issue' || source.kind === 'github_issue') && source.hops === 0) {
      const what = record.type === 'design' ? 'the design review' : record.type === 'decision' ? 'the decision' : 'the investigation'
      return { label: `Participated in ${what}`, detail: when, verified: true }
    }
    return null
  }

  // Records that were promoted in the seed data get their public post built the same way publishing does.
  for (const r of db.records) {
    if (r.promotedPostSlug && !db.posts.some((p) => p.slug === r.promotedPostSlug)) {
      db.posts.push(
        buildPost(r, plannedRules(r), {
          authorId: seed.ME_ID,
          slug: r.promotedPostSlug,
          publishedAt: r.publishedAt,
          employerLine: undefined,
          badges: r.sources.map((src) => badgeFor(src, r)).filter((b): b is Badge => b !== null),
        }),
      )
    }
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
          ...(d.signals?.length ? { signals: d.signals } : {}),
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

    listWriteups: () =>
      respond(
        db.writeups
          .filter((w) => !w.publishedRecordId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),

    createWriteup: (type) =>
      run(() => {
        const at = now().toISOString()
        const w: Writeup = {
          ...clone(EMPTY_FIELDS),
          id: `w_${Date.now().toString(36)}${db.writeups.length}`,
          type,
          status: type === 'design' ? 'proposed' : 'draft',
          evidence: [],
          authorId: seed.ME_ID,
          createdAt: at,
          updatedAt: at,
        }
        db.writeups.unshift(w)
        return w
      }),

    getWriteup: (id) => run(() => writeupById(id)),

    saveWriteup: (id, fields) =>
      run(() => {
        const w = writeupById(id)
        if (w.publishedRecordId) throw new Error('This write-up is already published.')
        const clean = { ...fields }
        // List fields arrive as arrays; drop blank items so the preview and record stay tidy.
        for (const k of ['constraints', 'flow', 'ruledOut'] as const) {
          if (clean[k]) clean[k] = toLines(clean[k]!.join('\n'))
        }
        if (clean.signals) clean.signals = clean.signals.map((x) => ({ ...x, value: x.value.trim() })).filter((x) => x.value)
        Object.assign(w, clean, { updatedAt: now().toISOString() })
        return w
      }),

    addWriteupEvidence: (id, url) =>
      run(() => {
        if (!isValidUrl(url)) throw new Error('That doesn’t look like a link. Paste a full https:// URL.')
        const w = writeupById(id)
        if (w.evidence.some((e) => e.url === url.trim())) throw new Error('That link is already attached.')
        w.evidence.push(sourceFromUrl(url, w.evidence))
        w.updatedAt = now().toISOString()
        return w
      }),

    removeWriteupEvidence: (id, key) =>
      run(() => {
        const w = writeupById(id)
        w.evidence = w.evidence.filter((e) => e.key !== key)
        return w
      }),

    setWriteupStatus: (id, status) =>
      run(() => {
        const w = writeupById(id)
        if (w.type !== 'design' && status !== 'draft') throw new Error('Only designs are proposed or shipped.')
        if (w.type === 'design' && status === 'draft') throw new Error('A design is either proposed or shipped.')
        w.status = status
        w.updatedAt = now().toISOString()
        return w
      }),

    publishWriteup: (id) =>
      run(() => {
        const w = writeupById(id)
        if (w.publishedRecordId) return recordById(w.publishedRecordId)
        const missing = publishBlockers(w)
        if (missing.length) throw new Error(`Not ready to publish. Still needed: ${missing.join(', ')}.`)
        const record = writeupToRecord(w, { id: nextRecordId(), publishedAt: now().toISOString(), authorId: seed.ME_ID })
        db.records.unshift(record)
        w.publishedRecordId = record.id
        return record
      }),

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
        const raw = query.toLowerCase().split(/\s+/).filter(Boolean)
        // Questions search on their meaningful words; short queries use every word.
        const keys = keywordsOf(query)
        const questionMode = raw.length > 2 && keys.length > 0
        const words = questionMode ? keys : raw
        // Short queries need every word; questions need at least half their meaningful words.
        const needed = questionMode ? Math.max(1, Math.ceil(words.length / 2)) : words.length
        const pool = db.records.filter((r) => !type || r.type === type)
        if (!words.length) {
          return pool.map<SearchHit>((record) => ({ record, excerpt: stripInline(record.symptom) }))
        }
        const hits: (SearchHit & { score: number })[] = []
        for (const record of pool) {
          const fields = [record.title, record.tags.join(' '), ...recordText(record)].map(stripInline)
          const haystack = fields.join('\n').toLowerCase()
          if (words.filter((w) => haystack.includes(w)).length < needed) continue
          const title = record.title.toLowerCase()
          const score = words.reduce(
            (sum, w) => sum + (title.includes(w) ? 2 : 0) + (record.tags.some((t) => t.includes(w)) ? 1 : 0),
            0,
          )
          const hitWord = words.find((w) => haystack.includes(w)) ?? words[0]
          const field = fields.slice(2).find((f) => f.toLowerCase().includes(hitWord)) ?? stripInline(record.symptom)
          hits.push({ record, excerpt: excerptAround(field, hitWord), score })
        }
        return hits
          .sort((a, b) => b.score - a.score || b.record.publishedAt.localeCompare(a.record.publishedAt))
          .map(({ record, excerpt }) => ({ record, excerpt }))
      }),

    ask: (question) =>
      run<AskAnswer>(() => {
        const q = question.trim()
        if (!q) throw new Error('Ask a question first.')
        const keywords = keywordsOf(q)
        const scored = db.records
          .map((record) => {
            const title = record.title.toLowerCase()
            const tags = record.tags.join(' ').toLowerCase()
            const body = recordText(record).map(stripInline).join(' ').toLowerCase()
            let score = 0
            let matched = 0
            for (const k of keywords) {
              const s = (hasWord(title, k) ? 3 : 0) + (hasWord(tags, k) ? 2 : 0) + (hasWord(body, k) ? 1 : 0)
              score += s
              if (s) matched++
            }
            return { record, score, matched }
          })
          // A record must cover at least half of what was asked, not one incidental word.
          .filter((x) => x.matched >= Math.max(1, Math.ceil(keywords.length / 2)))
          .sort((a, b) => b.score - a.score || b.record.publishedAt.localeCompare(a.record.publishedAt))
          .slice(0, 3)

        if (!scored.length) return { question: q, answer: null, citations: [] }

        const citations = scored.map(({ record }, i) => ({ n: i + 1, recordId: record.id, title: record.title }))
        const times = scored.length === 1 ? 'once' : `${scored.length} times`
        const parts = [`Yes — this has come up ${times} before.`]
        scored.forEach(({ record }, i) => {
          parts.push(`In [${i + 1}], ${lowerFirst(sentence(removeCitations(record.rootCause)))}`)
        })
        const lesson = scored.find((x) => x.record.lesson)?.record.lesson
        if (lesson) parts.push(`What stuck: ${lowerFirst(sentence(lesson))}`)
        return { question: q, answer: parts.join(' '), citations }
      }),

    matchSignal: (text) =>
      run(() => {
        if (!text.trim()) throw new Error('Paste an alert, metric or error message.')
        return matchRecords(text, db.records).slice(0, 5)
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
        if (db.policy.publicPromotion === 'off') throw new Error('Your workspace has turned off publishing records to public profiles.')
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

    explore: ({ query = '', type, tag }) =>
      run<ExploreResult>(() => {
        const authors = new Map(db.users.map((u) => [u.id, u]))
        const all = db.posts
          .map((post) => ({ post, author: authors.get(post.authorId)! }))
          .filter((x) => x.author)

        const counts = new Map<string, number>()
        for (const { post } of all) for (const t of post.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
        const tags = [...counts.entries()]
          .map(([t, count]) => ({ tag: t, count }))
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
          .slice(0, 12)

        let items = all.filter(({ post }) => (!type || post.type === type) && (!tag || post.tags.includes(tag)))

        const q = query.trim().toLowerCase()
        if (q) {
          const raw = q.split(/\s+/)
          const keys = keywordsOf(q)
          const words = raw.length > 2 && keys.length ? keys : raw
          const needed = raw.length > 2 && keys.length ? Math.max(1, Math.ceil(words.length / 2)) : words.length
          const scored = items
            .map((item) => {
              const { post, author } = item
              const title = post.title.toLowerCase()
              const hay = [
                post.title,
                post.summary,
                post.context ?? '',
                post.decision ?? '',
                post.lesson ?? '',
                post.tags.join(' '),
                author.name,
                author.handle,
                ...post.sections.map((s) => s.body),
              ]
                .map(stripInline)
                .join('\n')
                .toLowerCase()
              const matched = words.filter((w) => hay.includes(w)).length
              const score = words.reduce((n, w) => n + (title.includes(w) ? 3 : 0) + (post.tags.some((t) => t.includes(w)) ? 2 : 0), matched)
              return { item, matched, score }
            })
            .filter((x) => x.matched >= needed)
            .sort((a, b) => b.score - a.score || b.item.post.publishedAt.localeCompare(a.item.post.publishedAt))
          items = scored.map((x) => x.item)
        } else {
          items = [...items].sort((a, b) => b.post.publishedAt.localeCompare(a.post.publishedAt))
        }

        return { items, tags, total: all.length }
      }),

    getWorkspaceSettings: () => run(settings),

    inviteMembers: (targets, role) =>
      run(() => {
        requireAdmin()
        if (role === 'owner' && myRole() !== 'owner') throw new Error('Only owners can invite other owners.')
        const wanted = [...new Set(targets.map(normalizeTarget).filter(Boolean))]
        if (!wanted.length) throw new Error('Add at least one username or email.')
        const sent: string[] = []
        const skipped: { target: string; reason: string }[] = []
        const at = now()
        const invite = (to: { userId?: string; email?: string }) =>
          db.invites.push({
            id: `inv_${Date.now().toString(36)}${db.invites.length}`,
            ...to,
            role,
            invitedById: seed.ME_ID,
            sentAt: at.toISOString(),
            expiresAt: new Date(at.getTime() + 14 * DAY).toISOString(),
          })
        for (const target of wanted) {
          if (target.startsWith('@')) {
            const user = db.users.find((u) => u.handle.toLowerCase() === target.slice(1))
            if (!user) skipped.push({ target, reason: 'no Ledger account with that username. Invite them by email instead' })
            else if (db.members.some((m) => m.userId === user.id)) skipped.push({ target, reason: 'already a member' })
            else if (db.invites.some((i) => i.userId === user.id)) skipped.push({ target, reason: 'already invited' })
            else {
              invite({ userId: user.id })
              sent.push(target)
            }
          } else if (!EMAIL.test(target)) skipped.push({ target, reason: 'not a username or email' })
          else if (db.members.some((m) => m.workEmail === target)) skipped.push({ target, reason: 'already a member' })
          else if (db.invites.some((i) => i.email === target)) skipped.push({ target, reason: 'already invited' })
          else {
            invite({ email: target })
            sent.push(target)
          }
        }
        return { settings: settings(), sent, skipped }
      }),

    findUsers: (query) =>
      run(() => {
        const q = query.trim().toLowerCase().replace(/^@/, '')
        if (!q) return []
        return db.users
          .filter((u) => u.handle.toLowerCase().startsWith(q) || u.name.toLowerCase().startsWith(q))
          .slice(0, 5)
      }),

    resendInvite: (inviteId) =>
      run(() => {
        requireAdmin()
        const inv = db.invites.find((i) => i.id === inviteId)
        if (!inv) throw new NotFoundError('Invite')
        const at = now()
        inv.sentAt = at.toISOString()
        inv.expiresAt = new Date(at.getTime() + 14 * DAY).toISOString()
        return settings()
      }),

    revokeInvite: (inviteId) =>
      run(() => {
        requireAdmin()
        db.invites = db.invites.filter((i: Invite) => i.id !== inviteId)
        return settings()
      }),

    changeRole: (userId, role) =>
      run(() => {
        requireAdmin()
        const m = db.members.find((x) => x.userId === userId)
        if (!m) throw new NotFoundError('Member')
        if ((role === 'owner' || m.role === 'owner') && myRole() !== 'owner') throw new Error('Only owners can add or remove owners.')
        if (m.role === 'owner' && role !== 'owner' && ownerCount() === 1) throw new Error('A workspace needs at least one owner. Make someone else an owner first.')
        m.role = role
        return settings()
      }),

    removeMember: (userId) =>
      run(() => {
        requireAdmin()
        if (userId === seed.ME_ID) throw new Error('You can’t remove yourself here.')
        const m = db.members.find((x) => x.userId === userId)
        if (!m) throw new NotFoundError('Member')
        if (m.role === 'owner' && myRole() !== 'owner') throw new Error('Only owners can remove owners.')
        if (m.role === 'owner' && ownerCount() === 1) throw new Error('A workspace needs at least one owner.')
        db.members = db.members.filter((x) => x.userId !== userId)
        // The account and its credit stay; only the membership ends.
        db.formerMembers = db.formerMembers.filter((x) => x.userId !== userId)
        db.formerMembers.push({ userId, role: m.role, joinedAt: m.joinedAt, leftAt: now().toISOString() })
        return settings()
      }),

    setInviteLink: (enabled, reset = false) =>
      run(() => {
        requireAdmin()
        db.inviteLink = {
          enabled,
          token: reset ? `nw-${Math.random().toString(36).slice(2, 8)}` : db.inviteLink.token,
        }
        return settings()
      }),

    setAutoJoinDomain: (domain) =>
      run(() => {
        requireAdmin()
        const d = domain?.trim().toLowerCase().replace(/^@/, '') || null
        if (d && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error('Enter a domain like northwind.dev.')
        if (d && ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'proton.me'].includes(d)) {
          throw new Error('Use your company’s domain, not a personal email provider.')
        }
        db.autoJoinDomain = d
        return settings()
      }),

    setIntegration: (provider, connected) =>
      run(() => {
        requireAdmin()
        const i = db.integrations.find((x) => x.provider === provider)
        if (!i) throw new NotFoundError(PROVIDER_NAME[provider])
        i.connected = connected
        syncConnections()
        return settings()
      }),

    updatePolicy: (patch) =>
      run(() => {
        requireAdmin()
        if (patch.triggerLabel !== undefined) {
          const label = patch.triggerLabel.trim().replace(/^~/, '')
          if (!/^[\w.:-]{2,40}$/.test(label)) throw new Error('Labels can use letters, numbers, dots, colons and dashes.')
          patch = { ...patch, triggerLabel: label }
        }
        Object.assign(db.policy, patch)
        return settings()
      }),

    previewInvite: (token) =>
      run(() => {
        const inv = db.invites.find((i) => i.id === token)
        if (!inv && !(db.inviteLink.enabled && token === db.inviteLink.token)) {
          throw new Error('This invite link has expired or was turned off. Ask a workspace admin for a new one.')
        }
        if (inv && new Date(inv.expiresAt) < now()) throw new Error('This invite has expired. Ask a workspace admin to resend it.')
        const inviter = db.users.find((u) => u.id === (inv?.invitedById ?? seed.ME_ID))!
        return {
          workspace: { name: db.workspace.name, slug: db.workspace.slug },
          company: db.workspace.company,
          invitedBy: inviter,
          role: inv?.role ?? 'member',
          memberCount: db.members.length,
          recordCount: db.records.length,
          ...(inv?.email ? { email: inv.email } : {}),
          ...(inv?.userId ? { invitee: db.users.find((u) => u.id === inv.userId) } : {}),
          ...(inv?.userId && db.formerMembers.some((f) => f.userId === inv.userId) ? { rejoining: true } : {}),
        }
      }),

    acceptInvite: (token) =>
      run(() => {
        const inv = db.invites.find((i) => i.id === token)
        if (!inv && !(db.inviteLink.enabled && token === db.inviteLink.token)) throw new NotFoundError('Invite')
        if (inv && new Date(inv.expiresAt) < now()) throw new Error('This invite has expired. Ask a workspace admin to resend it.')
        if (inv) {
          db.invites = db.invites.filter((i) => i.id !== inv.id)
          // Invited by username: the existing account joins (or rejoins) with all its history.
          if (inv.userId && !db.members.some((m) => m.userId === inv.userId)) {
            db.formerMembers = db.formerMembers.filter((f) => f.userId !== inv.userId)
            db.members.push({ userId: inv.userId, role: inv.role, joinedAt: now().toISOString() })
          }
        }
        return db.workspace
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

    getThread: (handle, slug) => run(() => thread(handle, slug)),

    askPublic: (handle, slug, body) =>
      run(() => {
        const { post } = postBy(handle, slug)
        const text = body.trim()
        if (!text) throw new Error('Write a question first.')
        if (text.length > 600) throw new Error('Keep questions under 600 characters.')
        if (post.authorId === seed.ME_ID) throw new Error('You can’t ask a question on your own post.')
        const key = `${handle}/${slug}`
        const list = (db.publicQuestions[key] ??= [])
        list.push({ id: `pq_${Date.now().toString(36)}${list.length}`, askerId: seed.ME_ID, body: text, at: now().toISOString(), status: 'pending' })
        return thread(handle, slug)
      }),

    answerPublic: (handle, slug, questionId, body) =>
      run(() => {
        const q = authorsQuestion(handle, slug, questionId)
        if (!body.trim()) throw new Error('Write an answer first.')
        q.status = 'answered'
        q.answer = { body: body.trim(), at: now().toISOString() }
        return thread(handle, slug)
      }),

    dismissPublic: (handle, slug, questionId) =>
      run(() => {
        authorsQuestion(handle, slug, questionId).status = 'dismissed'
        return thread(handle, slug)
      }),

    foldPublic: (handle, slug, questionId) =>
      run(() => {
        const q = authorsQuestion(handle, slug, questionId)
        if (q.status !== 'answered' || !q.answer) throw new Error('Answer the question before folding it in.')
        const { post } = postBy(handle, slug)
        if (!q.folded) {
          q.folded = true
          post.followUps = [...(post.followUps ?? []), q.answer.body]
        }
        return { thread: thread(handle, slug), post }
      }),

    toggleHit: (handle, slug) =>
      run(() => {
        const { post } = postBy(handle, slug)
        if (post.authorId === seed.ME_ID) throw new Error('You wrote this one.')
        const key = `${handle}/${slug}`
        if (db.hitsByMe.has(key)) {
          db.hitsByMe.delete(key)
          post.hitCount = Math.max(0, (post.hitCount ?? 1) - 1)
        } else {
          db.hitsByMe.add(key)
          post.hitCount = (post.hitCount ?? 0) + 1
        }
        return thread(handle, slug)
      }),

    getTopic: (tag) =>
      run<TopicPage>(() => {
        const t = tag.toLowerCase()
        const authors = new Map(db.users.map((u) => [u.id, u]))
        const items = db.posts
          .filter((p) => p.tags.includes(t))
          .map((post) => ({ post, author: authors.get(post.authorId)! }))
          .filter((x) => x.author)
          .sort((a, b) => (b.post.hitCount ?? 0) - (a.post.hitCount ?? 0) || b.post.publishedAt.localeCompare(a.post.publishedAt))
        if (!items.length) throw new NotFoundError(`Topic “${tag}”`)
        const co = new Map<string, number>()
        for (const { post } of items) for (const other of post.tags) if (other !== t) co.set(other, (co.get(other) ?? 0) + 1)
        const related = [...co.entries()]
          .map(([name, count]) => ({ tag: name, count }))
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
          .slice(0, 8)
        return { tag: t, items, related, totalHits: items.reduce((n, i) => n + (i.post.hitCount ?? 0), 0) }
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

const STOPWORDS = new Set(
  'a an and are as at be before been but by can did do does for from had has have how i if in is it its of on or our so that the this to was we were what when where which who why with you your usually fixed fix happen happened happening again ever'.split(
    ' ',
  ),
)

/** Meaningful words from a question, for matching against records. */
export function keywordsOf(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9_\-\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ]
}

/** True when `word` starts a word in `text`, so "lag" matches "lagging" but not "flag". */
function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9_])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)
}

function sentence(text: string): string {
  const t = text.trim()
  return /[.!?]$/.test(t) ? t : `${t}.`
}

function lowerFirst(text: string): string {
  // Lowercase an ordinary first word ("A", "The", "Parallel"); keep names like "PgBouncer" or "MR".
  const first = text.match(/^\S+/)?.[0] ?? ''
  return /^[A-Z][a-z]*[,.:]?$/.test(first) ? text.charAt(0).toLowerCase() + text.slice(1) : text
}
