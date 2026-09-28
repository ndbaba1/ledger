import { useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { ID, Question, TeamRecord, User } from '../api/types'
import { useSession, useUsers } from '../app/session'
import { Avatar, AvatarStack } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Inline } from '../components/Inline'
import { SourceList } from '../components/SourceList'
import { DraftedFrom } from '../components/SourceExcerpt'
import { ErrorState, FieldError, Loading } from '../components/States'
import { KindPill, PostContent } from '../components/PostContent'
import { sectionsFor } from '../lib/publicPost'
import { relativeTime, shortDate } from '../lib/format'
import { useMutation, useQuery } from '../lib/useAsync'

type Tab = 'record' | 'sources'

export function RecordScreen() {
  const { id = '' } = useParams()
  const api = useApi()
  const record = useQuery(() => api.getRecord(id), [api, id])

  if (record.error) return <ErrorState error={record.error} onRetry={record.reload} />
  if (!record.data || record.data.id !== id) return <Loading label="Loading record" />
  return <RecordView key={record.data.id} record={record.data} onChange={record.setData} />
}

function RecordView({ record, onChange }: { record: TeamRecord; onChange: (r: TeamRecord) => void }) {
  const { me, workspace } = useSession()
  const location = useLocation()
  const [tab, setTab] = useState<Tab>('record')
  const [showPublished, setShowPublished] = useState(Boolean((location.state as { justPublished?: boolean } | null)?.justPublished))
  const [copied, setCopied] = useState(false)
  const users = useUsers([
    ...record.authorIds,
    ...record.questions.flatMap((q) => [q.authorId, q.answer?.authorId ?? '']).filter(Boolean),
    ...record.history.map((h) => h.byId),
  ])
  const authors = record.authorIds.map((uid) => users.get(uid)).filter((u) => u !== undefined)
  const isAuthor = record.authorIds.includes(me.id)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="page page--split">
      <div className="row gap-12 wrap page-toolbar">
        <nav className="crumbs" aria-label="Breadcrumb">
          <span>{workspace.slug}</span>
          <span aria-hidden="true">/</span>
          <Link to="/records">records</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{record.id}</span>
        </nav>
        <span className="pill">
          <Icon name="lock" size={12} />
          Team only
        </span>
        <div className="row gap-8 push-right">
          <button type="button" className="btn btn--ghost" onClick={copyLink}>
            <Icon name={copied ? 'check' : 'link'} size={14} />
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {isAuthor && (
            <Link className="btn btn--strong" to={`/records/${record.id}/promote`}>
              <Icon name="arrowUpRight" size={14} />
              {record.promotedPostSlug ? 'Update public post' : 'Promote to public'}
            </Link>
          )}
        </div>
      </div>

      {showPublished && (
        <div className="banner banner--green" role="status">
          <Icon name="check" size={16} />
          <span>Published to {workspace.name}. Teammates can now find it in search and ask questions.</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setShowPublished(false)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      <div className="split split--record">
        <article className="split__main">
          <header className="stack gap-12">
            <div className="row gap-12 wrap">
              <KindPill type={record.type} />
              <span className="small muted strong">Team-visible</span>
              <span className="mono muted small">{record.tags.join(' · ')}</span>
            </div>
            <h1 className="doc-title doc-title--lg">{record.title}</h1>
            <div className="row gap-10 wrap small muted">
              <AvatarStack users={authors} size="sm" />
              <span>{authors.map((a) => a.name).join(', ')}</span>
              <span aria-hidden="true">·</span>
              <span>published {shortDate(record.publishedAt)}</span>
              {record.context && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{record.context}</span>
                </>
              )}
              {record.history.length > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>edited {record.history.length - 1}×</span>
                </>
              )}
              {record.promotedPostSlug && (
                <>
                  <span aria-hidden="true">·</span>
                  <Link to={`/u/${me.handle}/${record.promotedPostSlug}`} className="row gap-4">
                    <Icon name="globe" size={12} /> public version
                  </Link>
                </>
              )}
            </div>
          </header>

          <div className="tabs" role="tablist" aria-label="Record sections">
            {(
              [
                ['record', 'Record', null],
                ['sources', 'Sources', record.sources.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className="tabs__tab"
                onClick={() => setTab(key)}
              >
                {label}
                {count !== null && <span className="mono muted"> {count}</span>}
              </button>
            ))}
          </div>

          {tab === 'record' && (
            <PostContent
              decision={record.type === 'decision' ? record.rootCause : undefined}
              sections={sectionsFor(record).map((sec) => (sec.heading === 'Follow-ups' ? { ...sec, heading: 'From Q&A' } : sec))}
              result={record.result}
              lesson={record.lesson || undefined}
              render={(text) => <Inline text={text} />}
              extra={
                record.detection && (
                  <section className="post-section">
                    <h2 className="post-section__label">How to spot it next time</h2>
                    <pre className="code-block">
                      <code>{record.detection.code}</code>
                    </pre>
                  </section>
                )
              }
            />
          )}

          {tab === 'sources' && <SourceList sources={record.sources} showExcerpts />}

          <EditHistory record={record} users={users} />
          <QuestionsPanel record={record} users={users} isAuthor={isAuthor} onChange={onChange} />
        </article>

        <aside className="split__side" aria-label="Evidence and related records">
          <DraftedFrom sources={record.sources} />
          <Related ids={record.relatedIds} />
        </aside>
      </div>
    </div>
  )
}



function afterPublish(at: string, publishedAt: string): string {
  // Count calendar days, so an edit the next morning reads as "1 day after".
  const day = (iso: string) => {
    const d = new Date(iso)
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  }
  const days = Math.round((day(at) - day(publishedAt)) / 86_400_000)
  if (days <= 0) return 'same day as publish'
  return `${days} day${days === 1 ? '' : 's'} after publish`
}

function EditHistory({ record, users }: { record: TeamRecord; users: Map<ID, User> }) {
  // The first entry is the publish itself; the rest are edits.
  const edits = record.history.slice(1)
  if (!edits.length) return null
  return (
    <section className="stack gap-10 record-section" aria-labelledby="history-title">
      <h2 id="history-title" className="eyebrow eyebrow--lg">
        Edit history
      </h2>
      <ul className="edit-history">
        {edits.map((h, i) => (
          <li key={i}>
            <strong>{users.get(h.byId)?.name ?? 'Someone'}</strong> {h.summary.charAt(0).toLowerCase() + h.summary.slice(1)}
            <span className="muted"> — {afterPublish(h.at, record.publishedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function QuestionsPanel({
  record,
  users,
  isAuthor,
  onChange,
}: {
  record: TeamRecord
  users: Map<ID, User>
  isAuthor: boolean
  onChange: (r: TeamRecord) => void
}) {
  const { me } = useSession()
  const api = useApi()
  const [body, setBody] = useState('')
  const ask = useMutation((text: string) => api.askQuestion(record.id, text))
  // Questions go to the first author who isn't you.
  const respondent = record.authorIds.filter((id) => id !== me.id).map((id) => users.get(id))[0]
  const respondentFirst = respondent?.name.split(' ')[0]
  const plural = record.authorIds.length > 1

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = await ask.run(body)
    if (next) {
      onChange(next)
      setBody('')
    }
  }

  return (
    <section className="qa record-section" aria-labelledby="qa-title">
      <h2 id="qa-title" className="eyebrow eyebrow--lg">
        {plural ? 'Ask the authors' : 'Ask the author'}
      </h2>
      {record.questions.length === 0 && (
        <p className="small muted">No questions yet. Anything unclear about how this was found or fixed? Ask here.</p>
      )}
      <ol className="qa__list">
        {record.questions.map((q) => (
          <QuestionThread
            key={q.id}
            q={q}
            record={record}
            users={users}
            isAuthor={isAuthor}
            waitingOn={respondentFirst}
            onChange={onChange}
          />
        ))}
      </ol>
      <form className="qa__ask" onSubmit={submit}>
        <label htmlFor="ask" className="sr-only">
          Ask a question
        </label>
        <input
          id="ask"
          className="input qa__input"
          type="text"
          autoComplete="off"
          placeholder={`Ask ${respondentFirst ?? 'the authors'} a question…`}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            ask.clearError()
          }}
        />
        <button type="submit" className="btn btn--ask" disabled={!body.trim() || ask.pending}>
          Ask
        </button>
      </form>
      <FieldError message={ask.error} />
    </section>
  )
}

function QuestionThread({
  q,
  record,
  users,
  isAuthor,
  waitingOn,
  onChange,
}: {
  q: Question
  record: TeamRecord
  users: Map<ID, User>
  isAuthor: boolean
  waitingOn?: string
  onChange: (r: TeamRecord) => void
}) {
  const api = useApi()
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState('')
  const answer = useMutation((text: string) => api.answerQuestion(record.id, q.id, text))
  const fold = useMutation(() => api.foldAnswer(record.id, q.id))
  const asker = users.get(q.authorId)
  const answerer = q.answer ? users.get(q.answer.authorId) : undefined
  const replyId = `reply-${q.id}`

  const submitReply = async (e: FormEvent) => {
    e.preventDefault()
    const next = await answer.run(reply)
    if (next) {
      onChange(next)
      setReply('')
      setReplying(false)
    }
  }

  return (
    <li className="qa__thread">
      <div className="qa__msg">
        {asker ? <Avatar user={asker} size="sm" /> : <span className="avatar avatar--sm" />}
        <div className="stack gap-4">
          <span className="qa__who">
            {asker?.name ?? '…'} <span className="qa__meta">{q.authorRole} · {relativeTime(q.at)}</span>
          </span>
          <p className="qa__q">{q.body}</p>
        </div>
      </div>

      {q.answer ? (
        <div className="qa__answer">
          <div className="row gap-10 wrap">
            {answerer && <Avatar user={answerer} size="xs" />}
            <span className="qa__who">
              {answerer?.name ?? '…'} <span className="qa__meta">{relativeTime(q.answer.at)}</span>
            </span>
            <span className="push-right">
              {q.folded ? (
                <span className="folded">
                  <Icon name="check" size={12} strokeWidth={2.5} />
                  folded into record
                </span>
              ) : (
                isAuthor && (
                  <button
                    type="button"
                    className="fold-btn"
                    disabled={fold.pending}
                    title="Adds this answer to the record under “From Q&A”"
                    onClick={async () => {
                      const next = await fold.run()
                      if (next) onChange(next)
                    }}
                  >
                    Fold into record
                  </button>
                )
              )}
            </span>
          </div>
          <p className="qa__a">{q.answer.body}</p>
          <FieldError message={fold.error} />
        </div>
      ) : isAuthor && replying ? (
        <form className="qa__answer stack gap-8" onSubmit={submitReply}>
          <label htmlFor={replyId} className="sr-only">
            Your answer
          </label>
          <textarea id={replyId} className="input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} autoFocus />
          <FieldError message={answer.error} />
          <div className="row gap-8">
            <button type="submit" className="btn btn--sm" disabled={!reply.trim() || answer.pending}>
              Post answer
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplying(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="qa__waiting row gap-12">
          <span>{isAuthor ? 'Waiting on you…' : `Waiting on ${waitingOn ?? 'the authors'}…`}</span>
          {isAuthor && (
            <button type="button" className="btn-link" onClick={() => setReplying(true)}>
              Answer
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function Related({ ids }: { ids: ID[] }) {
  const api = useApi()
  const related = useQuery(() => Promise.all(ids.map((id) => api.getRecord(id))), [api, ids.join(',')])
  if (!ids.length) return null
  return (
    <section className="stack gap-8 side-section" aria-labelledby="related-title">
      <h2 id="related-title" className="eyebrow">
        Seen this before
      </h2>
      {related.data?.map((r) => (
        <Link key={r.id} to={`/records/${r.id}`} className="related">
          <span className="related__title">{r.title}</span>
          <span className="mono muted small">
            {r.id} · {r.type} · {shortDate(r.publishedAt)}
          </span>
        </Link>
      ))}
    </section>
  )
}
