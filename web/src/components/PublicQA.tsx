import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { ID, PostThread, PublicPost, PublicQuestion, User } from '../api/types'
import { signInWithGithub } from '../app/githubAuth'
import { useMe } from '../app/session'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Markdown } from './Inline'
import { MarkdownField } from './MarkdownField'
import { FieldError } from './States'
import { relativeTime } from '../lib/format'
import { useMutation } from '../lib/useAsync'

const QUESTION_MAX_LENGTH = 600

interface Props {
  handle: string
  slug: string
  author: User
  isAuthor: boolean
  thread: PostThread
  onThread: (t: PostThread) => void
  onPost: (p: PublicPost) => void
}

/** "I hit this too": a count of engineers who ran into the same problem. */
export function HitButton({ handle, slug, isAuthor, thread, onThread }: Omit<Props, 'author' | 'onPost'>) {
  const api = useApi()
  const me = useMe()
  const location = useLocation()
  const toggle = useMutation(() => api.toggleHit(handle, slug))
  const n = thread.hitCount
  const label = `${n} engineer${n === 1 ? '' : 's'} hit this`
  if (isAuthor) {
    return (
      <span className="hit hit--static" title="Engineers who said they hit the same problem">
        <Icon name="check" size={14} strokeWidth={2.5} />
        {label}
      </span>
    )
  }
  if (!me) {
    return (
      <button type="button" className="hit" onClick={() => signInWithGithub(location.pathname + location.search)}>
        <Icon name="plus" size={14} strokeWidth={2.5} />
        <span>I hit this too</span>
        <span className="hit__count" aria-label={label}>
          {n}
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`hit${thread.hitByMe ? ' hit--on' : ''}`}
      aria-pressed={thread.hitByMe}
      disabled={toggle.pending}
      onClick={async () => {
        const next = await toggle.run()
        if (next) onThread(next)
      }}
    >
      <Icon name={thread.hitByMe ? 'check' : 'plus'} size={14} strokeWidth={2.5} />
      <span>{thread.hitByMe ? 'You hit this too' : 'I hit this too'}</span>
      <span className="hit__count" aria-label={label}>
        {n}
      </span>
    </button>
  )
}

/** Ask-the-author on a public post. Only answered questions are public; the author sees and handles the rest. */
export function PublicQA({ handle, slug, author, isAuthor, thread, onThread, onPost }: Props) {
  const api = useApi()
  const me = useMe()
  const location = useLocation()
  const [body, setBody] = useState('')
  const ask = useMutation((text: string) => api.askPublic(handle, slug, text))
  const askers = new Map(thread.askers.map((u) => [u.id, u]))
  const answered = thread.questions.filter((q) => q.status === 'answered')
  const pending = thread.questions.filter((q) => q.status === 'pending')
  const first = author.name.split(' ')[0]
  const askInputRef = useRef<HTMLTextAreaElement>(null)

  // Signed-in state can only change via a full page navigation (the GitHub
  // round trip), so this only ever runs once, right after landing back here.
  useEffect(() => {
    if (me && !isAuthor && location.hash === '#ask') askInputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goSignIn = () => signInWithGithub(`${location.pathname}${location.search}#ask`)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!me) return goSignIn()
    const next = await ask.run(body)
    if (next) {
      onThread(next)
      setBody('')
    }
  }

  return (
    <section id="ask-the-author" className="pqa" aria-labelledby="pqa-title">
      <div className="row gap-10 wrap">
        <h2 id="pqa-title" className="post-section__label">
          Ask the author
        </h2>
        {answered.length > 0 && (
          <span className="small muted">
            {answered.length} answered question{answered.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isAuthor && pending.length > 0 && (
        <div className="pqa__inbox">
          <span className="eyebrow eyebrow--amber">
            Waiting for you · {pending.length}
          </span>
          <p className="small muted">Only you see these. Answered questions appear on your post; dismissed ones stay hidden.</p>
          <ol className="pqa__list">
            {pending.map((q) => (
              <PendingForAuthor key={q.id} q={q} asker={askers.get(q.askerId)} handle={handle} slug={slug} onThread={onThread} />
            ))}
          </ol>
        </div>
      )}

      {answered.length === 0 && !(isAuthor && pending.length) && (
        <p className="small muted">No questions yet. Anything unclear about how this was found or fixed? Ask {first}.</p>
      )}

      <ol className="pqa__list">
        {answered.map((q) => (
          <AnsweredQuestion
            key={q.id}
            q={q}
            asker={askers.get(q.askerId)}
            author={author}
            isAuthor={isAuthor}
            handle={handle}
            slug={slug}
            onThread={onThread}
            onPost={onPost}
          />
        ))}
      </ol>

      {thread.mine.length > 0 && (
        <div className="pqa__mine">
          {thread.mine.map((q) => (
            <p key={q.id} className="small">
              <span className="text-amber">Sent to {first} · waiting for an answer.</span> <span className="muted">“{q.body}”</span>
            </p>
          ))}
        </div>
      )}

      {!isAuthor && (
        <form className="stack gap-8" onSubmit={submit}>
          <MarkdownField
            id="pqa-ask"
            ref={askInputRef}
            label={`Ask ${first} a question`}
            placeholder={`Ask ${first} a question…`}
            value={body}
            maxLength={QUESTION_MAX_LENGTH}
            onChange={(v) => {
              setBody(v)
              ask.clearError()
            }}
            onFocus={() => {
              if (!me) goSignIn()
            }}
            onSubmit={() => submit()}
          />
          <FieldError message={ask.error} />
          <div className="row gap-8 wrap">
            <button type="submit" className="btn btn--ask" disabled={Boolean(me) && (!body.trim() || ask.pending)}>
              Ask
            </button>
            <p className="small muted">{me ? `Questions appear here once ${first} answers. Signed in with GitHub.` : 'Sign in with GitHub to ask.'}</p>
          </div>
        </form>
      )}
    </section>
  )
}

function AnsweredQuestion({
  q,
  asker,
  author,
  isAuthor,
  handle,
  slug,
  onThread,
  onPost,
}: {
  q: PublicQuestion
  asker?: User
  author: User
  isAuthor: boolean
  handle: string
  slug: string
  onThread: (t: PostThread) => void
  onPost: (p: PublicPost) => void
}) {
  const api = useApi()
  const [editing, setEditing] = useState(false)
  const [question, setQuestion] = useState(q.body)
  const [answerText, setAnswerText] = useState(q.answer?.body ?? '')
  const fold = useMutation((edits?: { question: string; answer: string }) => api.foldPublic(handle, slug, q.id, edits))

  const cancel = () => {
    setEditing(false)
    setQuestion(q.body)
    setAnswerText(q.answer?.body ?? '')
  }

  const submitFold = async (e?: FormEvent) => {
    e?.preventDefault()
    const res = await fold.run({ question: question.trim(), answer: answerText.trim() })
    if (res) {
      onThread(res.thread)
      onPost(res.post)
      setEditing(false)
    }
  }

  return (
    <li id={`q-${q.id}`} className="qa__thread">
      <div className="qa__msg">
        {asker ? <Avatar user={asker} size="sm" /> : <span className="avatar avatar--sm" />}
        <div className="stack gap-4">
          <span className="qa__who">
            {asker?.name ?? 'An engineer'} <span className="qa__meta">{relativeTime(q.at)}</span>
          </span>
          <div className="qa__q">
            <Markdown text={q.body} paragraphClass="" />
          </div>
        </div>
      </div>
      {q.answer && (
        <div className="qa__answer">
          <div className="row gap-10 wrap">
            <Avatar user={author} size="xs" />
            <span className="qa__who">
              {author.name} <span className="qa__meta">author · {relativeTime(q.answer.at)}</span>
            </span>
            <span className="push-right">
              {q.folded ? (
                <span className="folded">
                  <Icon name="check" size={12} strokeWidth={2.5} />
                  added to the post
                </span>
              ) : (
                isAuthor &&
                !editing && (
                  <button type="button" className="btn btn--sm" title="Adds this answer to the post under Follow-ups" onClick={() => setEditing(true)}>
                    Add to post
                  </button>
                )
              )}
            </span>
          </div>
          <div className="qa__a">
            <Markdown text={q.answer.body} paragraphClass="" />
          </div>
          {isAuthor && editing && !q.folded && (
            <form className="fold-editor stack gap-10" onSubmit={submitFold}>
              <MarkdownField id={`fold-q-${q.id}`} label="Question" value={question} onChange={setQuestion} onSubmit={() => submitFold()} />
              <MarkdownField id={`fold-a-${q.id}`} label="Answer" value={answerText} onChange={setAnswerText} onSubmit={() => submitFold()} />
              <FieldError message={fold.error} />
              <div className="row gap-8">
                <button type="submit" className="btn btn--primary btn--sm" disabled={!question.trim() || !answerText.trim() || fold.pending}>
                  Add to post
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </li>
  )
}

function PendingForAuthor({
  q,
  asker,
  handle,
  slug,
  onThread,
}: {
  q: PublicQuestion
  asker?: User
  handle: string
  slug: string
  onThread: (t: PostThread) => void
}) {
  const api = useApi()
  const [reply, setReply] = useState('')
  const answer = useMutation((text: string) => api.answerPublic(handle, slug, q.id, text))
  const dismiss = useMutation((id: ID) => api.dismissPublic(handle, slug, id))
  const replyId = `pqa-reply-${q.id}`

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const next = await answer.run(reply)
    if (next) onThread(next)
  }

  return (
    <li id={`q-${q.id}`} className="qa__thread">
      <div className="qa__msg">
        {asker ? <Avatar user={asker} size="sm" /> : <span className="avatar avatar--sm" />}
        <div className="stack gap-4">
          <span className="qa__who">
            {asker?.name ?? 'An engineer'} <span className="qa__meta">{relativeTime(q.at)}</span>
          </span>
          <div className="qa__q">
            <Markdown text={q.body} paragraphClass="" />
          </div>
        </div>
      </div>
      <form className="qa__answer stack gap-8" onSubmit={submit}>
        <MarkdownField id={replyId} label="Your answer" value={reply} onChange={setReply} onSubmit={() => submit()} placeholder="Answer publicly…" />
        <FieldError message={answer.error ?? dismiss.error} />
        <div className="row gap-8">
          <button type="submit" className="btn btn--sm" disabled={!reply.trim() || answer.pending}>
            Answer publicly
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={dismiss.pending}
            onClick={async () => {
              const next = await dismiss.run(q.id)
              if (next) onThread(next)
            }}
          >
            Dismiss
          </button>
        </div>
      </form>
    </li>
  )
}
