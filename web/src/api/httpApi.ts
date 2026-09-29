import { NotFoundError, UnauthorizedError, type LedgerApi } from './client'
import type { ExploreParams, ID, PublicPost, WriteupFields, WriteupStatus } from './types'

export interface HttpApiOptions {
  /** e.g. '/api/v1' */
  base: string
  /** Every LedgerApi method not implemented over HTTP yet falls back to this. */
  fallback: LedgerApi
}

async function request<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })

  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined)
    if (res.status === 401) throw new UnauthorizedError(message)
    if (res.status === 404) throw new NotFoundError(message ?? path)
    throw new Error(message ?? `Request to ${path} failed (${res.status}).`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Implements the version-1 slice of LedgerApi over the Rails backend; every
 * other method (the team workspace, drafts, cases, projects, public Q&A…)
 * delegates to `fallback` so those screens keep working against the mock.
 */
export function createHttpApi({ base, fallback }: HttpApiOptions): LedgerApi {
  const get = <T,>(path: string) => request<T>(base, path)
  const post = <T,>(path: string, body?: unknown) =>
    request<T>(base, path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
  const patch = <T,>(path: string, body?: unknown) =>
    request<T>(base, path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) })
  const del = <T,>(path: string) => request<T>(base, path, { method: 'DELETE' })

  return {
    ...fallback,

    me: () => get('/me'),

    explore: (params: ExploreParams) => get(`/explore${query({ query: params.query, type: params.type, tag: params.tag })}`),

    getProfile: (handle) => get(`/users/${encodeURIComponent(handle)}`),
    getPost: (handle, slug) => get(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}`),
    getThread: (handle, slug) => get(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}/thread`),
    toggleHit: (handle, slug) => post(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}/hit`),
    getTopic: (tag) => get(`/topics/${encodeURIComponent(tag)}`),

    listWriteups: () => get('/writeups'),
    createWriteup: (type) => post('/writeups', { type }),
    getWriteup: (id) => get(`/writeups/${id}`),
    saveWriteup: (id: ID, fields: Partial<WriteupFields>) => patch(`/writeups/${id}`, fields),
    addWriteupEvidence: (id, url) => post(`/writeups/${id}/evidence`, { url }),
    removeWriteupEvidence: (id, key) => del(`/writeups/${id}/evidence/${encodeURIComponent(key)}`),
    setWriteupStatus: (id, status: WriteupStatus) => patch(`/writeups/${id}/status`, { status }),
    publishWriteupToProfile: (id) => post<PublicPost>(`/writeups/${id}/publish`),
  }
}
