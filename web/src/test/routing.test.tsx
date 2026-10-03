import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'
import { createMockApi } from '../api/mockApi'
import { rewriteLegacyHashLink } from '../app/legacyHashLink'

describe('rewriteLegacyHashLink', () => {
  it('rewrites a #/-prefixed hash to the same path, clearing the hash', () => {
    window.history.replaceState(null, '', '/#/u/hannahl/retries-turned-a-blip-into-an-outage')
    rewriteLegacyHashLink()
    expect(window.location.pathname).toBe('/u/hannahl/retries-turned-a-blip-into-an-outage')
    expect(window.location.hash).toBe('')
  })

  it('keeps a trailing in-page fragment as a real hash (e.g. #ask from a hash-router double-hash link)', () => {
    window.history.replaceState(null, '', '/#/u/hannahl/retries-turned-a-blip-into-an-outage#ask')
    rewriteLegacyHashLink()
    expect(window.location.pathname).toBe('/u/hannahl/retries-turned-a-blip-into-an-outage')
    expect(window.location.hash).toBe('#ask')
  })

  it('does nothing when there is no "#/" hash', () => {
    window.history.replaceState(null, '', '/u/hannahl')
    rewriteLegacyHashLink()
    expect(window.location.pathname).toBe('/u/hannahl')
  })
})

describe('real paths', () => {
  it('renders a deep link directly, the same as a page refresh would', async () => {
    window.history.pushState(null, '', '/u/engineernamzy/read-only-postgres-login-delete')
    render(<App api={createMockApi({ latencyMs: 0 })} />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('read-only')
  })

  it('rewrites an old #/-style link to the real path and renders the right screen', async () => {
    window.history.pushState(null, '', '/#/u/engineernamzy/read-only-postgres-login-delete')
    render(<App api={createMockApi({ latencyMs: 0 })} />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('read-only')
    expect(window.location.pathname).toBe('/u/engineernamzy/read-only-postgres-login-delete')
  })
})
