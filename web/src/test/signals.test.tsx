import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'
import { normalizeSignal, signalScore } from '../lib/signals'

const newApi = () => createMockApi({ latencyMs: 0 })

describe('signal matching', () => {
  it('normalizes away the parts that change between occurrences', () => {
    expect(normalizeSignal('CheckoutP99LatencyHigh')).toBe('checkout p99 latency high')
    expect(normalizeSignal('worker 12 timed out after 30s on 10.0.3.14:6432')).toBe('worker <n> timed out after <n> on <ip>')
    expect(normalizeSignal('job 9f8e7d6c5b4a3f2e failed for "acme"')).toBe('job <id> failed for <value>')
  })

  it('scores an alert that embeds the stored signal as exact', () => {
    const s = { kind: 'alert' as const, value: 'CheckoutP99LatencyHigh' }
    expect(signalScore('[FIRING:1] CheckoutP99LatencyHigh (checkout-api, prod-eu-1)', s)).toBe(1)
    expect(signalScore('SearchIndexLagHigh', s)).toBeLessThan(0.35)
  })

  it('matches the same error with different numbers', () => {
    const s = { kind: 'log' as const, value: 'worker 12 timed out after 30s' }
    expect(signalScore('worker 7 timed out after 45s', s)).toBe(1)
  })
})

describe('mock API: matchSignal', () => {
  it('finds the records an alert belongs to, best first', async () => {
    const matches = await newApi().matchSignal('[FIRING:1] CheckoutP99LatencyHigh (checkout-api)')
    expect(matches[0]).toMatchObject({ strength: 'exact', record: { id: 'LR-212' } })
  })

  it('matches a metric name shared by an incident and the decision it led to', async () => {
    const ids = (await newApi().matchSignal('pgbouncer_pools_client_waiting_connections > 10 for 2m')).map((m) => m.record.id)
    expect(ids).toEqual(expect.arrayContaining(['LR-212', 'LR-213']))
  })

  it('returns nothing for unrelated text and rejects empty input', async () => {
    expect(await newApi().matchSignal('DiskSpaceLow on backup-host')).toEqual([])
    await expect(newApi().matchSignal('  ')).rejects.toThrow(/Paste/)
  })

  it('carries a draft’s detected signals onto the published record', async () => {
    const api = newApi()
    await api.answerGap('d_4821', 'g1', 'Cost review')
    await api.keepGapUnverified('d_4821', 'g2')
    const record = await api.approveDraft('d_4821')
    expect(record.signals?.map((s) => s.value)).toContain('CheckoutP99LatencyHigh')
  })

  it('keeps signals out of public posts', async () => {
    const api = newApi()
    const plan = await api.getPromotionPlan('LR-212')
    const post = await api.publishPost('LR-212', { enabledRuleIds: plan.rules.map((r) => r.id), employerMode: 'hidden' })
    expect(JSON.stringify(post)).not.toContain('CheckoutP99LatencyHigh')
  })
})

describe('signals in the app', () => {
  it('shows what a record fires as', async () => {
    window.location.hash = '#/records/LR-212'
    render(<App api={newApi()} />)
    const panel = await screen.findByRole('region', { name: 'Fires as' })
    expect(within(panel).getByText('CheckoutP99LatencyHigh')).toBeInTheDocument()
    expect(within(panel).getByText('team only')).toBeInTheDocument()
  })

  it('matches a pasted alert and previews the Slack reply', async () => {
    window.location.hash = '#/search?mode=match'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    await user.type(await screen.findByLabelText('Alert, metric or error'), 'FATAL: sorry, too many clients already')
    await user.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByText('Exact match')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Flaky CI: the Postgres test database/ })).toBeInTheDocument()
    expect(screen.getByText(/What Ledger would reply/)).toBeInTheDocument()
    expect(screen.getByText('This has fired before.')).toBeInTheDocument()
  })
})
