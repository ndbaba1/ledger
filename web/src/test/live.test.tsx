import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LedgerApi } from '../api/client'
import type { ExploreResult, Profile, PostThread, PublicPost, User, Writeup } from '../api/types'

// `isLive`/`features` are read from `import.meta.env.VITE_API` once at
// import time, so each test stubs the env, resets the module cache, and
// dynamically imports everything fresh — a static top-of-file import would
// already have run (with the old env, and as a different module instance)
// before the stub took effect.
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

function stubApi(overrides: Partial<LedgerApi>): LedgerApi {
  return new Proxy({} as LedgerApi, {
    get(_target, prop) {
      if (typeof prop === 'string' && prop in overrides) return (overrides as Record<string, unknown>)[prop]
      return () => Promise.reject(new Error(`not stubbed in this test: ${String(prop)}`))
    },
  })
}

async function renderLive(
  hash: string,
  buildOverrides: (client: typeof import('../api/client')) => Partial<LedgerApi> = () => ({}),
) {
  vi.resetModules()
  vi.stubEnv('VITE_API', 'http')
  window.location.hash = hash
  const client = await import('../api/client')
  const { default: App } = await import('../App')
  const user = userEvent.setup()
  render(<App api={stubApi(buildOverrides(client))} />)
  return user
}

const me: User = { id: 'u1', name: 'Nnamdi', handle: 'engineernamzy', initials: 'NN', avatarHue: 220 }
const author: User = { id: 'u2', name: 'Hannah L.', handle: 'hannahl', initials: 'HL', avatarHue: 330 }
const post: PublicPost = {
  slug: 'retries-outage',
  authorId: author.id,
  type: 'incident',
  title: 'Retries turned a blip into an outage',
  tags: [],
  summary: 'Retries at every layer multiplied.',
  sections: [{ heading: 'Problem', kind: 'text', body: 'It multiplied.' }],
  badges: [],
  publishedAt: '2026-01-01T00:00:00Z',
  hitCount: 3,
}
const thread: PostThread = { questions: [], askers: [], mine: [], hitCount: 3, hitByMe: false }
const emptyExplore: ExploreResult = { items: [], tags: [], total: 0 }
const profile = (user: User): Profile => ({ user, posts: [post], projects: [], hitByViewer: [] })

describe('live mode', () => {
  it('shows no workspace nav or links, signed out', async () => {
    await renderLive('#/', (client) => ({
      me: () => Promise.reject(new client.UnauthorizedError()),
      explore: () => Promise.resolve(emptyExplore),
    }))

    expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
    expect(screen.queryByText('Open workspace')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Write' })).not.toBeInTheDocument()
    expect(screen.getByText('Engineering write-ups, each verified against the PRs that fixed it.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
  })

  it('shows no workspace nav or links, signed in', async () => {
    await renderLive('#/', () => ({ me: () => Promise.resolve(me), explore: () => Promise.resolve(emptyExplore) }))

    expect(await screen.findByRole('link', { name: 'My profile' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Write' })).toHaveAttribute('href', '#/new')
    expect(screen.queryByText('Open workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Engineering write-ups, each verified against the PRs that fixed it.')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument()
  })

  it('/inbox shows Not found', async () => {
    await renderLive('#/inbox', (client) => ({ me: () => Promise.reject(new client.UnauthorizedError()) }))

    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Explore' })).toHaveAttribute('href', '#/')
    expect(screen.queryByRole('heading', { name: 'Review inbox' })).not.toBeInTheDocument()
  })

  it('the profile has no Projects section', async () => {
    await renderLive('#/u/hannahl', () => ({
      me: () => Promise.resolve(me),
      getProfile: () => Promise.resolve(profile(author)),
    }))

    expect(await screen.findByRole('heading', { name: 'Hannah L.' })).toBeInTheDocument()
    expect(screen.queryByText('Projects')).not.toBeInTheDocument()
    expect(screen.queryByText('Add a project')).not.toBeInTheDocument()
    expect(screen.queryByText('Promote a team record')).not.toBeInTheDocument()
  })

  it('the post page has public Q&A and keeps "I hit this too"', async () => {
    await renderLive('#/u/hannahl/retries-outage', () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post, author }),
      getProfile: () => Promise.resolve(profile(author)),
      getThread: () => Promise.resolve(thread),
    }))

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(post.title)
    expect(screen.getByRole('heading', { name: 'Ask the author' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /I hit this too/ })).toBeInTheDocument()
  })

  it('explains why a piece of evidence did not verify', async () => {
    const writeup: Writeup = {
      id: 'w1',
      type: 'incident',
      status: 'draft',
      title: 'Checkout p99 latency spike',
      context: '',
      symptom: 'Slow',
      constraints: [],
      rootCause: 'Pool halved',
      flow: [],
      ruledOut: [],
      fix: 'Reverted',
      lesson: '',
      signals: [],
      evidence: [
        {
          key: 'S1',
          kind: 'github_pr',
          title: 'GitHub PR #9',
          detail: 'acme/checkout',
          status: 'fetched',
          url: 'https://github.com/acme/checkout/pull/9',
          hops: 0,
          authoredByMe: false,
          failureReason: "Authored by someone-else — you're signed in as ndbaba1.",
        },
      ],
      authorId: me.id,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await renderLive('#/write/w1', () => ({ me: () => Promise.resolve(me), getWriteup: () => Promise.resolve(writeup) }))

    expect(await screen.findByText("Authored by someone-else — you're signed in as ndbaba1.")).toBeInTheDocument()
  })

  it('"Write" goes to sign-in when signed out', async () => {
    const user = await renderLive('#/', (client) => ({
      me: () => Promise.reject(new client.UnauthorizedError()),
      explore: () => Promise.resolve(emptyExplore),
    }))

    // No separate "Write" link exists when signed out — signing in is the only action.
    expect(screen.queryByRole('link', { name: 'Write' })).not.toBeInTheDocument()
    const signIn = await screen.findByRole('button', { name: 'Sign in with GitHub' })
    await user.click(signIn)

    // Clicking it never navigated into the app (e.g. to /new) — it only ever
    // starts the GitHub sign-in round trip.
    expect(window.location.hash).toBe('#/')
  })
})

describe('living documents: questions, editing and revisions', () => {
  const asker: User = { id: 'u3', name: 'Priya K.', handle: 'priyak', initials: 'PK', avatarHue: 40 }
  const pendingQuestion = { id: 'q1', body: 'What version of Postgres?', at: '2026-09-20T00:00:00Z', asker, post: { slug: post.slug, title: post.title } }

  it('shows a count badge next to "My profile" when I have pending questions', async () => {
    await renderLive('#/', () => ({
      me: () => Promise.resolve(me),
      explore: () => Promise.resolve(emptyExplore),
      myQuestions: () => Promise.resolve([pendingQuestion]),
    }))

    const badge = await screen.findByRole('link', { name: /1 question.*waiting for an answer/ })
    expect(badge).toHaveAttribute('href', '#/me/questions')
  })

  it('shows no badge when nothing is waiting', async () => {
    await renderLive('#/', () => ({
      me: () => Promise.resolve(me),
      explore: () => Promise.resolve(emptyExplore),
      myQuestions: () => Promise.resolve([]),
    }))

    await screen.findByRole('link', { name: 'My profile' })
    expect(screen.queryByRole('link', { name: /waiting for an answer/ })).not.toBeInTheDocument()
  })

  it('/me/questions lists what is waiting, oldest first, and links to the question on the post', async () => {
    await renderLive('#/me/questions', () => ({
      me: () => Promise.resolve(me),
      myQuestions: () => Promise.resolve([pendingQuestion]),
    }))

    expect(await screen.findByRole('heading', { name: 'Questions' })).toBeInTheDocument()
    const row = await screen.findByRole('link', { name: 'What version of Postgres?' })
    expect(row).toHaveAttribute('href', `#/u/${me.handle}/${post.slug}#q-q1`)
    expect(screen.getByText('Priya K.')).toBeInTheDocument()
  })

  it('/me/questions shows an empty state when nothing is waiting', async () => {
    await renderLive('#/me/questions', () => ({
      me: () => Promise.resolve(me),
      myQuestions: () => Promise.resolve([]),
    }))

    expect(await screen.findByText('No questions waiting.')).toBeInTheDocument()
  })

  it('shows an "Edit post" link and the update byline once a post has been revised', async () => {
    const mine = { ...post, authorId: me.id, writeupId: 'w1', updatedAt: '2026-01-05T00:00:00Z', history: [{ at: '2026-01-05T00:00:00Z', summary: 'Clarified the fix' }] }
    await renderLive(`#/u/${me.handle}/${post.slug}`, () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post: mine, author: me }),
      getProfile: () => Promise.resolve(profile(me)),
      getThread: () => Promise.resolve(thread),
    }))

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(post.title)
    expect(screen.getByRole('link', { name: /Edit post/ })).toHaveAttribute('href', '#/write/w1')
    expect(screen.getByText(/updated/)).toBeInTheDocument()

    const history = screen.getByText(/History · 1 change/)
    expect(history).toBeInTheDocument()
    history.click()
    expect(screen.getByText('Clarified the fix')).toBeInTheDocument()
  })

  it('has no "Edit post" link or history on someone else’s post', async () => {
    await renderLive('#/u/hannahl/retries-outage', () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post, author }),
      getProfile: () => Promise.resolve(profile(author)),
      getThread: () => Promise.resolve(thread),
    }))

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: /Edit post/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/History ·/)).not.toBeInTheDocument()
  })
})
