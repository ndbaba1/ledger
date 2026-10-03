import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'
import type { ProjectOptions } from '../api/types'
import { periodLabel } from '../lib/project'

const newApi = () => createMockApi({ latencyMs: 0, now: () => new Date('2026-09-28T20:00:00Z') })

const webhooks = (patch: Partial<ProjectOptions> = {}): ProjectOptions => ({
  title: 'Moved webhook delivery off the request path',
  role: 'led',
  recordIds: ['LR-220', 'LR-215'],
  decisionRecordIds: ['LR-220'],
  outcomeRecordId: 'LR-220',
  enabledRuleIds: ['services', 'teammates', 'workspace'],
  employerMode: 'hidden',
  ...patch,
})

describe('mock API: projects', () => {
  it('builds the profile project from verified records and redacts what leaves', async () => {
    const { projects } = await newApi().getProfile('engineernamzy')
    const p = projects[0]
    expect(p.title).toBe('Rebuilt Postgres connection pooling for checkout and billing')
    expect(p.changes).toMatchObject({ total: 14, authored: 11, reviewed: 3 })
    expect(p.records.map((r) => r.type)).toEqual(['design', 'decision', 'incident'])
    expect(p.outcome).toMatchObject({ before: '1,900', after: '260', postSlug: 'pgbouncer-transaction-pooling' })
    // Service names are replaced and internal refs are never published.
    const text = JSON.stringify(p)
    expect(text).not.toMatch(/checkout-api|billing-api|platform\/|!1788/)
    expect(p.changes.items.map((c) => c.title)).toContain('Move the checkout service to transaction pooling')
    expect(periodLabel(p.period)).toBe('Aug – Sep 2026')
  })

  it('refuses claims the evidence does not support', async () => {
    const api = newApi()
    await expect(api.publishProject('pc_webhooks', webhooks({ title: '  ' }))).rejects.toThrow(/name/)
    await expect(api.publishProject('pc_webhooks', webhooks({ recordIds: ['LR-215'], decisionRecordIds: [], outcomeRecordId: null }))).rejects.toThrow(
      /“Led” needs a design or decision record/,
    )
    await expect(api.publishProject('pc_webhooks', webhooks({ outcomeRecordId: 'LR-212' }))).rejects.toThrow(/outcome/)
    await expect(api.publishProject('pc_pooling', { ...webhooks(), recordIds: ['LR-205', 'LR-148'] })).rejects.toThrow(/only records from this project/i)
  })

  it('publishes a new project and shows it on the profile', async () => {
    const api = newApi()
    const p = await api.publishProject('pc_webhooks', webhooks())
    expect(p.slug).toBe('moved-webhook-delivery-off-the-request-path')
    expect(JSON.stringify(p)).not.toMatch(/api-server/)
    const page = await api.getProject('engineernamzy', p.slug)
    expect(page.posts.map((x) => x.slug)).toEqual(['webhook-delivery-outbox-design'])
    expect((await api.listProjectCandidates()).find((c) => c.id === 'pc_webhooks')?.publishedSlug).toBe(p.slug)
    expect((await api.getProfile('engineernamzy')).projects).toHaveLength(2)
  })

  it('respects the workspace publishing policy', async () => {
    const api = newApi()
    await api.updatePolicy({ publicPromotion: 'off' })
    await expect(api.publishProject('pc_webhooks', webhooks())).rejects.toThrow(/turned off/)
  })
})

describe('projects in the app', () => {
  it('shows evidence, decisions and outcome on the profile', async () => {
    window.location.hash = '#/u/engineernamzy'
    render(<App api={newApi()} />)
    const section = await screen.findByRole('region', { name: /Projects/ })
    expect(within(section).getByText('Rebuilt Postgres connection pooling for checkout and billing')).toBeInTheDocument()
    expect(within(section).getByText(/14 merge requests/)).toBeInTheDocument()
    expect(within(section).getByText('1 incident report')).toBeInTheDocument()
    expect(within(section).getByText('1,900 → 260')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'Put checkout and billing behind PgBouncer transaction pooling' })).toHaveAttribute(
      'href',
      '/u/engineernamzy/pgbouncer-transaction-pooling',
    )
  })

  it('opens the project page with merge requests and team-only records', async () => {
    window.location.hash = '#/u/engineernamzy/projects/postgres-connection-pooling'
    render(<App api={newApi()} />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Rebuilt Postgres connection pooling')
    const changes = screen.getByRole('region', { name: /Merge requests/ })
    expect(within(changes).getByText('Lower max_connections on the primary')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Team-only records/ })).toBeInTheDocument()
  })

  it('names a noticed project from the inbox and publishes it', async () => {
    window.location.hash = '#/projects/pc_webhooks'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Webhooks without blocking the API')
    const preview = screen.getByRole('region', { name: 'Project preview' })
    expect(within(preview).getByText('Webhooks without blocking the API')).toBeInTheDocument()
    expect(within(preview).getByText('92.1% → 99.7%')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish to my profile' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Webhooks without blocking the API' })).toBeInTheDocument()
    expect(screen.getByText(/7 merge requests/)).toBeInTheDocument()
  })

  it('links a post to the project it belongs to', async () => {
    window.location.hash = '#/u/engineernamzy/pgbouncer-transaction-pooling'
    render(<App api={newApi()} />)
    expect(await screen.findByRole('link', { name: /Part of Rebuilt Postgres connection pooling/ })).toBeInTheDocument()
  })
})
