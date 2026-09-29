import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'

const newApi = () => createMockApi({ latencyMs: 0 })

describe('mock API: explore', () => {
  it('lists every public post from every author, newest first, with topic counts', async () => {
    const res = await newApi().explore({})
    expect(res.total).toBe(res.items.length)
    expect(new Set(res.items.map((i) => i.author.handle)).size).toBeGreaterThanOrEqual(4)
    const dates = res.items.map((i) => i.post.publishedAt)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(res.tags[0].count).toBeGreaterThanOrEqual(res.tags[res.tags.length - 1].count)
  })

  it('searches titles, bodies and authors', async () => {
    const api = newApi()
    expect((await api.explore({ query: 'jitter' })).items.map((i) => i.post.slug)).toEqual(['retries-turned-a-blip-into-an-outage'])
    expect((await api.explore({ query: 'tomasr' })).items.map((i) => i.author.name)).toEqual(['Tomás R.'])
    expect((await api.explore({ query: 'how did you handle kafka consumer lag?' })).items[0].post.slug).toBe('kafka-lag-only-on-mondays')
    expect((await api.explore({ query: 'mainframe cobol' })).items).toHaveLength(0)
  })

  it('filters by type and tag', async () => {
    const api = newApi()
    const designs = await api.explore({ type: 'design' })
    expect(designs.items.every((i) => i.post.type === 'design')).toBe(true)
    const pg = await api.explore({ tag: 'postgres' })
    expect(pg.items.length).toBeGreaterThan(0)
    expect(pg.items.every((i) => i.post.tags.includes('postgres'))).toBe(true)
  })
})

describe('public landing page', () => {
  it('opens at the root with the feed and a search box', async () => {
    window.location.hash = '#/'
    render(<App api={newApi()} />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Explore write-ups')
    const feed = await screen.findByRole('region', { name: 'Latest write-ups' })
    expect(await within(feed).findByText('Kafka consumer lag that only appeared on Monday mornings')).toBeInTheDocument()
    expect(within(feed).getByText('Offline-first delivery tracking for drivers with patchy signal')).toBeInTheDocument()
  })

  it('searches and filters, then opens a post', async () => {
    window.location.hash = '#/'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    await user.type(await screen.findByLabelText('Search public write-ups'), 'retries{Enter}')
    expect(await screen.findByText(/matching “retries”/)).toBeInTheDocument()
    const feed = screen.getByRole('region', { name: 'Results' })
    const titles = within(feed).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual([
      'Retries turned a 30-second payment provider blip into a 40-minute outage',
      'Webhook delivery service with retries and a dead-letter queue',
    ])

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await user.click(await screen.findByRole('button', { name: 'Filter' }))
    await user.click(await screen.findByRole('button', { name: 'Designs' }))
    expect(screen.getByRole('button', { name: /Designs/, expanded: false })).toBeInTheDocument()
    const designs = await screen.findByRole('region', { name: 'Latest write-ups' })
    expect(within(designs).getAllByText('Design').length).toBeGreaterThan(0)
    expect(within(designs).queryByText('Incident')).not.toBeInTheDocument()

    await user.click(within(designs).getByRole('link', { name: /Offline-first delivery tracking/ }))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Offline-first delivery tracking')
  })
})
