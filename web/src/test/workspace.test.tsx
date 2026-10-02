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
    expect(s.invites.map((i) => i.email ?? `@${i.user?.handle}`)).toEqual(['@meiw', 'sam@northwind.dev', 'kofi@northwind.dev'])
    expect(s.formerMembers.map((f) => f.user.handle)).toEqual(['hannahl'])
  })

  it('invites new emails and explains every skipped one', async () => {
    const res = await newApi().inviteMembers(['Kim@Northwind.dev', 'amara@northwind.dev', 'sam@northwind.dev', 'bad@email', 'kim@northwind.dev'], 'member')
    expect(res.sent).toEqual(['kim@northwind.dev'])
    expect(res.skipped).toEqual([
      { target: 'amara@northwind.dev', reason: 'already a member' },
      { target: 'sam@northwind.dev', reason: 'already invited' },
      { target: 'bad@email', reason: 'not a username or email' },
    ])
    const kim = res.settings.invites.find((i) => i.email === 'kim@northwind.dev')!
    expect(kim.expiresAt).toBe('2026-10-12T20:00:00.000Z')
  })

  it('invites EngLog accounts by username', async () => {
    const api = newApi()
    const res = await api.inviteMembers(['@TomasR', 'adeo', '@amarak', '@meiw', '@nobody-here'], 'member')
    expect(res.sent).toEqual(['@tomasr', '@adeo'])
    expect(res.skipped.map((x) => [x.target, x.reason.split('.')[0]])).toEqual([
      ['@amarak', 'already a member'],
      ['@meiw', 'already invited'],
      ['@nobody-here', 'no EngLog account with that username'],
    ])
    expect(res.settings.invites.find((i) => i.user?.handle === 'tomasr')?.email).toBeUndefined()
    expect((await api.findUsers('@to')).map((u) => u.handle)).toEqual(['tomasr'])
  })

  it('keeps a leaver’s account and credit, and lets them rejoin with the same username', async () => {
    const api = newApi()
    const s = await api.removeMember('u_priya')
    expect(s.members.map((m) => m.user.id)).not.toContain('u_priya')
    expect(s.formerMembers.map((f) => f.user.handle)).toContain('priyas')
    // Their record still credits the same account.
    expect((await api.getRecord('LR-148')).authorIds).toEqual(['u_priya'])
    expect((await api.getProfile('priyas')).user.id).toBe('u_priya')

    const back = await api.inviteMembers(['@priyas'], 'member')
    const inv = back.settings.invites.find((i) => i.user?.id === 'u_priya')!
    expect((await api.previewInvite(inv.id)).rejoining).toBe(true)
    await api.acceptInvite(inv.id)
    const after = await api.getWorkspaceSettings()
    expect(after.members.map((m) => m.user.id)).toContain('u_priya')
    expect(after.formerMembers.map((f) => f.user.id)).not.toContain('u_priya')
  })

  it('keeps at least one owner and lets owners change roles', async () => {
    const api = newApi()
    await expect(api.changeRole('u_nnamdi', 'admin')).rejects.toThrow(/at least one owner/)
    const s = await api.changeRole('u_jordan', 'admin')
    expect(s.members.find((m) => m.user.id === 'u_jordan')?.role).toBe('admin')
    await expect(api.removeMember('u_nnamdi')).rejects.toThrow(/yourself/)
    const s2 = await api.removeMember('u_leo')
    expect(s2.members).toHaveLength(4)
    expect(s2.formerMembers[0].user.id).toBe('u_leo')
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
    await user.type(await screen.findByLabelText('Usernames or emails'), 'kim@northwind.dev, @tom')
    await user.click(await screen.findByRole('button', { name: /Tomás R\..*@tomasr/ }))
    await user.click(screen.getByRole('button', { name: 'Send 2 invites' }))
    expect(await screen.findByText(/Sent to kim@northwind.dev, @tomasr/)).toBeInTheDocument()
    const pending = screen.getByRole('region', { name: /Pending invites · 5/ })
    expect(within(pending).getByText('kim@northwind.dev')).toBeInTheDocument()
    expect(within(pending).getByText('@tomasr')).toBeInTheDocument()
  })

  it('removes a member after confirming', async () => {
    window.location.hash = '#/settings'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    await user.click(await screen.findByRole('button', { name: 'Remove Leo M.' }))
    expect(screen.getByText(/Their 1 record stays here, still credited to/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Leo' }))
    expect(await screen.findByRole('region', { name: 'Members · 4' })).toBeInTheDocument()
    const former = screen.getByRole('region', { name: /Former members · 2/ })
    expect(within(former).getByText('Leo M.')).toBeInTheDocument()
    expect(within(former).getAllByRole('button', { name: 'Invite back' })).toHaveLength(2)
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
    expect(await screen.findByRole('heading', { name: 'Join Platform Eng on EngLog' })).toBeInTheDocument()
    expect(screen.getByText('sam@northwind.dev')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Join with GitHub' }))
    expect(await screen.findByRole('heading', { name: 'Review inbox' })).toBeInTheDocument()
  })

  it('shows a username invite as the invitee’s own account', async () => {
    window.location.hash = '#/join/inv_mei'
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    expect(await screen.findByText('@meiw')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Join as @meiw' }))
    expect(await screen.findByRole('heading', { name: 'Review inbox' })).toBeInTheDocument()
  })

  it('marks authors who left on a record and sends questions to someone still here', async () => {
    window.location.hash = '#/records/LR-201'
    render(<App api={newApi()} />)
    expect(await screen.findByText('(left Northwind)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hannah L.' })).toHaveAttribute('href', '#/u/hannahl')
    expect(screen.getByPlaceholderText('Ask Amara a question…')).toBeInTheDocument()
  })

  it('explains an expired invite', async () => {
    window.location.hash = '#/join/inv_kofi'
    render(<App api={newApi()} />)
    expect(await screen.findByRole('heading', { name: 'This invite can’t be used' })).toBeInTheDocument()
  })
})
