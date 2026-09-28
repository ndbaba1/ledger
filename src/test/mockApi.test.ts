import { describe, expect, it } from 'vitest'
import { createMockApi } from '../api/mockApi'

const fixedNow = () => new Date('2026-09-28T18:00:00Z')
const newApi = () => createMockApi({ latencyMs: 0, now: fixedNow })

describe('mock API: drafts', () => {
  it('lists drafts awaiting review, newest first', async () => {
    const drafts = await newApi().listDrafts()
    expect(drafts.map((d) => d.slug)).toEqual(['inc-4821', 'inv-912', 'adr-7'])
  })

  it('refuses to approve while gaps are open', async () => {
    await expect(newApi().approveDraft('d_4821')).rejects.toThrow('Resolve 2 open gaps first.')
  })

  it('rejects empty gap answers and invalid source links', async () => {
    const api = newApi()
    await expect(api.answerGap('d_4821', 'g1', '  ')).rejects.toThrow(/answer/)
    await expect(api.addSource('d_4821', 'grafana')).rejects.toThrow(/link/)
  })

  it('publishes a record once gaps are resolved', async () => {
    const api = newApi()
    await api.answerGap('d_4821', 'g1', 'Cost review; we assumed checkout was over-provisioned.')
    await api.keepGapUnverified('d_4821', 'g2')
    const record = await api.approveDraft('d_4821')

    expect(record.id).toBe('LR-214')
    expect(record.ruledOut).toHaveLength(1)
    expect(record.notes).toEqual(['Cost review; we assumed checkout was over-provisioned.'])
    expect(record.publishedAt).toBe('2026-09-28T18:00:00.000Z')

    expect((await api.listDrafts()).map((d) => d.slug)).not.toContain('inc-4821')
    expect((await api.listRecords())[0].id).toBe('LR-214')
  })

  it('adds a pasted link to the case file and rejects duplicates', async () => {
    const api = newApi()
    const url = 'https://gitlab.com/platform/checkout/-/merge_requests/1955'
    const draft = await api.addSource('d_4821', url)
    expect(draft.sources.at(-1)).toMatchObject({ key: 'S7', kind: 'gitlab_mr', title: 'GitLab MR !1955' })
    await expect(api.addSource('d_4821', url)).rejects.toThrow(/already/)
  })
})

describe('mock API: records and Q&A', () => {
  it('answers and folds a question into the record', async () => {
    const api = newApi()
    await api.answerQuestion('LR-212', 'q2', 'Yes — more pods means more clients competing for the same pool.')
    const r = await api.foldAnswer('LR-212', 'q2')
    expect(r.notes).toContain('Yes — more pods means more clients competing for the same pool.')
    expect(r.questions.find((q) => q.id === 'q2')?.folded).toBe(true)
    expect(r.history.at(-1)?.summary).toMatch(/Folded/)
  })

  it('will not fold an unanswered question', async () => {
    await expect(newApi().foldAnswer('LR-212', 'q2')).rejects.toThrow(/answered/)
  })

  it('searches across record text and ranks title and tag matches first', async () => {
    const hits = await newApi().search('pgbouncer')
    expect(hits.map((h) => h.record.id)).toEqual(['LR-212', 'LR-213', 'LR-148'])
    expect(await newApi().search('pgbouncer', 'decision')).toHaveLength(1)
    expect(await newApi().search('nothing-matches-this')).toHaveLength(0)
  })
})

describe('mock API: promote to public', () => {
  it('publishes a redacted post with verified badges and no private citations', async () => {
    const api = newApi()
    const plan = await api.getPromotionPlan('LR-212')
    expect(plan.evidence.filter((e) => e.becomes).map((e) => e.becomes!.label)).toEqual([
      'Participated in the investigation',
      'Authored & merged the fix',
    ])

    const post = await api.publishPost('LR-212', {
      enabledRuleIds: plan.rules.map((r) => r.id),
      employerMode: 'industry',
    })
    const text = JSON.stringify(post)
    for (const secret of ['checkout-api', 'Amara K.', 'Jordan R.', 'grafana.internal', 'platform/checkout#4821', 'Platform Eng', '[S']) {
      expect(text).not.toContain(secret)
    }
    expect(post.employerLine).toBe('at a fintech company')
    expect(post.tags).toEqual(['pgbouncer', 'postgres'])

    const profile = await api.getProfile('engineernamzy')
    expect(profile.posts.map((p) => p.slug)).toContain(post.slug)
    expect((await api.getRecord('LR-212')).promotedPostSlug).toBe(post.slug)
  })

  it('keeps text as written when a rule is turned off', async () => {
    const api = newApi()
    const post = await api.publishPost('LR-212', { enabledRuleIds: ['links', 'teammates', 'workspace'], employerMode: 'hidden' })
    expect(JSON.stringify(post)).toContain('checkout-api')
    expect(post.employerLine).toBeUndefined()
  })

  it('republishing replaces the existing post instead of duplicating it', async () => {
    const api = newApi()
    const opts = { enabledRuleIds: ['services', 'teammates', 'links', 'workspace'], employerMode: 'hidden' as const }
    await api.publishPost('LR-212', opts)
    await api.publishPost('LR-212', opts)
    expect((await api.getProfile('engineernamzy')).posts).toHaveLength(2)
  })
})
