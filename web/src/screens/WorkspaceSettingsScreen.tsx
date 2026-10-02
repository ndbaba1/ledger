import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { Integration, Invite, InviteResult, Member, WorkspaceRole, WorkspaceSettings } from '../api/types'
import { useSession } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { ErrorState, FieldError, Loading } from '../components/States'
import { relativeTime, shortDate } from '../lib/format'
import { useMutation, useQuery } from '../lib/useAsync'

type Tab = 'members' | 'integrations' | 'publishing'

const TABS: { key: Tab; label: string }[] = [
  { key: 'members', label: 'Members' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'publishing', label: 'Publishing' },
]

const ROLE_LABEL: Record<WorkspaceRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }
const ROLE_HELP: Record<WorkspaceRole, string> = {
  owner: 'Everything, including billing and other owners',
  admin: 'Invite people, manage integrations and policy',
  member: 'Write, review and search records',
}

/** The company side of EngLog: who's in the workspace, what it connects to, and what can go public. */
export function WorkspaceSettingsScreen() {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'members') as Tab
  const settings = useQuery(() => api.getWorkspaceSettings(), [api])
  const records = useQuery(() => api.listRecords(), [api])

  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />
  if (!settings.data) return <Loading label="Loading workspace" />
  const s = settings.data
  const canManage = s.myRole !== 'member'

  const recordCounts = new Map<string, number>()
  for (const r of records.data ?? []) for (const a of r.authorIds) recordCounts.set(a, (recordCounts.get(a) ?? 0) + 1)

  return (
    <div className="page page--wide">
      <header className="page-head">
        <div>
          <span className="eyebrow">{s.workspace.company}</span>
          <h1 className="page-title">{s.workspace.name}</h1>
          <p className="page-sub">
            {s.members.length} member{s.members.length === 1 ? '' : 's'} · {records.data?.length ?? '…'} records · you’re{' '}
            {s.myRole === 'member' ? 'a' : 'an'} {ROLE_LABEL[s.myRole].toLowerCase()}
          </p>
        </div>
        {canManage && tab !== 'members' && (
          <Link to="/settings?tab=members" className="btn push-right">
            <Icon name="mail" size={14} />
            Invite people
          </Link>
        )}
      </header>

      {!canManage && (
        <div className="banner banner--amber" role="status">
          <Icon name="lock" size={16} />
          <span>Only owners and admins can change workspace settings. You can see who’s here and what’s connected.</span>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Workspace settings">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className="tabs__tab"
            onClick={() => setParams(t.key === 'members' ? {} : { tab: t.key }, { replace: true })}
          >
            {t.label}
            {t.key === 'members' && <span className="mono muted"> {s.members.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'members' && <MembersTab s={s} canManage={canManage} onChange={settings.setData} recordCounts={recordCounts} />}
      {tab === 'integrations' && <IntegrationsTab s={s} canManage={canManage} onChange={settings.setData} />}
      {tab === 'publishing' && <PublishingTab s={s} canManage={canManage} onChange={settings.setData} />}
    </div>
  )
}

/* ---------------- members ---------------- */

function MembersTab({
  s,
  canManage,
  onChange,
  recordCounts,
}: {
  s: WorkspaceSettings
  canManage: boolean
  onChange: (s: WorkspaceSettings) => void
  recordCounts: Map<string, number>
}) {
  return (
    <div className="settings-grid">
      <div className="stack gap-24">
        {canManage && <InviteForm s={s} onChange={onChange} />}
        <MemberList s={s} canManage={canManage} onChange={onChange} recordCounts={recordCounts} />
        {s.invites.length > 0 && <PendingInvites s={s} canManage={canManage} onChange={onChange} />}
        {s.formerMembers.length > 0 && <FormerMembers s={s} canManage={canManage} onChange={onChange} recordCounts={recordCounts} />}
      </div>
      <div className="stack gap-16">
        <InviteLinkCard s={s} canManage={canManage} onChange={onChange} />
        <DomainCard s={s} canManage={canManage} onChange={onChange} />
      </div>
    </div>
  )
}

/** The token being typed at the end of the invite box, if it looks like a username. */
function trailingHandle(text: string): string | null {
  if (!text || /[\s,;]$/.test(text)) return null
  const last = text.split(/[\s,;]+/).pop() ?? ''
  const m = /^@?([a-z0-9_-]{2,})$/i.exec(last)
  return m ? m[1].toLowerCase() : null
}

function InviteForm({ s, onChange }: { s: WorkspaceSettings; onChange: (s: WorkspaceSettings) => void }) {
  const api = useApi()
  const [text, setText] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('member')
  const [result, setResult] = useState<InviteResult>()
  const invite = useMutation((list: string[], r: WorkspaceRole) => api.inviteMembers(list, r))
  const parsed = useMemo(() => text.split(/[\s,;]+/).filter(Boolean), [text])
  const typing = trailingHandle(text)
  const suggestions = useQuery(() => (typing ? api.findUsers(typing) : Promise.resolve([])), [api, typing])
  const taken = new Set([...s.members.map((m) => m.user.id), ...s.invites.flatMap((i) => (i.user ? [i.user.id] : []))])
  const options = (suggestions.data ?? []).filter((u) => !parsed.slice(0, -1).includes(`@${u.handle}`))
  const domain = s.autoJoinDomain ?? 'northwind.dev'

  const pick = (handle: string) => {
    const head = text.replace(/@?[a-z0-9_-]*$/i, '')
    setText(`${head}@${handle}, `)
    document.getElementById('invite-targets')?.focus()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const res = await invite.run(parsed, role)
    if (res) {
      onChange(res.settings)
      setResult(res)
      if (res.sent.length) setText(res.skipped.map((x) => x.target).join('\n'))
    }
  }

  return (
    <section className="card stack gap-12" aria-labelledby="invite-title">
      <div className="stack gap-4">
        <h2 id="invite-title" className="side-title">
          Invite your team
        </h2>
        <p className="small muted">
          Already on EngLog? Invite them by <span className="mono text">@username</span>. Their account stays theirs, so if they leave{' '}
          {s.workspace.company}, their public posts and profile go with them. New to EngLog? Use their work email.
        </p>
      </div>
      <form className="stack gap-10" onSubmit={submit}>
        <label htmlFor="invite-targets" className="label">
          Usernames or emails
        </label>
        <div className="invite-box">
          <textarea
            id="invite-targets"
            className="input input--lines"
            rows={3}
            placeholder={`@meiw, sam@${domain}`}
            value={text}
            autoComplete="off"
            aria-describedby={options.length && typing ? 'invite-suggest' : undefined}
            onChange={(e) => {
              setText(e.target.value)
              invite.clearError()
            }}
          />
          {typing && options.length > 0 && (
            <ul id="invite-suggest" className="suggest" aria-label="EngLog accounts">
              {options.map((u) => (
                <li key={u.id}>
                  <button type="button" className="suggest__item" disabled={taken.has(u.id)} onClick={() => pick(u.handle)}>
                    <Avatar user={u} size="xs" />
                    <span className="suggest__name">{u.name}</span>
                    <span className="mono small muted">@{u.handle}</span>
                    {taken.has(u.id) && <span className="small muted push-right">already here</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="row gap-10 wrap">
          <label htmlFor="invite-role" className="small muted">
            Invite as
          </label>
          <select id="invite-role" className="select" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
            {(['member', 'admin', ...(s.myRole === 'owner' ? ['owner'] : [])] as WorkspaceRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]} — {ROLE_HELP[r]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn--primary push-right" disabled={!parsed.length || invite.pending}>
            {invite.pending ? 'Sending…' : `Send ${parsed.length > 1 ? `${parsed.length} invites` : 'invite'}`}
          </button>
        </div>
        <FieldError message={invite.error} />
        {result && (
          <div className="stack gap-4 small" aria-live="polite">
            {result.sent.length > 0 && (
              <span className="text-green">
                <Icon name="check" size={12} strokeWidth={3} /> Sent to {result.sent.join(', ')}
              </span>
            )}
            {result.skipped.map((x) => (
              <span key={x.target} className="text-amber">
                Skipped {x.target}: {x.reason}
              </span>
            ))}
          </div>
        )}
      </form>
    </section>
  )
}

function MemberList({
  s,
  canManage,
  onChange,
  recordCounts,
}: {
  s: WorkspaceSettings
  canManage: boolean
  onChange: (s: WorkspaceSettings) => void
  recordCounts: Map<string, number>
}) {
  return (
    <section className="stack gap-10" aria-labelledby="members-title">
      <h2 id="members-title" className="eyebrow">
        Members · {s.members.length}
      </h2>
      <ul className="member-list">
        {s.members.map((m) => (
          <MemberRow key={m.user.id} m={m} s={s} canManage={canManage} onChange={onChange} records={recordCounts.get(m.user.id) ?? 0} />
        ))}
      </ul>
    </section>
  )
}

function MemberRow({
  m,
  s,
  canManage,
  onChange,
  records,
}: {
  m: Member
  s: WorkspaceSettings
  canManage: boolean
  onChange: (s: WorkspaceSettings) => void
  records: number
}) {
  const api = useApi()
  const { me } = useSession()
  const [confirming, setConfirming] = useState(false)
  const change = useMutation((role: WorkspaceRole) => api.changeRole(m.user.id, role))
  const remove = useMutation(() => api.removeMember(m.user.id))
  const isMe = m.user.id === me.id
  // Admins can't touch owners; nobody removes themselves from here.
  const canEdit = canManage && (s.myRole === 'owner' || m.role !== 'owner')
  const roles: WorkspaceRole[] = s.myRole === 'owner' ? ['owner', 'admin', 'member'] : ['admin', 'member']

  return (
    <li className="member">
      <Avatar user={m.user} size="sm" />
      <div className="member__who">
        <span className="member__name">
          {m.user.name}
          {isMe && <span className="muted"> (you)</span>}
        </span>
        <span className="small muted truncate">
          <Link to={`/u/${m.user.handle}`} className="mono">
            @{m.user.handle}
          </Link>
          {m.workEmail && <span className="hide-mobile"> · {m.workEmail}</span>}
        </span>
      </div>
      <span className="member__stat small muted">
        {records} record{records === 1 ? '' : 's'}
        <span className="hide-mobile"> · joined {shortDate(m.joinedAt)}</span>
      </span>
      <div className="member__actions">
        {canEdit ? (
          <>
            <label htmlFor={`role-${m.user.id}`} className="sr-only">
              Role for {m.user.name}
            </label>
            <select
              id={`role-${m.user.id}`}
              className="select select--sm"
              value={m.role}
              disabled={change.pending}
              onChange={async (e) => {
                const next = await change.run(e.target.value as WorkspaceRole)
                if (next) onChange(next)
              }}
            >
              {(roles.includes(m.role) ? roles : [m.role, ...roles]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className={`role-pill role-pill--${m.role}`}>{ROLE_LABEL[m.role]}</span>
        )}
        {canEdit && !isMe && (
          confirming ? (
            <span className="row gap-6">
              <button
                type="button"
                className="btn btn--danger-text btn--sm"
                disabled={remove.pending}
                onClick={async () => {
                  const next = await remove.run()
                  if (next) onChange(next)
                }}
              >
                Remove {m.user.name.split(' ')[0]}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove ${m.user.name}`} onClick={() => setConfirming(true)}>
              <Icon name="x" size={14} />
            </button>
          )
        )}
      </div>
      {(change.error || remove.error) && (
        <div className="member__error">
          <FieldError message={change.error ?? remove.error} />
        </div>
      )}
      {confirming && (
        <p className="member__note small muted">
          They lose access to the workspace now. {records ? `Their ${records} record${records === 1 ? ' stays' : 's stay'} here, still credited to` : 'Their account'}{' '}
          <span className="mono">@{m.user.handle}</span>{records ? '' : ' stays theirs'}, and their public profile goes with them.
        </p>
      )}
    </li>
  )
}

function PendingInvites({ s, canManage, onChange }: { s: WorkspaceSettings; canManage: boolean; onChange: (s: WorkspaceSettings) => void }) {
  const api = useApi()
  const resend = useMutation((id: string) => api.resendInvite(id))
  const revoke = useMutation((id: string) => api.revokeInvite(id))
  const now = Date.now()
  return (
    <section className="stack gap-10" aria-labelledby="pending-title">
      <h2 id="pending-title" className="eyebrow">
        Pending invites · {s.invites.length}
      </h2>
      <ul className="member-list">
        {s.invites.map((inv) => {
          const expired = new Date(inv.expiresAt).getTime() < now
          return (
            <li key={inv.id} className="member member--invite">
              {inv.user ? (
                <Avatar user={inv.user} size="sm" />
              ) : (
                <span className="avatar avatar--sm member__pending" aria-hidden="true">
                  <Icon name="mail" size={14} />
                </span>
              )}
              <div className="member__who">
                {inv.user ? (
                  <span className="member__name">
                    {inv.user.name} <span className="mono small muted">@{inv.user.handle}</span>
                  </span>
                ) : (
                  <span className="member__name mono">{inv.email}</span>
                )}
                <span className={`small ${expired ? 'text-amber' : 'muted'}`}>
                  {expired ? 'Expired' : `Sent ${relativeTime(inv.sentAt)}`} · {ROLE_LABEL[inv.role]}
                </span>
              </div>
              <span className="member__stat small muted hide-mobile">
                {expired ? `expired ${shortDate(inv.expiresAt)}` : `expires ${shortDate(inv.expiresAt)}`}
              </span>
              {canManage && (
                <div className="member__actions">
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={resend.pending}
                    onClick={async () => {
                      const next = await resend.run(inv.id)
                      if (next) onChange(next)
                    }}
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={revoke.pending}
                    onClick={async () => {
                      const next = await revoke.run(inv.id)
                      if (next) onChange(next)
                    }}
                  >
                    Revoke
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <FieldError message={resend.error ?? revoke.error} />
      <p className="small muted">
        Preview what an invitee sees: <Link to={`/join/${s.invites[0].id}`}>open the invite for {inviteLabel(s.invites[0])}</Link>
      </p>
    </section>
  )
}

function inviteLabel(inv: Invite): string {
  return inv.user ? `@${inv.user.handle}` : (inv.email ?? 'invite')
}

/** People who left. Their accounts are theirs; the team keeps the records, still credited to them. */
function FormerMembers({
  s,
  canManage,
  onChange,
  recordCounts,
}: {
  s: WorkspaceSettings
  canManage: boolean
  onChange: (s: WorkspaceSettings) => void
  recordCounts: Map<string, number>
}) {
  const api = useApi()
  const reinvite = useMutation((handle: string, role: WorkspaceRole) => api.inviteMembers([`@${handle}`], role))
  const invited = new Set(s.invites.flatMap((i) => (i.user ? [i.user.id] : [])))
  return (
    <section className="stack gap-10" aria-labelledby="former-title">
      <div className="stack gap-4">
        <h2 id="former-title" className="eyebrow">
          Former members · {s.formerMembers.length}
        </h2>
        <p className="small muted">
          They no longer have access. Records they wrote stay here, still credited to their EngLog account, and their public
          posts stay on their own profile.
        </p>
      </div>
      <ul className="member-list">
        {s.formerMembers.map((f) => {
          const records = recordCounts.get(f.user.id) ?? 0
          return (
            <li key={f.user.id} className="member member--former">
              <Avatar user={f.user} size="sm" />
              <div className="member__who">
                <span className="member__name">{f.user.name}</span>
                <span className="small muted truncate">
                  <Link to={`/u/${f.user.handle}`} className="mono">
                    @{f.user.handle}
                  </Link>{' '}
                  · left {shortDate(f.leftAt)}
                </span>
              </div>
              <span className="member__stat small muted">
                {records} record{records === 1 ? '' : 's'} credited
              </span>
              {canManage && (
                <div className="member__actions">
                  {invited.has(f.user.id) ? (
                    <span className="small muted">Invited back</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={reinvite.pending}
                      onClick={async () => {
                        const res = await reinvite.run(f.user.handle, f.role === 'owner' ? 'admin' : f.role)
                        if (res) onChange(res.settings)
                      }}
                    >
                      Invite back
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <FieldError message={reinvite.error} />
    </section>
  )
}

function InviteLinkCard({ s, canManage, onChange }: { s: WorkspaceSettings; canManage: boolean; onChange: (s: WorkspaceSettings) => void }) {
  const api = useApi()
  const [copied, setCopied] = useState(false)
  const toggle = useMutation((enabled: boolean, reset?: boolean) => api.setInviteLink(enabled, reset))
  const url = `${window.location.origin}${window.location.pathname}#/join/${s.inviteLink.token}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      document.getElementById('invite-link')?.focus()
    }
  }

  return (
    <section className="card stack gap-10" aria-labelledby="link-title">
      <div className="row gap-8">
        <h2 id="link-title" className="side-title">
          Invite link
        </h2>
        <span className={`status-pill ${s.inviteLink.enabled ? 'status-pill--shipped' : 'status-pill--draft'} push-right`}>
          {s.inviteLink.enabled ? 'On' : 'Off'}
        </span>
      </div>
      <p className="small muted">Anyone with the link can join as a member. Share it in your team’s Slack instead of collecting emails.</p>
      {s.inviteLink.enabled && (
        <div className="row gap-8">
          <label htmlFor="invite-link" className="sr-only">
            Invite link
          </label>
          <input id="invite-link" className="input mono small" readOnly value={url} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn--sm" onClick={copy}>
            <Icon name={copied ? 'check' : 'link'} size={13} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {canManage && (
        <div className="row gap-8 wrap">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={toggle.pending}
            onClick={async () => {
              const next = await toggle.run(!s.inviteLink.enabled)
              if (next) onChange(next)
            }}
          >
            {s.inviteLink.enabled ? 'Turn off' : 'Turn on'}
          </button>
          {s.inviteLink.enabled && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={toggle.pending}
              onClick={async () => {
                const next = await toggle.run(true, true)
                if (next) onChange(next)
              }}
            >
              Reset link
            </button>
          )}
        </div>
      )}
      {s.inviteLink.enabled && (
        <Link to={`/join/${s.inviteLink.token}`} className="small">
          Preview the join page
        </Link>
      )}
      <FieldError message={toggle.error} />
    </section>
  )
}

function DomainCard({ s, canManage, onChange }: { s: WorkspaceSettings; canManage: boolean; onChange: (s: WorkspaceSettings) => void }) {
  const api = useApi()
  const [domain, setDomain] = useState(s.autoJoinDomain ?? '')
  const save = useMutation((d: string | null) => api.setAutoJoinDomain(d))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = await save.run(domain.trim() || null)
    if (next) {
      onChange(next)
      setDomain(next.autoJoinDomain ?? '')
    }
  }

  return (
    <section className="card stack gap-10" aria-labelledby="domain-title">
      <h2 id="domain-title" className="side-title">
        Join by company email
      </h2>
      <p className="small muted">
        {s.autoJoinDomain
          ? `Anyone who signs in with an @${s.autoJoinDomain} email joins automatically as a member.`
          : 'Let anyone with your company email join as a member, without an invite.'}
      </p>
      {canManage && (
        <form className="stack gap-8" onSubmit={submit}>
          <label htmlFor="auto-domain" className="sr-only">
            Company email domain
          </label>
          <div className="row gap-8">
            <span className="domain-input">
              <span className="muted">@</span>
              <input
                id="auto-domain"
                className="domain-input__field"
                placeholder="northwind.dev"
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value)
                  save.clearError()
                }}
              />
            </span>
            <button type="submit" className="btn btn--sm" disabled={save.pending || domain.trim() === (s.autoJoinDomain ?? '')}>
              Save
            </button>
          </div>
          {s.autoJoinDomain && (
            <button
              type="button"
              className="btn-link align-start"
              onClick={async () => {
                const next = await save.run(null)
                if (next) {
                  onChange(next)
                  setDomain('')
                }
              }}
            >
              Turn off
            </button>
          )}
          <FieldError message={save.error} />
        </form>
      )}
    </section>
  )
}

/* ---------------- integrations ---------------- */

const PROVIDER: Record<Integration['provider'], { name: string; what: string }> = {
  gitlab: { name: 'GitLab', what: 'Issues and merge requests. A closed issue with the EngLog label becomes a draft.' },
  github: { name: 'GitHub', what: 'Issues and pull requests, and verification badges for public posts.' },
  slack: { name: 'Slack', what: 'Threads linked from issues, /englog track, and “seen this before” replies to alerts.' },
}

function IntegrationsTab({ s, canManage, onChange }: { s: WorkspaceSettings; canManage: boolean; onChange: (s: WorkspaceSettings) => void }) {
  const api = useApi()
  const setIntegration = useMutation((provider: Integration['provider'], connected: boolean) => api.setIntegration(provider, connected))
  const [label, setLabel] = useState(s.policy.triggerLabel)
  const saveLabel = useMutation((l: string) => api.updatePolicy({ triggerLabel: l }))

  return (
    <div className="settings-grid">
      <div className="stack gap-12">
        {s.integrations.map((i) => (
          <section key={i.provider} className="card integration" aria-labelledby={`int-${i.provider}`}>
            <div className="row gap-10 wrap">
              <span className={`dot ${i.connected ? 'dot--ok' : ''}`} aria-hidden="true" />
              <h2 id={`int-${i.provider}`} className="side-title">
                {PROVIDER[i.provider].name}
              </h2>
              <span className="small muted">{i.connected ? `Connected · ${i.detail}` : 'Not connected'}</span>
              {canManage && (
                <button
                  type="button"
                  className={`btn btn--sm push-right${i.connected ? ' btn--ghost' : ' btn--primary'}`}
                  disabled={setIntegration.pending}
                  onClick={async () => {
                    const next = await setIntegration.run(i.provider, !i.connected)
                    if (next) onChange(next)
                  }}
                >
                  {i.connected ? 'Disconnect' : `Connect ${PROVIDER[i.provider].name}`}
                </button>
              )}
            </div>
            <p className="small muted">{PROVIDER[i.provider].what}</p>
            {i.provider === 'slack' && i.connected && i.channels && (
              <div className="stack gap-6">
                <span className="eyebrow">Channels EngLog reads</span>
                <div className="row gap-6 wrap">
                  {i.channels.map((c) => (
                    <span key={c} className="chip">
                      {c}
                    </span>
                  ))}
                </div>
                <span className="small muted">Add a channel by inviting @EngLog to it in Slack.</span>
              </div>
            )}
          </section>
        ))}
        <FieldError message={setIntegration.error} />
      </div>

      <section className="card stack gap-10" aria-labelledby="label-title">
        <h2 id="label-title" className="side-title">
          Draft trigger label
        </h2>
        <p className="small muted">
          When an issue closes with this label, EngLog gathers its case file and drafts a record for review.
        </p>
        <form
          className="stack gap-8"
          onSubmit={async (e) => {
            e.preventDefault()
            const next = await saveLabel.run(label)
            if (next) {
              onChange(next)
              setLabel(next.policy.triggerLabel)
            }
          }}
        >
          <label htmlFor="trigger-label" className="sr-only">
            Trigger label
          </label>
          <div className="row gap-8">
            <span className="domain-input">
              <span className="muted">~</span>
              <input
                id="trigger-label"
                className="domain-input__field"
                value={label}
                disabled={!canManage}
                onChange={(e) => {
                  setLabel(e.target.value)
                  saveLabel.clearError()
                }}
              />
            </span>
            {canManage && (
              <button type="submit" className="btn btn--sm" disabled={saveLabel.pending || label === s.policy.triggerLabel}>
                Save
              </button>
            )}
          </div>
          <FieldError message={saveLabel.error} />
        </form>
      </section>
    </div>
  )
}

/* ---------------- publishing ---------------- */

function PublishingTab({ s, canManage, onChange }: { s: WorkspaceSettings; canManage: boolean; onChange: (s: WorkspaceSettings) => void }) {
  const api = useApi()
  const update = useMutation((patch: Partial<WorkspaceSettings['policy']>) => api.updatePolicy(patch))
  const set = async (patch: Partial<WorkspaceSettings['policy']>) => {
    const next = await update.run(patch)
    if (next) onChange(next)
  }

  return (
    <div className="settings-grid">
      <div className="stack gap-16">
        <Choice
          title="Publishing to public profiles"
          help="Members can promote team records they wrote to their own public profile. It always goes through redaction first."
        >
          <div className="segmented" role="radiogroup" aria-label="Publishing to public profiles">
            {(
              [
                ['allowed', 'Allowed'],
                ['off', 'Off'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={`segmented__opt${s.policy.publicPromotion === value ? ' segmented__opt--on' : ''}`}>
                <input
                  type="radio"
                  name="public-promotion"
                  checked={s.policy.publicPromotion === value}
                  disabled={!canManage || update.pending}
                  onChange={() => set({ publicPromotion: value })}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="small muted">
            {s.policy.publicPromotion === 'allowed'
              ? 'Engineers keep credit for their work, checked against GitHub. Code, teammates and internal links stay private.'
              : 'Records stay inside the workspace. Existing public posts aren’t removed.'}
          </p>
        </Choice>

        <Choice
          title="Redaction review"
          help="Start every promotion with all redaction rules on — service names, teammates, internal links and record IDs — so authors opt in to anything they keep."
        >
          <label className="toggle">
            <input
              type="checkbox"
              checked={s.policy.requireRedactionReview}
              disabled={!canManage || update.pending || s.policy.publicPromotion === 'off'}
              onChange={(e) => set({ requireRedactionReview: e.target.checked })}
            />
            <span>Require the full redaction review</span>
          </label>
        </Choice>
        <FieldError message={update.error} />
      </div>

      <aside className="card stack gap-8" aria-label="What never leaves the workspace">
        <h2 className="side-title">Never published, whatever the setting</h2>
        <ul className="plain-list small muted how-list">
          <li>Source links, Slack messages and diffs</li>
          <li>Alert, metric and error signals</li>
          <li>Teammates’ names, unless the author keeps them</li>
          <li>Questions and answers on team records</li>
        </ul>
      </aside>
    </div>
  )
}

function Choice({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <section className="card stack gap-10">
      <div className="stack gap-4">
        <h2 className="side-title">{title}</h2>
        <p className="small muted">{help}</p>
      </div>
      {children}
    </section>
  )
}
