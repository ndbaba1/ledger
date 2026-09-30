import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { createMockApi } from '../api/mockApi'

const newApi = () => createMockApi({ latencyMs: 0 })
const MINE = ['engineernamzy', 'read-only-postgres-login-delete'] as const
const HANNAH = ['hannahl', 'retries-turned-a-blip-into-an-outage'] as const
const TOMAS = ['tomasr', 'kafka-lag-only-on-mondays'] as const

describe('mock API: public Q&A', () => {
  it('shows readers only answered questions, and the author the pending ones too', async () => {
    const api = newApi()
    const asAuthor = await api.getThread(...MINE)
    expect(asAuthor.questions.map((q) => q.status)).toEqual(['answered', 'pending'])

    const asReader = await api.getThread(...HANNAH)
    expect(asReader.questions.every((q) => q.status === 'answered')).toBe(true)
  })

  it('keeps a reader’s new question private until the author answers', async () => {
    const api = newApi()
    const t = await api.askPublic(...TOMAS, 'Did you try G1 region size tuning first?')
    expect(t.questions).toHaveLength(0)
    expect(t.mine.map((q) => q.body)).toEqual(['Did you try G1 region size tuning first?'])
    await expect(api.askPublic(...MINE, 'Asking myself?')).rejects.toThrow(/own post/)
    await expect(api.askPublic(...TOMAS, '   ')).rejects.toThrow(/question first/)
  })

  it('lets the author answer, dismiss and fold answers into the post', async () => {
    const api = newApi()
    const answered = await api.answerPublic(...MINE, 'pq2', 'Yes — schema `USAGE` and `CREATE` via PUBLIC are both reported.')
    expect(answered.questions.find((q) => q.id === 'pq2')?.status).toBe('answered')

    const { post } = await api.foldPublic(...MINE, 'pq2')
    expect(post.followUps).toEqual([
      {
        question: 'Does agent-db-scan check privileges granted through `PUBLIC` on schemas, or only tables?',
        answer: 'Yes — schema `USAGE` and `CREATE` via PUBLIC are both reported.',
        askerId: 'u_mei',
      },
    ])
    expect(post.revisions?.[0].summary).toMatch(/^Added a follow-up:/)

    await expect(api.dismissPublic(...HANNAH, 'pq3')).rejects.toThrow(/Only the author/)
  })

  it('toggles “I hit this too” and refuses it on your own post', async () => {
    const api = newApi()
    const before = await api.getThread(...TOMAS)
    const on = await api.toggleHit(...TOMAS)
    expect(on).toMatchObject({ hitByMe: true, hitCount: before.hitCount + 1 })
    const off = await api.toggleHit(...TOMAS)
    expect(off).toMatchObject({ hitByMe: false, hitCount: before.hitCount })
    await expect(api.toggleHit(...MINE)).rejects.toThrow(/You wrote/)
  })
})

describe('mock API: my questions', () => {
  it('lists pending questions on my own posts, oldest first, with the post and asker', async () => {
    const api = newApi()
    const mine = await api.myQuestions()
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((q) => q.post && q.asker)).toBe(true)
    const ats = mine.map((q) => q.at)
    expect(ats).toEqual([...ats].sort())
  })
})

describe('mock API: topics', () => {
  it('lists a topic’s posts most-hit first with related topics', async () => {
    const t = await newApi().getTopic('postgres')
    const hits = t.items.map((i) => i.post.hitCount ?? 0)
    expect(hits).toEqual([...hits].sort((a, b) => b - a))
    expect(t.items.every((i) => i.post.tags.includes('postgres'))).toBe(true)
    expect(t.related.length).toBeGreaterThan(0)
    await expect(newApi().getTopic('cobol')).rejects.toThrow(/not found/)
  })
})

describe('community features in the app', () => {
  it('lets a reader mark a post and ask a question', async () => {
    window.location.hash = `#/u/${TOMAS.join('/')}`
    const user = userEvent.setup()
    render(<App api={newApi()} />)

    const hit = await screen.findByRole('button', { name: /I hit this too/ })
    expect(hit).toHaveAttribute('aria-pressed', 'false')
    await user.click(hit)
    expect(await screen.findByRole('button', { name: /You hit this too/ })).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByLabelText('Ask Tomás a question'), 'Which GC did you end on?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText(/Sent to Tomás · waiting for an answer/)).toBeInTheDocument()
  })

  it('lets the author answer a waiting question and add it to the post', async () => {
    window.location.hash = `#/u/${MINE.join('/')}`
    const user = userEvent.setup()
    render(<App api={newApi()} />)

    const qa = await screen.findByRole('region', { name: 'Ask the author' })
    expect(within(qa).getByText(/Waiting for you · 1/)).toBeInTheDocument()
    await user.type(within(qa).getByLabelText('Your answer'), 'Yes, schemas too.')
    await user.click(within(qa).getByRole('button', { name: 'Answer publicly' }))

    const add = await within(qa).findAllByRole('button', { name: 'Add to post' })
    await user.click(add[add.length - 1])
    const submitFold = await within(qa).findAllByRole('button', { name: 'Add to post' })
    await user.click(submitFold[submitFold.length - 1])
    const followUpsHeading = await screen.findByRole('heading', { name: 'Follow-ups' })
    const followUps = within(followUpsHeading.closest('section')!)
    expect(followUps.getByText(/Does agent-db-scan check privileges granted through/)).toBeInTheDocument()

    const history = screen.getByText(/History · 1 change/)
    history.click()
    expect(screen.getByText(/^Added a follow-up:/)).toBeInTheDocument()
  })

  it('lets the author edit the wording before folding, keeping the thread unchanged, and credits the asker', async () => {
    window.location.hash = `#/u/${MINE.join('/')}`
    const user = userEvent.setup()
    render(<App api={newApi()} />)

    const qa = await screen.findByRole('region', { name: 'Ask the author' })
    // pq1 is already answered in the seed data — asked by Hannah L.
    expect(within(qa).getByText('Does NOINHERIT break anything if the login still needs a group role for connection limits?')).toBeInTheDocument()

    await user.click(within(qa).getAllByRole('button', { name: 'Add to post' })[0])
    const question = within(qa).getByLabelText('Question')
    const answer = within(qa).getByLabelText('Answer')
    await user.clear(question)
    await user.type(question, 'Does NOINHERIT affect connection limits?')
    await user.clear(answer)
    await user.type(answer, 'No — connection limits are unaffected.')
    await user.click(within(qa).getByRole('button', { name: 'Add to post' }))

    // The thread still shows the original wording.
    expect(within(qa).getByText('Does NOINHERIT break anything if the login still needs a group role for connection limits?')).toBeInTheDocument()
    expect(within(qa).getByText(/Connection limits and/)).toBeInTheDocument()

    // Follow-ups shows the edited wording, credited to the asker.
    const followUpsHeading = await screen.findByRole('heading', { name: 'Follow-ups' })
    const followUps = within(followUpsHeading.closest('section')!)
    expect(followUps.getByText('Does NOINHERIT affect connection limits?')).toBeInTheDocument()
    expect(followUps.getByText('No — connection limits are unaffected.')).toBeInTheDocument()
    expect(followUps.queryByText(/group role for connection limits/)).not.toBeInTheDocument()
    const askedBy = followUps.getByRole('link', { name: 'Asked by Hannah L.' })
    expect(askedBy).toHaveAttribute('href', '#/u/hannahl')
  })

  it('shows no answered-question count on a post nobody has asked about yet', async () => {
    window.location.hash = `#/u/${TOMAS.join('/')}`
    render(<App api={newApi()} />)

    await screen.findByRole('heading', { name: 'Ask the author' })
    expect(screen.queryByText(/answered question/)).not.toBeInTheDocument()
  })

  it('focuses the ask box on returning from sign-in with #ask', async () => {
    window.location.hash = `#/u/${HANNAH.join('/')}#ask`
    render(<App api={newApi()} />)

    const input = await screen.findByPlaceholderText(/Ask .* a question/)
    expect(input).toHaveFocus()
  })

  it('shows a header badge for pending questions and links to /me/questions', async () => {
    window.location.hash = '#/'
    const user = userEvent.setup()
    render(<App api={newApi()} />)

    const badge = await screen.findByRole('link', { name: /questions? waiting for an answer/ })
    await user.click(badge)
    expect(await screen.findByRole('heading', { name: 'Questions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Waiting for you' })).toBeInTheDocument()
    expect(screen.getByText('· 1')).toBeInTheDocument()
  })

  it('opens a topic page from a post tag', async () => {
    window.location.hash = `#/u/${HANNAH.join('/')}`
    const user = userEvent.setup()
    render(<App api={newApi()} />)
    await user.click(await screen.findByRole('link', { name: '#retries' }))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('#retries')
    expect(screen.getByText(/\d+ records?/)).toBeInTheDocument()
  })
})
