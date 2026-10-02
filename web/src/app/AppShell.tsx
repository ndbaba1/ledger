import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Icon, type IconName } from '../components/Icon'
import { useSession } from './session'

interface NavItem {
  to: string
  label: string
  short: string
  icon: IconName
  count?: number
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <span className="logo__mark" aria-hidden="true">
        E
      </span>
      {!compact && <span className="logo__word">EngLog</span>}
    </span>
  )
}

export function AppShell() {
  const { me, workspace, inboxCount } = useSession()

  const items: NavItem[] = [
    { to: '/inbox', label: 'Review inbox', short: 'Inbox', icon: 'inbox', count: inboxCount },
    { to: '/cases', label: 'Open cases', short: 'Cases', icon: 'folder' },
    { to: '/records', label: 'Records', short: 'Records', icon: 'book' },
    { to: '/search', label: 'Search', short: 'Search', icon: 'search' },
    { to: `/u/${me.handle}`, label: 'My public profile', short: 'Profile', icon: 'globe' },
  ]
  const explore: NavItem = { to: '/', label: 'Explore', short: 'Explore', icon: 'compass' }
  const team: NavItem = { to: '/settings', label: 'Team & settings', short: 'Team', icon: 'users' }

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace">
        <Link to="/inbox" className="sidebar__logo" aria-label="EngLog home">
          <Logo />
        </Link>
        <Link to="/settings" className="workspace-switch" aria-label={`${workspace.name} workspace settings`}>
          <span className="workspace-switch__text">
            <span className="workspace-switch__name">{workspace.name}</span>
            <span className="workspace-switch__kind">{workspace.company} · team workspace</span>
          </span>
          <Icon name="settings" size={14} />
        </Link>
        <Link to="/new" className="btn btn--primary sidebar__new">
          <Icon name="plus" size={15} strokeWidth={2.5} />
          <span className="sidebar__new-label">New write-up</span>
        </Link>
        <nav className="sidebar__nav" aria-label="Primary">
          {[...items, team, explore].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link" title={item.label}>
              <Icon name={item.icon} size={17} />
              <span className="nav-link__label">{item.label}</span>
              {item.count ? (
                <span className="nav-link__count" aria-label={`${item.count} waiting`}>
                  {item.count}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__connections">
          <span className="eyebrow">Connected</span>
          {workspace.connections.map((c) => (
            <span key={c.provider} className="connection">
              <span className="dot dot--ok" aria-hidden="true" />
              <span className="connection__name">{c.provider === 'gitlab' ? 'GitLab' : c.provider === 'github' ? 'GitHub' : 'Slack'}</span>
              <span className="connection__label">· {c.label}</span>
            </span>
          ))}
        </div>
        <Link to={`/u/${me.handle}`} className="sidebar__me">
          <Avatar user={me} size="sm" />
          <span className="sidebar__me-text">
            <span className="sidebar__me-name">{me.name}</span>
            <span className="mono muted small">@{me.handle}</span>
          </span>
        </Link>
      </aside>

      <div className="shell__body">
        <header className="topbar">
          <Link to="/inbox" className="topbar__logo" aria-label="EngLog home">
            <Logo />
          </Link>
          <Link to="/settings" className="topbar__workspace" aria-label={`${workspace.name} team and settings`}>
            {workspace.name}
          </Link>
          <GlobalSearch />
          <Link to="/new" className="icon-btn topbar__search-link topbar__new" aria-label="New write-up">
            <Icon name="plus" size={20} />
          </Link>
          <Link to="/search" className="icon-btn topbar__search-link" aria-label="Search">
            <Icon name="search" size={18} />
          </Link>
        </header>
        <main id="main" className="shell__main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <nav className="tabbar" aria-label="Primary">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className="tabbar__item">
            <span className="tabbar__icon">
              <Icon name={item.icon} size={20} />
              {item.count ? <span className="tabbar__badge">{item.count}</span> : null}
            </span>
            <span>{item.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }
  return (
    <form className="global-search" role="search" onSubmit={submit}>
      <Icon name="search" size={14} />
      <label htmlFor="global-search" className="sr-only">
        Search records
      </label>
      <input
        id="global-search"
        type="search"
        placeholder="Search records, errors, services…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  )
}
