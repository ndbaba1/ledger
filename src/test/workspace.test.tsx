import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'

const now = () => new Date('2026-09-28T20:00:00Z')
const newApi = () => createMockApi({ latencyMs: 0, now })

describe('mock API: workspace admin', () => {
  it('lists members owners first, pending invites newest first', async () => {
    const s = await newApi().getWorkspaceSettings()
    expect(s.myRole).toBe('owner')
    expect(s.members.map((m) => m.role)).toEqual(['owner', 'admin', 'member', 'member', 'member'])
    expect(s.invites.map((i) => i.email)).toEqual(['sam@northwind.dev', 'kofi@northwind.dev'])
  })

  it('invites new emails and explains every skipped one', async () => {
    const res = await newApi().inviteMembers(['Kim@Northwind.dev', 'amara@northwind.dev', 'sam@northwind.dev', 'nope', 'kim@northwind.dev'], 'member')
    expect(res.sent).toEqual(['kim@northwind.dev'])
    expect(res.skipped).toEqual([
      { email: 'amara@northwind.dev', reason: 'already a member' },
      { email: 'sam@northwind.dev', reason: 'already invited' },
      { email: 'nope', reason: 'not a valid email' },
    ])
    const kim = res.settings.invites.find((i) => i.email === 'kim@northwind.dev')!
    expect(kim.expiresAt).toBe('2026-10-12T20:00:00.000Z')
  })

  it('keeps at least one owner and lets owners change roles', async () => {
    const api = newApi()
    await expect(api.changeRole('u_nnamdi', 'admin')).rejects.toThrow(/at least one owner/)
    const s = await api.changeRole('u_jordan', 'admin')
    expect(s.members.find((m) => m.user.id === 'u_jordan')?.role).toBe('admin')
    await expect(api.removeMember('u_nnamdi')).rejects.toThrow(/yourself/)
    expect((await api.removeMember('u_leo')).members).toHaveLength(4)
  })

  it('stops members from changing settings', async () => {
    const api = newApi()
    await api.changeRole('u_amara', 'owner')
    // Hand ownership over, then step down to member.
    await api.changeRole('u_nnamdi', 'member')
    await expect(api.inviteMembers(['x@northwind.dev'], 'member')).rejects.toThrow(/owners and admins/)
    await expect(api.updatePolicy({ publicPromotion: 'off' })).rejects.toThrow(/owners and admins/)
  })

  it('validates the auto-join domain and trigger label', async () => {
    const api = newApi()
    expect((await api.setAutoJoinDomain('@Northwind.dev')).autoJoinDomain).toBe('northwind.dev')
    await expect(api.setAutoJoinDomain('gmail.com')).rejects.toThrow(/company’s domain/)
    await expect(api.setAutoJoinDomain('not a domain')).rejects.toThrow(/like northwind.dev/)
    expect((await api.updatePolicy({ triggerLabel: '~postmortem' })).policy.triggerLabel).toBe('postmortem')
  })

  it('blocks promotion when the workspace turns public publishing off', async () => {
    const api = newApi()
    await api.updatePolicy({ publicPromotion: 'off' })
    await expect(api.publishPost('LR-212', { enabledRuleIds: [], employerMode: 'hidden' })).rejects.toThrow(/turned off publishing/)
  })

  it('previews and accepts invites; rejects expired, reset or disabled ones', async () => {
    const api = newApi()
    const p = await api.previewInvite('inv_sam')
    expect(p).toMatchObject({ email: 'sam@northwind.dev', company: 'Northwind', role: 'member' })
    await expect(api.previewInvite('inv_kofi')).rejects.toThrow(/expired/)

    const link = (await api.getWorkspaceSettings()).inviteLink.token
    expect((await api.previewInvite(link)).role).toBe('member')
    const reset = await api.setInviteLink(true, true)
    expect(reset.inviteLink.token).not.toBe(link)
    await expect(api.previewInvite(link)).rejects.toThrow(/expired or was turned off/)

    await api.acceptInvite('inv_sam')
    expect((await api.getWorkspaceSettings()).invites.map((i) => i.id)).not.toContain('inv_sam')
  })
})

describe('workspace admin in the app', () => {
  it('invites people and shows them as pending', async () => {
    window.location.hash = '#/settings'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    await user.type(await screen.findByLabelText('Email addresses'), 'kim@northwind.dev, ola@northwind.dev')
    await user.click(screen.getByRole('button', { name: 'Send 2 invites' }))
    expect(await screen.findByText(/Sent to kim@northwind.dev, ola@northwind.dev/)).toBeInTheDocument()
    const pending = screen.getByRole('region', { name: /Pending invites · 4/ })
    expect(within(pending).getByText('kim@northwind.dev')).toBeInTheDocument()
  })

  it('removes a member after confirming', async () => {
    window.location.hash = '#/settings'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    await user.click(await screen.findByRole('button', { name: 'Remove Leo M.' }))
    await user.click(screen.getByRole('button', { name: 'Remove Leo' }))
    expect(await screen.findByRole('region', { name: 'Members · 4' })).toBeInTheDocument()
  })

  it('turns off public publishing and the promote page respects it', async () => {
    window.location.hash = '#/settings?tab=publishing'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    await user.click(await screen.findByRole('radio', { name: 'Off' }))
    expect(await screen.findByText(/Records stay inside the workspace/)).toBeInTheDocument()
  })

  it('shows the join page for an invite and joins the workspace', async () => {
    window.location.hash = '#/join/inv_sam'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    expect(await screen.findByRole('heading', { name: 'Join Platform Eng on Ledger' })).toBeInTheDocument()
    expect(screen.getByText('sam@northwind.dev')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Join with GitHub' }))
    expect(await screen.findByRole('heading', { name: 'Review inbox' })).toBeInTheDocument()
  })

  it('explains an expired invite', async () => {
    window.location.hash = '#/join/inv_kofi'
    render(<App api={newApi()} />)
    expect(await screen.findByRole('heading', { name: 'This invite can’t be used' })).toBeInTheDocument()
  })
})
