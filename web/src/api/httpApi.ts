import { NotFoundError, UnauthorizedError, type LedgerApi } from './client'
import type { ExploreParams, ID, ProfileEdit, PublicPost, PostThread, WriteupFields, WriteupStatus } from './types'

export interface HttpApiOptions {
  /** e.g. '/api/v1' */
  base: string
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

const notAvailable = () => {
  throw new Error('Not available yet')
}

/**
 * Implements the version-1 slice of LedgerApi over the Rails backend. Every
 * other method (the team workspace, drafts, cases, projects, public Q&A…)
 * throws rather than falling back to the mock — nothing from fixtures.ts is
 * reachable from a live build.
 */
export function createHttpApi({ base }: HttpApiOptions): LedgerApi {
  const get = <T,>(path: string) => request<T>(base, path)
  const post = <T,>(path: string, body?: unknown) =>
    request<T>(base, path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
  const patch = <T,>(path: string, body?: unknown) =>
    request<T>(base, path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) })
  const del = <T,>(path: string) => request<T>(base, path, { method: 'DELETE' })

  const v1 = {
    me: () => get('/me'),
    updateMe: (profileEdit: ProfileEdit) => patch('/me', profileEdit),

    explore: (params: ExploreParams) => get(`/explore${query({ query: params.query, type: params.type, tag: params.tag })}`),

    getProfile: (handle: string) => get(`/users/${encodeURIComponent(handle)}`),
    getPost: (handle: string, slug: string) => get(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}`),
    getThread: (handle: string, slug: string) => get(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}/thread`),
    toggleHit: (handle: string, slug: string) => post(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}/hit`),
    getTopic: (tag: string) => get(`/topics/${encodeURIComponent(tag)}`),

    askPublic: (handle: string, slug: string, body: string) =>
      post<PostThread>(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}/questions`, { body }),
    answerPublic: (handle: string, slug: string, questionId: ID, body: string) =>
      post<PostThread>(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}/questions/${questionId}/answer`, { body }),
    dismissPublic: (handle: string, slug: string, questionId: ID) =>
      post<PostThread>(`/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}/questions/${questionId}/dismiss`),
    foldPublic: (handle: string, slug: string, questionId: ID, edits?: { question: string; answer: string }) =>
      post<{ thread: PostThread; post: PublicPost }>(
        `/users/${encodeURIComponent(handle)}/posts/${encodeURIComponent(slug)}/questions/${questionId}/fold`,
        edits,
      ),
    myQuestions: () => get('/me/questions'),

    listWriteups: () => get('/writeups'),
    createWriteup: (type: string) => post('/writeups', { type }),
    getWriteup: (id: ID) => get(`/writeups/${id}`),
    saveWriteup: (id: ID, fields: Partial<WriteupFields>) => patch(`/writeups/${id}`, fields),
    addWriteupEvidence: (id: ID, url: string) => post(`/writeups/${id}/evidence`, { url }),
    removeWriteupEvidence: (id: ID, key: string) => del(`/writeups/${id}/evidence/${encodeURIComponent(key)}`),
    setWriteupStatus: (id: ID, status: WriteupStatus) => patch(`/writeups/${id}/status`, { status }),
    publishWriteupToProfile: (id: ID, summary?: string) => post<PublicPost>(`/writeups/${id}/publish`, summary ? { summary } : undefined),
  }

  return new Proxy(v1 as unknown as LedgerApi, {
    get(target, prop: string | symbol, receiver) {
      if (typeof prop === 'string' && !(prop in target)) return notAvailable
      return Reflect.get(target, prop, receiver)
    },
  })
}
