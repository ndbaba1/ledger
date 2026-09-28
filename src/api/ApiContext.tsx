import { createContext, useContext, type ReactNode } from 'react'
import type { LedgerApi } from './client'

const ApiContext = createContext<LedgerApi | null>(null)

export function ApiProvider({ api, children }: { api: LedgerApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export function useApi(): LedgerApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}
