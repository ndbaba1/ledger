import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { UnauthorizedError } from '../api/client'
import type { ID, User, Workspace } from '../api/types'
import { features } from '../lib/features'
import { signInWithGithub, takeReturnTo } from './githubAuth'

/** Who's looking, whether or not they're signed in. Every public screen can read this. */
interface Viewer {
  me: User | null
  /** Updates the cached viewer after editing your own profile. */
  setMe: (me: User) => void
}

/** `workspace` is null in live mode, where there's no team workspace at all. */
interface WorkspaceState {
  workspace: Workspace | null
  /** Drafts waiting for review, for the nav badge. */
  inboxCount: number
  refreshInbox: () => void
}

/** Pending questions on my own posts, for the header badge. */
interface QuestionsState {
  questionCount: number
  refreshQuestions: () => void
}

interface Session {
  me: User
  workspace: Workspace
  inboxCount: number
  refreshInbox: () => void
}

const ViewerContext = createContext<Viewer | null>(null)
const WorkspaceContext = createContext<WorkspaceState | null>(null)
const QuestionsContext = createContext<QuestionsState | null>(null)

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const api = useApi()
  const [viewer, setViewer] = useState<Viewer>()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [inboxCount, setInboxCount] = useState(0)
  const [questionCount, setQuestionCount] = useState(0)
  const [error, setError] = useState<Error>()

  const setMe = useCallback((me: User) => setViewer((v) => (v ? { ...v, me } : v)), [])

  useEffect(() => {
    api
      .me()
      .then((me) => setViewer({ me, setMe }))
      .catch((e: unknown) => {
        if (e instanceof UnauthorizedError) setViewer({ me: null, setMe })
        else setError(e instanceof Error ? e : new Error(String(e)))
      })
  }, [api, setMe])

  useEffect(() => {
    if (!features.workspace) return
    api.workspace().then(setWorkspace).catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))))
  }, [api])

  const refreshInbox = useCallback(() => {
    if (!features.workspace) return
    api
      .listDrafts()
      .then((d) => setInboxCount(d.length))
      .catch(() => {})
  }, [api])

  useEffect(() => {
    if (viewer?.me) refreshInbox()
  }, [viewer, refreshInbox])

  const refreshQuestions = useCallback(() => {
    if (!features.publicQA) return
    api
      .myQuestions()
      .then((qs) => setQuestionCount(qs.length))
      .catch(() => {})
  }, [api])

  useEffect(() => {
    if (viewer?.me) refreshQuestions()
    else setQuestionCount(0)
  }, [viewer, refreshQuestions])

  const workspaceValue = useMemo<WorkspaceState>(
    () => ({ workspace, inboxCount, refreshInbox }),
    [workspace, inboxCount, refreshInbox],
  )
  const questionsValue = useMemo<QuestionsState>(() => ({ questionCount, refreshQuestions }), [questionCount, refreshQuestions])

  if (error) throw error
  // Live mode has no workspace to wait for — only the viewer blocks render.
  if (!viewer) return <>{fallback}</>

  return (
    <ViewerContext.Provider value={viewer}>
      <WorkspaceContext.Provider value={workspaceValue}>
        <QuestionsContext.Provider value={questionsValue}>{children}</QuestionsContext.Provider>
      </WorkspaceContext.Provider>
    </ViewerContext.Provider>
  )
}

/** The signed-in user, or null when signed out. Safe on every public screen. */
export function useMe(): User | null {
  const viewer = useContext(ViewerContext)
  if (!viewer) throw new Error('useMe must be used inside <SessionProvider>')
  return viewer.me
}

/** Updates the cached signed-in user, e.g. after saving profile edits. */
export function useSetMe(): (me: User) => void {
  const viewer = useContext(ViewerContext)
  if (!viewer) throw new Error('useSetMe must be used inside <SessionProvider>')
  return viewer.setMe
}

/** The team workspace, or null in live mode / while it's loading. Never throws. */
export function useMaybeWorkspace(): Workspace | null {
  const state = useContext(WorkspaceContext)
  return state?.workspace ?? null
}

/** Pending questions on my own posts, for the header badge. Zero and inert when signed out. */
export function usePendingQuestions(): QuestionsState {
  const state = useContext(QuestionsContext)
  if (!state) throw new Error('usePendingQuestions must be used inside <SessionProvider>')
  return state
}

/** Workspace-only screens: throws if nobody's signed in, or there's no workspace. Pair with <RequireAuth>. */
export function useSession(): Session {
  const viewer = useContext(ViewerContext)
  const rest = useContext(WorkspaceContext)
  if (!viewer || !rest) throw new Error('useSession must be used inside <SessionProvider>')
  if (!viewer.me) throw new Error('Sign in to continue.')
  if (!rest.workspace) throw new Error('There is no team workspace in this version of EngLog.')
  return { me: viewer.me, workspace: rest.workspace, inboxCount: rest.inboxCount, refreshInbox: rest.refreshInbox }
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
