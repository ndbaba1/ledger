import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApi } from '../api/ApiContext'
import type { ID, User, Workspace } from '../api/types'

interface Session {
  me: User
  workspace: Workspace
  /** Drafts waiting for review, for the nav badge. */
  inboxCount: number
  refreshInbox: () => void
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const api = useApi()
  const [base, setBase] = useState<{ me: User; workspace: Workspace }>()
  const [inboxCount, setInboxCount] = useState(0)
  const [error, setError] = useState<Error>()

  useEffect(() => {
    Promise.all([api.me(), api.workspace()])
      .then(([me, workspace]) => setBase({ me, workspace }))
      .catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))))
  }, [api])

  const refreshInbox = useCallback(() => {
    api.listDrafts().then((d) => setInboxCount(d.length)).catch(() => {})
  }, [api])

  useEffect(refreshInbox, [refreshInbox])

  const value = useMemo(() => (base ? { ...base, inboxCount, refreshInbox } : null), [base, inboxCount, refreshInbox])

  if (error) throw error
  if (!value) return <>{fallback}</>
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession must be used inside <SessionProvider>')
  return s
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
