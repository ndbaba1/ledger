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
    expect(post.followUps).toEqual(['Yes — schema `USAGE` and `CREATE` via PUBLIC are both reported.'])

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
    expect(await screen.findByRole('heading', { name: 'Follow-ups' })).toBeInTheDocument()
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
    expect(screen.getByText(/verified write-ups?/)).toBeInTheDocument()
  })
})
