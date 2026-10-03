import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LedgerApi } from '../api/client'
import type { DraftRequest, ExploreResult, Profile, PostThread, PublicPost, User, VerifiedEvidenceItem, Writeup } from '../api/types'

// `isLive`/`features` are read from `import.meta.env.VITE_API` once at
// import time, so each test stubs the env, resets the module cache, and
// dynamically imports everything fresh — a static top-of-file import would
// already have run (with the old env, and as a different module instance)
// before the stub took effect.
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  localStorage.clear()
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
    expect(screen.getByText('Incidents, investigations, decisions and designs, each linked to the PRs, issues and docs behind it.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
  })

  it('shows no workspace nav or links, signed in', async () => {
    await renderLive('#/', () => ({ me: () => Promise.resolve(me), explore: () => Promise.resolve(emptyExplore) }))

    expect(await screen.findByRole('link', { name: 'My profile' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Write' })).toHaveAttribute('href', '/new')
    expect(screen.queryByText('Open workspace')).not.toBeInTheDocument()
    // The subtitle shows for everyone now; only the "How it works" panel is signed-out-only.
    expect(screen.getByText('Incidents, investigations, decisions and designs, each linked to the PRs, issues and docs behind it.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument()
  })

  it('/inbox shows Not found', async () => {
    await renderLive('#/inbox', (client) => ({ me: () => Promise.reject(new client.UnauthorizedError()) }))

    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Explore' })).toHaveAttribute('href', '/')
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
    expect(window.location.pathname).toBe('/')
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
    expect(badge).toHaveAttribute('href', '/me/questions')
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
    expect(row).toHaveAttribute('href', `/u/${me.handle}/${post.slug}#q-q1`)
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
    const mine = { ...post, authorId: me.id, writeupId: 'w1', revisions: [{ id: 'rev1', createdAt: '2026-01-05T00:00:00Z', summary: 'Clarified the fix' }] }
    await renderLive(`#/u/${me.handle}/${post.slug}`, () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post: mine, author: me }),
      getProfile: () => Promise.resolve(profile(me)),
      getThread: () => Promise.resolve(thread),
    }))

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(post.title)
    expect(screen.getByRole('link', { name: /Edit post/ })).toHaveAttribute('href', '/write/w1')
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

describe('the post page rail', () => {
  it('always shows the author card, even with no verified evidence and no other posts', async () => {
    const authorWithProfile: User = { ...author, headline: 'Staff engineer · payments', stack: ['go', 'postgres', 'kafka', 'terraform', 'redis', 'envoy', 'grpc'] }
    await renderLive(`#/u/${author.handle}/${post.slug}`, () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post: { ...post, evidence: [], badges: [] }, author: authorWithProfile }),
      getProfile: () => Promise.resolve(profile(authorWithProfile)),
      getThread: () => Promise.resolve(thread),
    }))

    const rail = await screen.findByRole('complementary', { name: 'Author, evidence and more records' })
    expect(within(rail).getByRole('heading', { name: 'Hannah L.' })).toBeInTheDocument()
    expect(within(rail).getByText('@hannahl')).toBeInTheDocument()
    expect(within(rail).getByText('Staff engineer · payments')).toBeInTheDocument()
    // Capped at 6 chips even though the author has 7 stack tags.
    expect(within(rail).getAllByText(/^(go|postgres|kafka|terraform|redis|envoy|grpc)$/)).toHaveLength(6)
    expect(within(rail).getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/u/hannahl')

    expect(within(rail).queryByRole('heading', { name: 'Evidence' })).not.toBeInTheDocument()
    expect(within(rail).queryByRole('heading', { name: /More from/ })).not.toBeInTheDocument()
  })

  it('lists unverified evidence in the flat list', async () => {
    const evidence: PublicPost['evidence'] = [{ label: 'GitHub PR #11', verified: false, url: 'https://github.com/acme/checkout/pull/11' }]
    await renderLive(`#/u/${author.handle}/${post.slug}`, () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post: { ...post, evidence, verifiedEvidence: [] }, author }),
      getProfile: () => Promise.resolve(profile(author)),
      getThread: () => Promise.resolve(thread),
    }))

    const evidenceSection = await screen.findByRole('heading', { name: 'Evidence' })
    const rail = within(evidenceSection.closest('section')!)
    expect(rail.getByText('GitHub PR #11')).toBeInTheDocument()
    expect(rail.getByText('not verified')).toBeInTheDocument()
    expect(rail.getByText('Each piece of evidence is checked with GitHub when the record is published.')).toBeInTheDocument()
    expect(rail.getByRole('link', { name: /GitHub PR #11/ })).toHaveAttribute('href', 'https://github.com/acme/checkout/pull/11')
  })

  it('groups verified evidence by badge type, with a count, public links, and locked private rows', async () => {
    const verifiedEvidence: VerifiedEvidenceItem[] = [
      { kind: 'github_pr', badgeType: 'authored_merged', number: 9, title: 'Revert pool size', repo: 'acme/checkout', url: 'https://github.com/acme/checkout/pull/9', date: '2026-09-15T12:00:00Z' },
      { kind: 'github_pr', badgeType: 'authored_merged', private: true, date: '2026-08-15T12:00:00Z' },
      { kind: 'github_issue', badgeType: 'participated', number: 4, title: 'Flaky test', repo: 'acme/checkout', url: 'https://github.com/acme/checkout/issues/4', date: '2026-07-15T12:00:00Z' },
    ]
    await renderLive(`#/u/${author.handle}/${post.slug}`, () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post: { ...post, evidence: [], verifiedEvidence }, author }),
      getProfile: () => Promise.resolve(profile(author)),
      getThread: () => Promise.resolve(thread),
    }))

    const evidenceSection = await screen.findByRole('heading', { name: 'Evidence' })
    const rail = within(evidenceSection.closest('section')!)

    expect(rail.getByText('Authored & merged')).toBeInTheDocument()
    expect(rail.getByText('· 2 PRs')).toBeInTheDocument()
    expect(rail.getByText('Took part in')).toBeInTheDocument()
    expect(rail.getByText('· 1 issue')).toBeInTheDocument()

    const publicRow = rail.getByRole('link', { name: '#9 Revert pool size' })
    expect(publicRow).toHaveAttribute('href', 'https://github.com/acme/checkout/pull/9')
    expect(rail.getByText('acme/checkout · Sep 2026')).toBeInTheDocument()

    expect(rail.getByText('Private PR')).toBeInTheDocument()
    expect(rail.getByText('private GitHub project · Aug 2026')).toBeInTheDocument()
    expect(rail.queryByRole('link', { name: /Private PR/ })).not.toBeInTheDocument()

    expect(rail.getByRole('link', { name: '#4 Flaky test' })).toHaveAttribute('href', 'https://github.com/acme/checkout/issues/4')
  })

  it('shows 3 rows and a "+N more" toggle for a group of more than 5', async () => {
    const verifiedEvidence: VerifiedEvidenceItem[] = Array.from({ length: 7 }, (_, i) => ({
      kind: 'github_pr' as const,
      badgeType: 'authored_merged' as const,
      number: i + 1,
      title: `PR ${i + 1}`,
      repo: 'acme/checkout',
      url: `https://github.com/acme/checkout/pull/${i + 1}`,
      date: '2026-09-15T12:00:00Z',
    }))
    const user = await renderLive(`#/u/${author.handle}/${post.slug}`, () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post: { ...post, evidence: [], verifiedEvidence }, author }),
      getProfile: () => Promise.resolve(profile(author)),
      getThread: () => Promise.resolve(thread),
    }))

    const evidenceSection = await screen.findByRole('heading', { name: 'Evidence' })
    const rail = within(evidenceSection.closest('section')!)

    expect(rail.getByText('#1 PR 1')).toBeInTheDocument()
    expect(rail.getByText('#3 PR 3')).toBeInTheDocument()
    expect(rail.queryByText('#4 PR 4')).not.toBeInTheDocument()
    const toggle = rail.getByRole('button', { name: '+4 more' })

    await user.click(toggle)

    expect(rail.getByText('#4 PR 4')).toBeInTheDocument()
    expect(rail.getByText('#7 PR 7')).toBeInTheDocument()
    expect(rail.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('lists section headings under "On this page", including Follow-ups and Ask the author', async () => {
    const twoSections: PublicPost = {
      ...post,
      sections: [
        { heading: 'Problem', kind: 'text', body: 'It multiplied.' },
        { heading: 'Root cause', kind: 'text', body: 'A retry storm.' },
      ],
      followUps: [{ answer: 'Yes, exactly that.' }],
    }
    await renderLive(`#/u/${author.handle}/${post.slug}`, () => ({
      me: () => Promise.resolve(me),
      getPost: () => Promise.resolve({ post: twoSections, author }),
      getProfile: () => Promise.resolve(profile(author)),
      getThread: () => Promise.resolve(thread),
    }))

    const nav = await screen.findByRole('heading', { name: 'On this page' })
    const onThisPage = within(nav.closest('nav')!)
    const path = `/u/${author.handle}/${post.slug}`
    expect(onThisPage.getByRole('link', { name: 'Problem' })).toHaveAttribute('href', `${path}#problem`)
    expect(onThisPage.getByRole('link', { name: 'Root cause' })).toHaveAttribute('href', `${path}#root-cause`)
    expect(onThisPage.getByRole('link', { name: 'Follow-ups' })).toHaveAttribute('href', `${path}#follow-ups`)
    expect(onThisPage.getByRole('link', { name: 'Ask the author' })).toHaveAttribute('href', `${path}#ask-the-author`)

    // The anchors it points to actually exist on the page.
    expect(document.getElementById('problem')).toBeInTheDocument()
    expect(document.getElementById('root-cause')).toBeInTheDocument()
    expect(document.getElementById('follow-ups')).toBeInTheDocument()
    expect(document.getElementById('ask-the-author')).toBeInTheDocument()
  })
})

describe('"Start from a PR or issue"', () => {
  function baseWriteup(overrides: Partial<Writeup> = {}): Writeup {
    return {
      id: 'w9', type: 'incident', status: 'draft', title: '', context: '', symptom: '', constraints: [],
      rootCause: '', flow: [], ruledOut: [], fix: '', lesson: '', signals: [], evidence: [],
      authorId: me.id, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      ...overrides,
    }
  }

  it('drafts straight to the editor on an immediate ready result', async () => {
    const drafted = baseWriteup({ id: 'w10', title: 'Fixed the pool' })
    const user = await renderLive('#/new', () => ({
      me: () => Promise.resolve(me),
      startDraftFromSource: () => Promise.resolve<DraftRequest>({ draftId: 'd1', status: 'ready', writeupId: 'w10' }),
      getWriteup: () => Promise.resolve(drafted),
    }))

    await user.type(await screen.findByPlaceholderText('https://github.com/owner/repo/pull/123'), 'https://github.com/acme/checkout/pull/14')
    await user.click(screen.getByRole('button', { name: 'Draft it' }))

    expect(await screen.findByDisplayValue('Fixed the pool')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/write/w10')
  })

  it('shows the loading card, then polls through to the editor once ready', async () => {
    const drafted = baseWriteup({ id: 'w11', title: 'Reverted the config change' })
    const user = await renderLive('#/new', () => ({
      me: () => Promise.resolve(me),
      startDraftFromSource: () => Promise.resolve<DraftRequest>({ draftId: 'd2', status: 'drafting', writeupId: 'w11' }),
      getDraftRequest: () => Promise.resolve<DraftRequest>({ draftId: 'd2', status: 'ready', writeupId: 'w11' }),
      getWriteup: () => Promise.resolve(drafted),
    }))

    await user.type(await screen.findByPlaceholderText('https://github.com/owner/repo/pull/123'), 'https://github.com/acme/checkout/pull/15')
    await user.click(screen.getByRole('button', { name: 'Draft it' }))

    expect(await screen.findByText('Reading the PR and its discussion…')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Reverted the config change', undefined, { timeout: 4000 })).toBeInTheDocument()
  }, 10_000)

  it('shows the private-source consent dialog, then proceeds after accepting', async () => {
    let accepted = false
    const user = await renderLive('#/new', (client) => ({
      me: () => Promise.resolve(me),
      startDraftFromSource: () =>
        accepted
          ? Promise.resolve<DraftRequest>({ draftId: 'd3', status: 'drafting', writeupId: 'w12' })
          : Promise.reject(new client.DraftBlockedError({ code: 'consent_required' })),
      acceptPrivateDraftingConsent: () => {
        accepted = true
        return Promise.resolve()
      },
      getDraftRequest: () => Promise.resolve<DraftRequest>({ draftId: 'd3', status: 'ready', writeupId: 'w12' }),
      getWriteup: () => Promise.resolve(baseWriteup({ id: 'w12' })),
    }))

    await user.type(await screen.findByPlaceholderText('https://github.com/owner/repo/pull/123'), 'https://github.com/acme/secret/pull/1')
    await user.click(screen.getByRole('button', { name: 'Draft it' }))

    expect(await screen.findByText(/Send this to Anthropic/)).toBeInTheDocument()
    expect(screen.getByText(/never code/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(window.location.pathname).toBe('/write/w12'), { timeout: 4000 })
  }, 10_000)

  it('asks for a template on needs_template, with no writeup created, and drafts once one is picked', async () => {
    const started: Array<{ url: string; template?: string }> = []
    const user = await renderLive('#/new', (client) => ({
      me: () => Promise.resolve(me),
      startDraftFromSource: (url, template) => {
        started.push({ url, template })
        if (!template) return Promise.reject(new client.DraftBlockedError({ code: 'needs_template', note: 'Not enough in the source to draft from — pick a template' }))
        return Promise.resolve<DraftRequest>({ draftId: 'd4', status: 'ready', writeupId: 'w13' })
      },
      getWriteup: () => Promise.resolve(baseWriteup({ id: 'w13', type: 'decision' })),
    }))

    await user.type(await screen.findByPlaceholderText('https://github.com/owner/repo/pull/123'), 'https://github.com/acme/checkout/issues/3')
    await user.click(screen.getByRole('button', { name: 'Draft it' }))

    expect(await screen.findByText(/pick a template/i)).toBeInTheDocument()
    expect(screen.getAllByText('Draft it').length).toBeGreaterThan(1)

    await user.click(screen.getByRole('button', { name: /Architecture decision/ }))

    await waitFor(() => expect(window.location.pathname).toBe('/write/w13'))
    expect(started).toEqual([
      { url: 'https://github.com/acme/checkout/issues/3', template: undefined },
      { url: 'https://github.com/acme/checkout/issues/3', template: 'decision' },
    ])
  })

  it('shows an inline message on the daily cap, and the template cards still work', async () => {
    const user = await renderLive('#/new', (client) => ({
      me: () => Promise.resolve(me),
      startDraftFromSource: () => Promise.reject(new client.DraftBlockedError({ error: "You've hit today's drafting limit.", resetAt: '2026-10-02T00:00:00Z' })),
      createWriteup: () => Promise.resolve(baseWriteup({ id: 'w14', type: 'incident' })),
    }))

    await user.type(await screen.findByPlaceholderText('https://github.com/owner/repo/pull/123'), 'https://github.com/acme/checkout/pull/16')
    await user.click(screen.getByRole('button', { name: 'Draft it' }))

    expect(await screen.findByText("You've hit today's drafting limit.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Start incident/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/write/w14'))
  })

  it('shows a neutral app-not-installed callout, Install primary and Draft it secondary, clearing on edit', async () => {
    const user = await renderLive('#/new', (client) => ({
      me: () => Promise.resolve(me),
      startDraftFromSource: () =>
        Promise.reject(
          new client.DraftBlockedError({
            error: "EngLog can't see this repo. Install the EngLog app on acme to verify private work.",
            failureCode: 'app_not_installed',
            installUrl: 'https://github.com/apps/englog-dev/installations/new?state=signed-state-abc',
          }),
        ),
    }))

    const input = await screen.findByPlaceholderText('https://github.com/owner/repo/pull/123')
    await user.type(input, 'https://github.com/acme/checkout/pull/20')
    await user.click(screen.getByRole('button', { name: 'Draft it' }))

    expect(await screen.findByText('EngLog needs access to acme/checkout')).toBeInTheDocument()
    expect(screen.getByText('Install the EngLog app on this repo. EngLog only uses PR and issue text — never your code.')).toBeInTheDocument()
    // The red error text is not shown for this gate — the callout replaces it.
    expect(screen.queryByText(/EngLog can't see this repo\. Install/)).not.toBeInTheDocument()

    const install = screen.getByRole('link', { name: 'Install the EngLog app' })
    expect(install).toHaveAttribute('href', 'https://github.com/apps/englog-dev/installations/new?state=signed-state-abc')
    expect(install).toHaveClass('btn--primary')
    const draftIt = screen.getByRole('button', { name: 'Draft it' })
    expect(draftIt).not.toHaveClass('btn--primary')

    // Editing the URL clears the callout without a page reload — re-find the
    // input since the "drafting" phase's loading state unmounted the form
    // (and the one captured above) while the request was in flight.
    const liveInput = screen.getByPlaceholderText('https://github.com/owner/repo/pull/123')
    await user.type(liveInput, '1')
    expect(screen.queryByText('EngLog needs access to acme/checkout')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft it' })).toHaveClass('btn--primary')
  })

  it('refills the URL from ?url= after returning from installing the app, drops the query params, and shows no callout', async () => {
    await renderLive('#/new?url=https%3A%2F%2Fgithub.com%2Facme%2Fcheckout%2Fpull%2F20&installed=1', () => ({
      me: () => Promise.resolve(me),
    }))

    expect(await screen.findByDisplayValue('https://github.com/acme/checkout/pull/20')).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe('/new'))
    expect(screen.queryByText(/EngLog needs access to/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft it' })).toHaveClass('btn--primary')
  })

  it("shows one drafted notice (private variant), source chips and a missing hint in the editor", async () => {
    const drafted = baseWriteup({
      id: 'w15', title: 'Reverted the pool change', symptom: 'The pool was halved.',
      draftedFrom: {
        sourceUrl: 'https://github.com/acme/secret/pull/14', private: true,
        sections: {
          symptom: { sources: ['PR #14'], long: true },
          rootCause: { sources: [], missing: 'The root cause is never explained.' },
          fix: { sources: [], voice: true },
        },
      },
    })
    const user = await renderLive('#/write/w15', () => ({ me: () => Promise.resolve(me), getWriteup: () => Promise.resolve(drafted) }))

    expect(await screen.findAllByText('PR #14')).toHaveLength(2) // the notice's link, and the symptom section's source chip
    const link = screen.getByRole('link', { name: 'PR #14' })
    expect(link).toHaveAttribute('href', 'https://github.com/acme/secret/pull/14')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('private repo')).toBeInTheDocument()
    expect(screen.getByText('Check every line, and look for internal names, customers and links before publishing.')).toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1) // exactly one notice, not two stacked banners
    expect(screen.getByText(/Not in the source: The root cause is never explained\./)).toBeInTheDocument()
    expect(screen.getByText('Consider shortening')).toBeInTheDocument()
    expect(screen.getByText('Check the wording')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('private repo')).not.toBeInTheDocument()
    expect(localStorage.getItem('ledger:dismissedDraftNotice:w15')).toBe('1')
  })

  it('shows the public-source notice text, with no lock/private wording', async () => {
    const drafted = baseWriteup({
      id: 'w16', draftedFrom: { sourceUrl: 'https://github.com/acme/checkout/issues/9', private: false, sections: {} },
    })
    await renderLive('#/write/w16', () => ({ me: () => Promise.resolve(me), getWriteup: () => Promise.resolve(drafted) }))

    expect(await screen.findByRole('link', { name: 'issue #9' })).toHaveAttribute('href', 'https://github.com/acme/checkout/issues/9')
    expect(screen.getByText('Check every line before publishing.')).toBeInTheDocument()
    expect(screen.queryByText('private repo')).not.toBeInTheDocument()
  })

  it('keeps a dismissed notice hidden after reloading the write-up', async () => {
    localStorage.setItem('ledger:dismissedDraftNotice:w17', '1')
    const drafted = baseWriteup({
      id: 'w17', title: 'Something drafted', draftedFrom: { sourceUrl: 'https://github.com/acme/checkout/pull/9', private: false, sections: {} },
    })
    await renderLive('#/write/w17', () => ({ me: () => Promise.resolve(me), getWriteup: () => Promise.resolve(drafted) }))

    await screen.findByDisplayValue('Something drafted')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('gates Publish on the private-source checkbox, only for a private-source draft', async () => {
    const complete = {
      title: 'Pool size incident', symptom: 'p99 spiked', rootCause: 'pool halved', fix: 'reverted',
      evidence: [{ key: 'S1', kind: 'github_pr' as const, title: 'PR', detail: '', status: 'fetched' as const, hops: 0, verified: true }],
    }
    const privateDraft = baseWriteup({ id: 'w18', ...complete, draftedFrom: { sourceUrl: 'https://github.com/acme/secret/pull/9', private: true, sections: {} } })
    const user = await renderLive('#/write/w18', () => ({ me: () => Promise.resolve(me), getWriteup: () => Promise.resolve(privateDraft) }))

    await screen.findByDisplayValue('Pool size incident')
    await user.click(screen.getByRole('tab', { name: /Publish/ }))

    const checkbox = screen.getByRole('checkbox', { name: 'I checked this draft for internal names, customers and links' })
    const publishBtn = screen.getByRole('button', { name: /Publish to your profile/ })
    expect(checkbox).not.toBeChecked()
    expect(publishBtn).toBeDisabled()

    await user.click(checkbox)
    expect(publishBtn).toBeEnabled()
  })

  it('does not show the private-source checkbox for a public-source draft', async () => {
    const publicDraft = baseWriteup({ id: 'w19', title: 'Public-source draft', draftedFrom: { sourceUrl: 'https://github.com/acme/checkout/pull/9', private: false, sections: {} } })
    await renderLive('#/write/w19', () => ({ me: () => Promise.resolve(me), getWriteup: () => Promise.resolve(publicDraft) }))
    await screen.findByDisplayValue('Public-source draft')
    expect(screen.queryByRole('checkbox', { name: /internal names/ })).not.toBeInTheDocument()
  })

  it('does not show the private-source checkbox for a hand-written (non-drafted) write-up', async () => {
    const handWritten = baseWriteup({ id: 'w21', title: 'Hand-written record' })
    await renderLive('#/write/w21', () => ({ me: () => Promise.resolve(me), getWriteup: () => Promise.resolve(handWritten) }))
    await screen.findByDisplayValue('Hand-written record')
    expect(screen.queryByRole('checkbox', { name: /internal names/ })).not.toBeInTheDocument()
  })
})

describe('deleting a draft', () => {
  function draftWriteup(overrides: Partial<Writeup> = {}): Writeup {
    return {
      id: 'w20', type: 'incident', status: 'draft', title: 'Checkout latency spike', context: '', symptom: '', constraints: [],
      rootCause: '', flow: [], ruledOut: [], fix: '', lesson: '', signals: [], evidence: [],
      authorId: me.id, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      ...overrides,
    }
  }

  it('asks for confirmation, then deletes and returns to the drafts list with a notice', async () => {
    let deleted = false
    const user = await renderLive('#/write/w20', () => ({
      me: () => Promise.resolve(me),
      getWriteup: () => Promise.resolve(draftWriteup()),
      deleteWriteup: () => {
        deleted = true
        return Promise.resolve()
      },
      listWriteups: () => Promise.resolve([]),
      getProfile: () => Promise.resolve(profile(me)),
    }))

    await screen.findByDisplayValue('Checkout latency spike')
    await user.click(screen.getByRole('button', { name: 'Delete draft' }))

    expect(screen.getByRole('alertdialog', { name: 'Delete this draft?' })).toBeInTheDocument()
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(window.location.pathname).toBe('/me/writeups'))
    expect(deleted).toBe(true)
    expect(await screen.findByText('Draft deleted.')).toBeInTheDocument()
  })

  it('cancels back to the editor without deleting', async () => {
    const user = await renderLive('#/write/w20', () => ({
      me: () => Promise.resolve(me),
      getWriteup: () => Promise.resolve(draftWriteup()),
    }))

    await screen.findByDisplayValue('Checkout latency spike')
    await user.click(screen.getByRole('button', { name: 'Delete draft' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/write/w20')
  })

  it("doesn't show a delete action for an already-published write-up", async () => {
    await renderLive('#/write/w20', () => ({
      me: () => Promise.resolve(me),
      getWriteup: () => Promise.resolve(draftWriteup({ postSlug: 'checkout-latency' })),
    }))

    await screen.findByDisplayValue('Checkout latency spike')
    expect(screen.queryByRole('button', { name: 'Delete draft' })).not.toBeInTheDocument()
  })

  it('shows the 422 "published" error inline, without leaving the editor', async () => {
    const user = await renderLive('#/write/w20', () => ({
      me: () => Promise.resolve(me),
      getWriteup: () => Promise.resolve(draftWriteup()),
      deleteWriteup: () => Promise.reject(new Error("Published records can't be deleted yet.")),
    }))

    await screen.findByDisplayValue('Checkout latency spike')
    await user.click(screen.getByRole('button', { name: 'Delete draft' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText("Published records can't be deleted yet.")).toBeInTheDocument()
    expect(window.location.pathname).toBe('/write/w20')
  })

  it('shows the 409 in-flight-drafting error inline', async () => {
    const user = await renderLive('#/write/w20', () => ({
      me: () => Promise.resolve(me),
      getWriteup: () => Promise.resolve(draftWriteup()),
      deleteWriteup: () => Promise.reject(new Error('Still drafting — wait for it to finish.')),
    }))

    await screen.findByDisplayValue('Checkout latency spike')
    await user.click(screen.getByRole('button', { name: 'Delete draft' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Still drafting — wait for it to finish.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/write/w20')
  })

  it('deletes a draft from the list, removing its row, and shows an inline error on failure for another', async () => {
    const drafts = [draftWriteup({ id: 'w21', title: 'Flaky checkout test' }), draftWriteup({ id: 'w22', title: 'Pool size decision' })]
    const user = await renderLive('#/me/writeups', () => ({
      me: () => Promise.resolve(me),
      listWriteups: () => Promise.resolve(drafts),
      getProfile: () => Promise.resolve(profile(me)),
      deleteWriteup: (id) => (id === 'w21' ? Promise.resolve() : Promise.reject(new Error('Still drafting — wait for it to finish.'))),
    }))

    await screen.findByText('Flaky checkout test')
    await user.click(screen.getByRole('button', { name: 'Delete Flaky checkout test' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('Flaky checkout test')).not.toBeInTheDocument())
    expect(screen.getByText('Pool size decision')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete Pool size decision' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Still drafting — wait for it to finish.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog', { name: 'Delete this draft?' })).toBeInTheDocument()
  })
})
