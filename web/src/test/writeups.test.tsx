import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'
import { EMPTY_FIELDS, publishBlockers, toLines } from '../lib/writeups'

const newApi = () => createMockApi({ latencyMs: 0, now: () => new Date('2026-09-28T20:00:00Z') })

describe('write-up rules', () => {
  it('turns textarea lines into list items, dropping bullets and blanks', () => {
    expect(toLines('- Kafka\n\n• Vendor  \n  * Cron job')).toEqual(['Kafka', 'Vendor', 'Cron job'])
  })

  it('requires the type’s key sections and a piece of verified evidence', () => {
    const blank = { ...EMPTY_FIELDS, type: 'incident' as const, status: 'draft' as const, evidence: [] }
    expect(publishBlockers(blank)).toEqual(['A title', 'Problem', 'Root cause', 'Solution', 'At least one piece of evidence EngLog could check with GitHub.'])
  })

  it('keeps designs unpublishable until shipped with rollout, a result and a verified PR', () => {
    const proposal = {
      ...EMPTY_FIELDS,
      title: 'Edge rate limiting',
      symptom: 'Stop noisy tenants.',
      rootCause: 'Envoy global rate limits.',
      type: 'design' as const,
      status: 'proposed' as const,
      evidence: [],
    }
    expect(publishBlockers(proposal)).toEqual([
      'Marked as shipped',
      'Rollout',
      'A result after launch',
      'At least one piece of evidence EngLog could check with GitHub.',
    ])
  })

  it('an unverified PR does not count', () => {
    const withUnverifiedPr = {
      ...EMPTY_FIELDS,
      title: 'Edge rate limiting',
      symptom: 'x',
      rootCause: 'x',
      fix: 'x',
      type: 'incident' as const,
      status: 'draft' as const,
      evidence: [{ key: 'S1', kind: 'github_pr' as const, title: 'PR', detail: '', status: 'fetched' as const, hops: 0, verified: false }],
    }
    expect(publishBlockers(withUnverifiedPr)).toEqual(['At least one piece of evidence EngLog could check with GitHub.'])
  })

  it('a verified issue counts for a non-design type, but not for a design', () => {
    const withVerifiedIssue = {
      ...EMPTY_FIELDS,
      title: 'Edge rate limiting',
      symptom: 'x',
      rootCause: 'x',
      fix: 'x',
      status: 'draft' as const,
      evidence: [{ key: 'S1', kind: 'github_issue' as const, title: 'Issue', detail: '', status: 'fetched' as const, hops: 0, verified: true }],
    }
    expect(publishBlockers({ ...withVerifiedIssue, type: 'incident' as const })).toEqual([])
    expect(publishBlockers({ ...withVerifiedIssue, type: 'design' as const, status: 'shipped' as const, result: { label: 'x', before: 'x', after: 'x' } })).toEqual([
      'At least one piece of evidence EngLog could check with GitHub.',
    ])
  })
})

describe('mock API: write-ups', () => {
  it('lists the seeded design proposal', async () => {
    const list = await newApi().listWriteups()
    expect(list.map((w) => [w.title, w.status])).toEqual([['Per-tenant rate limiting at the edge', 'proposed']])
  })

  it('creates, saves and refuses to publish an incomplete write-up', async () => {
    const api = newApi()
    const w = await api.createWriteup('investigation')
    expect(w.status).toBe('draft')
    await api.saveWriteup(w.id, { title: 'Flaky DNS in CI', ruledOut: ['- first', '', 'second'] })
    expect((await api.getWriteup(w.id)).ruledOut).toEqual(['first', 'second'])
    await expect(api.publishWriteup(w.id)).rejects.toThrow('Still needed: Problem, Root cause, Solution')
  })

  it('publishes a shipped design as a team record with its evidence', async () => {
    const api = newApi()
    await api.addWriteupEvidence('w_ratelimit', 'https://github.com/acme/edge/pull/88')
    await api.setWriteupStatus('w_ratelimit', 'shipped')
    await api.saveWriteup('w_ratelimit', {
      fix: 'Shadow mode for a week, then enforced per tenant tier.',
      result: { label: 'API p99 during noisy-tenant bursts', before: '2.8s', after: '240ms' },
    })
    const record = await api.publishWriteup('w_ratelimit')
    expect(record).toMatchObject({ id: 'LR-221', type: 'design', title: 'Per-tenant rate limiting at the edge' })
    expect(record.flow).toHaveLength(4)
    expect(record.sources.map((s) => s.key)).toEqual(['S1', 'S2'])
    expect(await api.listWriteups()).toHaveLength(0)
  })

  it('only lets designs be proposed or shipped', async () => {
    const api = newApi()
    const w = await api.createWriteup('incident')
    await expect(api.setWriteupStatus(w.id, 'shipped')).rejects.toThrow(/Only designs/)
  })
})

describe('writing in the app', () => {
  it('starts a decision from the picker, fills it in and publishes it', async () => {
    window.location.hash = '#/new'
    const user = userEvent.setup()
    render(<App api={createMockApi({ latencyMs: 0 })} />)

    await user.click(await screen.findByRole('button', { name: /Start decision/ }))
    await user.type(await screen.findByLabelText('Title'), 'Use UUIDv7 for new primary keys')
    await user.type(screen.getByRole('textbox', { name: 'Context' }), 'Random UUIDs fragment our B-tree indexes.')
    await user.type(screen.getByRole('textbox', { name: 'Decision' }), 'New tables use UUIDv7.')
    await user.type(screen.getByRole('textbox', { name: 'option 1' }), 'bigserial — leaks row counts{Enter}UUIDv4 — random inserts')
    expect(screen.getByRole('textbox', { name: 'option 2' })).toHaveValue('UUIDv4 — random inserts')
    await user.type(screen.getByRole('textbox', { name: 'Consequences' }), 'Old tables keep UUIDv4.')

    const publish = screen.getByRole('button', { name: 'Publish to Platform Eng' })
    expect(publish).toBeDisabled()
    const checklist = screen.getByRole('region', { name: 'Ready to publish' })
    expect(within(checklist).getByText('At least one piece of evidence EngLog could check with GitHub.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Evidence link'), 'https://github.com/acme/api/pull/412')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('GitHub PR #412')).toBeInTheDocument()

    expect(publish).toBeEnabled()
    await user.click(publish)
    expect(await screen.findByText(/Published to Platform Eng/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Use UUIDv7 for new primary keys')
  })

  it('shows the design proposal in the inbox with what is left', async () => {
    window.location.hash = '#/inbox'
    render(<App api={createMockApi({ latencyMs: 0 })} />)
    const section = await screen.findByRole('region', { name: 'Your write-ups' })
    expect(within(section).getByText('Proposed')).toBeInTheDocument()
    expect(within(section).getByText('4 things left before publishing')).toBeInTheDocument()
  })
})
