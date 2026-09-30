import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { LedgerApi } from '../api/client'
import { UnauthorizedError } from '../api/client'
import { createMockApi } from '../api/mockApi'

/** The mock is always signed in; this simulates the real backend's 401 instead. */
function signedOutApi(): LedgerApi {
  return { ...createMockApi({ latencyMs: 0 }), me: () => Promise.reject(new UnauthorizedError()) }
}

describe('signed out', () => {
  it('shows "Sign in with GitHub" instead of the signed-in header links', async () => {
    window.location.hash = '#/'
    render(<App api={signedOutApi()} />)

    expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
    expect(screen.queryByText('My profile')).not.toBeInTheDocument()
    expect(screen.queryByText('Open workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Write')).not.toBeInTheDocument()
  })

  it('shows the hit count but sends a click to sign in instead of toggling it', async () => {
    const api = signedOutApi()
    const toggleHit = vi.spyOn(api, 'toggleHit')
    window.location.hash = '#/u/hannahl/retries-turned-a-blip-into-an-outage'
    const user = userEvent.setup()
    render(<App api={api} />)

    const hit = await screen.findByRole('button', { name: /I hit this too/ })
    expect(hit).toHaveTextContent('41')
    await user.click(hit)
    expect(toggleHit).not.toHaveBeenCalled()
  })

  it('sends focusing or submitting the ask box to sign-in, while still showing answered questions', async () => {
    sessionStorage.clear()
    window.location.hash = '#/u/hannahl/retries-turned-a-blip-into-an-outage'
    const user = userEvent.setup()
    render(<App api={signedOutApi()} />)

    expect(await screen.findByRole('heading', { name: 'Ask the author' })).toBeInTheDocument()
    const input = screen.getByPlaceholderText(/Ask .* a question/)
    expect(screen.getByText('Sign in with GitHub to ask.')).toBeInTheDocument()

    await user.click(input)
    // signInWithGithub stashes the return path (with #ask) before it does
    // anything async, so this is observable even though the GitHub round
    // trip itself can't complete in a test.
    expect(sessionStorage.getItem('ledger:returnTo')).toBe('/u/hannahl/retries-turned-a-blip-into-an-outage#ask')
  })

  it('sends a workspace route to sign-in instead of rendering it', async () => {
    window.location.hash = '#/inbox'
    render(<App api={signedOutApi()} />)

    expect(await screen.findByText('Signing in…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Review inbox' })).not.toBeInTheDocument()
  })

  it("hides a profile's owner-only actions", async () => {
    window.location.hash = '#/u/hannahl'
    render(<App api={signedOutApi()} />)

    await screen.findByRole('heading', { name: 'Hannah L.' })
    expect(screen.queryByText('Promote a team record')).not.toBeInTheDocument()
  })
})
