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

describe('editing your own profile', () => {
  it('shows an Edit profile button on your own profile, not on others', async () => {
    renderAt('#/u/engineernamzy')
    expect(await screen.findByRole('link', { name: 'Edit profile' })).toBeInTheDocument()

    renderAt('#/u/hannahl')
    await screen.findByRole('heading', { name: 'Hannah L.' })
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
  })

  it('edits the headline, stack and links, previews them live, and saves', async () => {
    const user = renderAt('#/u/engineernamzy')
    await user.click(await screen.findByRole('link', { name: 'Edit profile' }))

    const headline = await screen.findByLabelText('Headline')
    await user.clear(headline)
    await user.type(headline, 'Backend engineer · building Ledger')

    const website = screen.getByLabelText('Website')
    await user.type(website, 'https://nnamdi.example')

    const preview = screen.getByRole('complementary', { name: 'Preview' })
    expect(within(preview).getByText('Backend engineer · building Ledger', { exact: false })).toBeInTheDocument()
    expect(within(preview).getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://nnamdi.example')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { name: 'Nnamdi' })).toBeInTheDocument()
    expect(screen.getByText('Backend engineer · building Ledger', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://nnamdi.example')
  })

  it('shows a prompt to add a headline and stack when your profile is missing them', async () => {
    const api = createMockApi({ latencyMs: 0 })
    await api.updateMe({ headline: '', stack: [] })
    window.location.hash = '#/u/engineernamzy'
    render(<App api={api} />)

    expect(await screen.findByText(/Add a headline and your stack/)).toBeInTheDocument()
  })
})
