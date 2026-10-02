import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { features } from '../lib/features'
import { Logo } from './AppShell'
import { signInWithGithub, signOut } from './githubAuth'
import { useMe, usePendingQuestions } from './session'

/** Chrome for public pages — explore, profiles and posts — as a visitor sees them. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const me = useMe()
  const location = useLocation()
  const { questionCount } = usePendingQuestions()

  return (
    <div className="public">
      <header className="public__head">
        <Link to="/" aria-label="EngLog — explore records">
          <Logo />
        </Link>
        <nav className="public__nav" aria-label="Public">
          <NavLink to="/" end className="public__link">
            Explore
          </NavLink>
          {me && (
            <NavLink to={`/u/${me.handle}`} className="public__link">
              My profile
            </NavLink>
          )}
          {me && features.publicQA && questionCount > 0 && (
            <Link to="/me/questions" className="public__link public__questions" aria-label={`${questionCount} question${questionCount === 1 ? '' : 's'} waiting for an answer`}>
              <Icon name="message" size={15} />
              <span className="public__questions-count">{questionCount}</span>
            </Link>
          )}
        </nav>
        <div className="row gap-8 push-right">
          {me ? (
            <>
              {features.workspace && (
                <Link to="/inbox" className="btn btn--ghost btn--sm public__workspace">
                  Open workspace
                </Link>
              )}
              <Link to="/new" className="btn btn--primary btn--sm">
                Write
              </Link>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => signOut().then(() => window.location.reload())}>
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => signInWithGithub(location.pathname + location.search)}
            >
              Sign in with GitHub
            </button>
          )}
        </div>
      </header>
      <main id="main" className="public__main">
        {children}
      </main>
    </div>
  )
}
