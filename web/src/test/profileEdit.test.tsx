import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'

function renderAt(hash: string, api = createMockApi({ latencyMs: 0 })) {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<App api={api} />)
  return { user, api }
}

describe('editing your profile in place', () => {
  it('shows an Edit profile button on your own profile, not on others', async () => {
    renderAt('#/u/engineernamzy')
    expect(await screen.findByRole('button', { name: /Edit profile/ })).toBeInTheDocument()

    renderAt('#/u/hannahl')
    await screen.findByRole('heading', { name: 'Hannah L.' })
    expect(screen.queryByRole('button', { name: /Edit profile/ })).not.toBeInTheDocument()
  })

  it('edits the headline and stack, saves with one updateMe call, and closes the editor', async () => {
    const api = createMockApi({ latencyMs: 0 })
    const updateMe = vi.spyOn(api, 'updateMe')
    const { user } = renderAt('#/u/engineernamzy', api)

    await user.click(await screen.findByRole('button', { name: /Edit profile/ }))
    const headline = await screen.findByLabelText('Headline')
    await user.clear(headline)
    await user.type(headline, 'Backend engineer · building EngLog')

    const tagField = document.getElementById('profile-editor-stack') as HTMLInputElement
    await user.type(tagField, 'kafka{Enter}')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1))
    const [patch] = updateMe.mock.calls[0]
    expect(patch.headline).toBe('Backend engineer · building EngLog')
    expect(patch.stack).toContain('kafka')

    expect(await screen.findByText('Backend engineer · building EngLog', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('kafka')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('discards changes on Cancel', async () => {
    const { user } = renderAt('#/u/engineernamzy')
    await user.click(await screen.findByRole('button', { name: /Edit profile/ }))
    const headline = await screen.findByLabelText('Headline')
    await user.clear(headline)
    await user.type(headline, 'Something I will not save')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByText('Something I will not save')).not.toBeInTheDocument()
  })

  it('discards changes on Escape', async () => {
    const { user } = renderAt('#/u/engineernamzy')
    await user.click(await screen.findByRole('button', { name: /Edit profile/ }))
    const headline = await screen.findByLabelText('Headline')
    await user.clear(headline)
    await user.type(headline, 'Something I will not save either')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByText('Something I will not save either')).not.toBeInTheDocument()
  })

  it('opens the editor with the headline field focused from the "+ Add a headline" prompt', async () => {
    const api = createMockApi({ latencyMs: 0 })
    await api.updateMe({ headline: '', stack: [] })
    const { user } = renderAt('#/u/engineernamzy', api)

    await user.click(await screen.findByRole('button', { name: '+ Add a headline' }))

    const headline = await screen.findByLabelText('Headline')
    expect(headline).toHaveFocus()
  })

  it('keeps edit mode open and shows the error when updateMe fails', async () => {
    const api = createMockApi({ latencyMs: 0 })
    vi.spyOn(api, 'updateMe').mockRejectedValue(new Error('Headline is too long (maximum is 160 characters)'))
    const { user } = renderAt('#/u/engineernamzy', api)

    await user.click(await screen.findByRole('button', { name: /Edit profile/ }))
    await user.type(screen.getByLabelText('Headline'), '!')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Headline is too long (maximum is 160 characters)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('/me/profile redirects to the profile with the editor open', async () => {
    renderAt('#/me/profile')

    expect(await screen.findByLabelText('Name')).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe('/u/engineernamzy'))
  })
})
