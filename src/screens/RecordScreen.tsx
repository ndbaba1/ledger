import { useState, type FormEvent, type ReactNode } from 'react'
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
import { TypeTag } from '../components/Tags'
import { relativeTime, shortDate } from '../lib/format'
import { SECTION_LABELS } from '../lib/labels'
import { useMutation, useQuery } from '../lib/useAsync'

type Tab = 'record' | 'sources' | 'history'

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
  const labels = SECTION_LABELS[record.type]
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
            <div className="row gap-8 wrap">
              <TypeTag type={record.type} />
              {record.tags.map((t) => (
                <span key={t} className="mono muted small">
                  {t}
                </span>
              ))}
            </div>
            <h1 className="doc-title doc-title--lg">{record.title}</h1>
            <div className="row gap-10 wrap small muted">
              <AvatarStack users={authors} size="sm" />
              <span>{authors.map((a) => a.name).join(', ')}</span>
              <span aria-hidden="true">·</span>
              <span>published {shortDate(record.publishedAt)}</span>
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
                ['history', 'History', record.history.length],
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
            <div className="stack gap-22">
              <div className="grid-2">
                <Callout label={labels.symptom}>
                  <Inline text={record.symptom} />
                </Callout>
                <Callout label={labels.rootCause}>
                  <Inline text={record.rootCause} />
                </Callout>
              </div>
              {record.ruledOut.length > 0 && (
                <section className="stack gap-8">
                  <h2 className="section-title">{labels.ruledOut}</h2>
                  <ul className="prose-list">
                    {record.ruledOut.map((r, i) => (
                      <li key={i}>
                        <Inline text={r} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {record.detection && (
                <section className="stack gap-8">
                  <h2 className="section-title">How to spot it next time</h2>
                  <pre className="code-block">
                    <code>{record.detection.code}</code>
                  </pre>
                </section>
              )}
              <section className="stack gap-8">
                <h2 className="section-title">{labels.fix}</h2>
                <p className="prose">
                  <Inline text={record.fix} />
                </p>
              </section>
              {record.notes.length > 0 && (
                <section className="stack gap-8">
                  <h2 className="section-title">From Q&amp;A</h2>
                  <ul className="prose-list">
                    {record.notes.map((n, i) => (
                      <li key={i}>
                        <Inline text={n} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {record.lesson && (
                <div className="lesson">
                  <span className="eyebrow eyebrow--amber">The lesson</span>
                  <p className="prose">{record.lesson}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'sources' && <SourceList sources={record.sources} showExcerpts />}

          {tab === 'history' && (
            <ol className="history">
              {[...record.history].reverse().map((h, i) => {
                const by = users.get(h.byId)
                return (
                  <li key={i} className="history__row">
                    {by && <Avatar user={by} size="xs" />}
                    <span>
                      <strong>{by?.name ?? 'Someone'}</strong> {h.summary.charAt(0).toLowerCase() + h.summary.slice(1)}
                    </span>
                    <span className="mono muted small push-right">{shortDate(h.at)}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </article>

        <aside className="split__side" aria-label="Evidence, questions and related records">
          <DraftedFrom sources={record.sources} />
          <QuestionsPanel record={record} users={users} isAuthor={isAuthor} onChange={onChange} />
          <Related ids={record.relatedIds} />
        </aside>
      </div>
    </div>
  )
}

function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card stack gap-6">
      <span className="eyebrow">{label}</span>
      <p className="prose prose--sm">{children}</p>
    </div>
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
  const api = useApi()
  const [body, setBody] = useState('')
  const ask = useMutation((text: string) => api.askQuestion(record.id, text))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = await ask.run(body)
    if (next) {
      onChange(next)
      setBody('')
    }
  }

  return (
    <section className="stack gap-12 side-section" aria-labelledby="qa-title">
      <div className="side-head">
        <h2 id="qa-title" className="side-title">
          Ask the authors
        </h2>
        <span className="mono muted small">
          {record.questions.length} thread{record.questions.length === 1 ? '' : 's'}
        </span>
      </div>
      {record.questions.map((q) => (
        <QuestionThread key={q.id} q={q} record={record} users={users} isAuthor={isAuthor} onChange={onChange} />
      ))}
      <form className="stack gap-6" onSubmit={submit}>
        <label htmlFor="ask" className="label">
          Ask a question
        </label>
        <textarea
          id="ask"
          className="input"
          rows={2}
          placeholder="Authors get notified in Slack"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <FieldError message={ask.error} />
        <button type="submit" className="btn align-start" disabled={!body.trim() || ask.pending}>
          <Icon name="message" size={14} />
          Ask
        </button>
      </form>
    </section>
  )
}

function QuestionThread({
  q,
  record,
  users,
  isAuthor,
  onChange,
}: {
  q: Question
  record: TeamRecord
  users: Map<ID, User>
  isAuthor: boolean
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
    <div className="thread">
      <div className="thread__msg">
        <span className="small muted">
          <strong className="text">{asker?.name ?? '…'}</strong> · {q.authorRole} · {relativeTime(q.at)}
        </span>
        <p className="thread__body">{q.body}</p>
      </div>
      {q.answer ? (
        <div className="thread__msg thread__msg--answer">
          <span className="small muted">
            <strong className="text">{answerer?.name ?? '…'}</strong> · author · {relativeTime(q.answer.at)}
          </span>
          <p className="thread__body">{q.answer.body}</p>
          {q.folded ? (
            <span className="row gap-6 small text-green">
              <Icon name="check" size={12} /> Folded into the record
            </span>
          ) : (
            isAuthor && (
              <div className="row gap-8 wrap">
                <button
                  type="button"
                  className="btn btn--amber btn--sm"
                  disabled={fold.pending}
                  onClick={async () => {
                    const next = await fold.run()
                    if (next) onChange(next)
                  }}
                >
                  Fold into record
                </button>
                <span className="small muted">adds it under “From Q&amp;A”</span>
              </div>
            )
          )}
          <FieldError message={fold.error} />
        </div>
      ) : isAuthor ? (
        replying ? (
          <form className="thread__msg stack gap-6" onSubmit={submitReply}>
            <label htmlFor={replyId} className="sr-only">
              Your answer
            </label>
            <textarea id={replyId} className="input" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} autoFocus />
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
          <div className="thread__msg">
            <div className="row gap-8">
              <span className="small text-amber">Awaiting an author</span>
              <button type="button" className="btn-link push-right" onClick={() => setReplying(true)}>
                Answer
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="thread__msg">
          <span className="small text-amber">Awaiting an author</span>
        </div>
      )}
    </div>
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
