import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { UnauthorizedError } from '../api/client'
import type { ID, User, Workspace } from '../api/types'
import { signInWithGithub, takeReturnTo } from './githubAuth'

/** Who's looking, whether or not they're signed in. Every public screen can read this. */
interface Viewer {
  me: User | null
}

interface Session {
  me: User
  workspace: Workspace
  /** Drafts waiting for review, for the nav badge. */
  inboxCount: number
  refreshInbox: () => void
}

const ViewerContext = createContext<Viewer | null>(null)
const WorkspaceContext = createContext<Omit<Session, 'me'> | null>(null)

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const api = useApi()
  const [viewer, setViewer] = useState<Viewer>()
  const [workspace, setWorkspace] = useState<Workspace>()
  const [inboxCount, setInboxCount] = useState(0)
  const [error, setError] = useState<Error>()

  useEffect(() => {
    api
      .me()
      .then((me) => setViewer({ me }))
      .catch((e: unknown) => {
        if (e instanceof UnauthorizedError) setViewer({ me: null })
        else setError(e instanceof Error ? e : new Error(String(e)))
      })
  }, [api])

  useEffect(() => {
    api.workspace().then(setWorkspace).catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))))
  }, [api])

  const refreshInbox = useCallback(() => {
    api
      .listDrafts()
      .then((d) => setInboxCount(d.length))
      .catch(() => {})
  }, [api])

  useEffect(() => {
    if (viewer?.me) refreshInbox()
  }, [viewer, refreshInbox])

  const workspaceValue = useMemo(
    () => (workspace ? { workspace, inboxCount, refreshInbox } : null),
    [workspace, inboxCount, refreshInbox],
  )

  if (error) throw error
  if (!viewer || !workspaceValue) return <>{fallback}</>

  return (
    <ViewerContext.Provider value={viewer}>
      <WorkspaceContext.Provider value={workspaceValue}>{children}</WorkspaceContext.Provider>
    </ViewerContext.Provider>
  )
}

/** The signed-in user, or null when signed out. Safe on every public screen. */
export function useMe(): User | null {
  const viewer = useContext(ViewerContext)
  if (!viewer) throw new Error('useMe must be used inside <SessionProvider>')
  return viewer.me
}

/** Workspace-only screens: throws if nobody's signed in. Pair with <RequireAuth>. */
export function useSession(): Session {
  const viewer = useContext(ViewerContext)
  const rest = useContext(WorkspaceContext)
  if (!viewer || !rest) throw new Error('useSession must be used inside <SessionProvider>')
  if (!viewer.me) throw new Error('Sign in to continue.')
  return { me: viewer.me, ...rest }
}

/** Resolve user IDs to users. Returns a lookup that is empty until loaded. */
export function useUsers(ids: ID[]): Map<ID, User> {
  const api = useApi()
  const key = [...new Set(ids)].sort().join(',')
  const [users, setUsers] = useState<Map<ID, User>>(new Map())

  useEffect(() => {
    if (!key) return
    let live = true
    api.users(key.split(',')).then((list) => live && setUsers(new Map(list.map((u) => [u.id, u]))))
    return () => {
      live = false
    }
  }, [api, key])

  return users
}

/** Guards workspace routes: sends a signed-out visitor to GitHub, then back here. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe()
  const location = useLocation()

  useEffect(() => {
    if (!me) signInWithGithub(location.pathname + location.search)
  }, [me, location])

  if (!me) return <div className="state">Signing in…</div>
  return <>{children}</>
}

/** Mounted once near the router root: hops back to whatever page triggered sign-in. */
export function ReturnToAfterSignIn() {
  const me = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (!me) return
    const returnTo = takeReturnTo()
    if (returnTo) navigate(returnTo, { replace: true })
  }, [me, navigate])

  return null
}
