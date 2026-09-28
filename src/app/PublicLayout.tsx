import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from './AppShell'
import { useSession } from './session'

/** Chrome for public pages: profile and posts, as a visitor sees them. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { me } = useSession()
  return (
    <div className="public">
      <header className="public__head">
        <Link to={`/u/${me.handle}`} aria-label="Ledger">
          <Logo />
        </Link>
        <span className="public__note small muted">Verified engineering write-ups</span>
        <Link to="/inbox" className="btn btn--ghost btn--sm push-right">
          Open workspace
        </Link>
      </header>
      <main id="main" className="public__main">
        {children}
      </main>
    </div>
  )
}
