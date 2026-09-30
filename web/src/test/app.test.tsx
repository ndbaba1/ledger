import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'

function renderAt(hash: string) {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<App api={createMockApi({ latencyMs: 0 })} />)
  return user
}

describe('Ledger app', () => {
  it('shows the review inbox with its drafts', async () => {
    renderAt('#/inbox')
    expect(await screen.findByRole('heading', { name: 'Review inbox' })).toBeInTheDocument()
    expect(await screen.findByText('Checkout p99 latency hit 4.2s after the PgBouncer pool was halved')).toBeInTheDocument()
    expect(screen.getByText('Stripe webhooks processed twice after the Sidekiq retry change')).toBeInTheDocument()
  })

  it('resolves gaps and publishes a draft to the team', async () => {
    const user = renderAt('#/drafts/inc-4821')
    const approve = await screen.findByRole('button', { name: 'Approve & publish to team' })
    expect(approve).toBeDisabled()

    await user.type(screen.getByLabelText('Your answer, or paste a link'), 'Cost review')
    await user.click(screen.getByRole('button', { name: 'Save answer' }))
    expect(await screen.findByText('Answered')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keep, mark unverified' }))
    expect(await screen.findByText('Kept, marked unverified')).toBeInTheDocument()

    expect(approve).toBeEnabled()
    await user.click(approve)

    expect(await screen.findByText(/Published to Platform Eng/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Checkout p99 latency')
  })

  it('highlights a cited source when its citation is pressed', async () => {
    const user = renderAt('#/drafts/inc-4821')
    const summary = (await screen.findByRole('heading', { name: 'Summary' })).parentElement!
    await user.click(within(summary).getByRole('button', { name: 'Show source S5' }))
    expect(document.getElementById('source-S5')).toHaveClass('source--active')
  })

  it('asks a question on a record', async () => {
    const user = renderAt('#/records/LR-212')
    await user.type(await screen.findByLabelText('Ask a question'), 'Does this apply to the jobs cluster?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Does this apply to the jobs cluster?')).toBeInTheDocument()
  })

  it('previews redactions live and publishes to the public profile', async () => {
    const user = renderAt('#/records/LR-212/promote')
    const preview = await screen.findByRole('region', { name: 'Public post preview' })
    expect(within(preview).getAllByText('the checkout service').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('checkbox', { name: /Service names/ }))
    expect(within(preview).queryByText('the checkout service')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Service names/ }))

    await user.click(screen.getByRole('button', { name: 'Publish post' }))
    expect(await screen.findByText(/Your post is live/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Checkout p99 latency')
    expect(screen.queryByText(/checkout-api/)).not.toBeInTheDocument()
  })

  it('searches records from the search screen', async () => {
    const user = renderAt('#/search')
    await user.type(await screen.findByLabelText('Search records', { selector: '#search-q' }), 'eviction')
    expect(await screen.findByText(/1 record matching “eviction”/)).toBeInTheDocument()
    expect(screen.getByText('Redis eviction dropped rate-limit keys during a traffic spike')).toBeInTheDocument()
  })

  it('answers a question above the search results with linked citations', async () => {
    const user = renderAt('#/search')
    await user.type(await screen.findByLabelText('Search records', { selector: '#search-q' }), 'Has connection pool saturation happened before?')
    const card = await screen.findByRole('region', { name: 'Has connection pool saturation happened before?' })
    expect(await within(card).findByText(/this has come up/)).toBeInTheDocument()
    const first = within(card).getByRole('link', { name: 'Record 1' })
    expect(first).toHaveAttribute('href', '#/records/LR-212')
    await user.click(first)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Checkout p99 latency')
  })

  it('shows the PR diff and Slack quotes a record was drafted from', async () => {
    renderAt('#/records/LR-212')
    const panel = await screen.findByRole('region', { name: 'Drafted from' })
    expect(within(panel).getAllByRole('group', { name: 'Diff of charts/checkout/values.yaml' })).toHaveLength(2)
    expect(within(panel).getByText(/cl_waiting keeps climbing/)).toBeInTheDocument()
    expect(within(panel).getByText('Linked evidence')).toBeInTheDocument()
  })

  it('renders a public post with its structure, evidence and more from the author', async () => {
    renderAt('#/u/engineernamzy/read-only-postgres-login-delete')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('read-only')
    expect(screen.getByRole('heading', { name: 'Investigation' })).toBeInTheDocument()
    expect(screen.getAllByText('Dead end —')).toHaveLength(3)
    expect(screen.getByRole('heading', { name: 'Root cause' })).toBeInTheDocument()
    expect(screen.getByText('Tables agent_ro could write to')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lesson' })).toBeInTheDocument()
    const evidence = screen.getByRole('complementary', { name: 'Author, evidence and more write-ups' })
    expect(within(evidence).getByRole('link', { name: /Maintainer/ })).toHaveAttribute(
      'href',
      'https://github.com/vaultkit-inc/agent-db-scan',
    )
  })

  it('shows a record as numbered dead ends with a result', async () => {
    renderAt('#/records/LR-212')
    const steps = await screen.findAllByText('Dead end —')
    expect(steps).toHaveLength(2)
    expect(screen.getByText('Checkout p99')).toBeInTheDocument()
  })

  it('shows a design record with its architecture flow and alternatives', async () => {
    renderAt('#/records/LR-220')
    expect(await screen.findByText('System design')).toBeInTheDocument()
    const flow = screen.getByRole('list', { name: 'Architecture: 4 steps' })
    expect(within(flow).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getAllByText('Rejected —')).toHaveLength(3)
    expect(screen.getByRole('heading', { name: 'Constraints' })).toBeInTheDocument()
  })

  it('shows a not-found state for unknown records', async () => {
    renderAt('#/records/LR-999')
    expect(await screen.findByText('Not found')).toBeInTheDocument()
  })
})
