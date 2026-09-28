import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

export interface QueryState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  reload: () => void
  /** Replace the data locally, e.g. with the result of a mutation. */
  setData: (value: T) => void
}

/** Load async data and keep it in state; re-runs when deps change. */
export function useQuery<T>(load: () => Promise<T>, deps: DependencyList): QueryState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(undefined)
    loadRef
      .current()
      .then((value) => live && setData(value))
      .catch((e: unknown) => live && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload, setData }
}

export interface MutationState<A extends unknown[], R> {
  run: (...args: A) => Promise<R | undefined>
  pending: boolean
  error: string | undefined
  clearError: () => void
}

/** Wrap an async action with pending and error state. Errors are captured, not thrown. */
export function useMutation<A extends unknown[], R>(action: (...args: A) => Promise<R>): MutationState<A, R> {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const actionRef = useRef(action)
  useEffect(() => {
    actionRef.current = action
  })

  const run = useCallback(async (...args: A) => {
    setPending(true)
    setError(undefined)
    try {
      return await actionRef.current(...args)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      setPending(false)
    }
  }, [])

  return { run, pending, error, clearError: useCallback(() => setError(undefined), []) }
}
