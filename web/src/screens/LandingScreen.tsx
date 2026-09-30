import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { RecordType } from '../api/types'
import { PublicLayout } from '../app/PublicLayout'
import { useMe } from '../app/session'
import { FeedList, FilterMenu } from '../components/FeedList'
import { Icon } from '../components/Icon'
import { Empty, ErrorState, Loading } from '../components/States'
import { useQuery } from '../lib/useAsync'

const TYPES: { key: RecordType | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'incident', label: 'Incidents' },
  { key: 'investigation', label: 'Investigations' },
  { key: 'decision', label: 'Decisions' },
  { key: 'design', label: 'Designs' },
]

const TRY = ['retries', 'kafka lag', 'postgres partitioning', 'how did you fix connection pool saturation?']

/** The public front page: every published write-up, searchable by anyone. */
export function LandingScreen() {
  const api = useApi()
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const type = (params.get('type') as RecordType | null) ?? undefined
  const tag = params.get('tag') ?? undefined
  const [draft, setDraft] = useState(q)

  useEffect(() => setDraft(q), [q])

  // Search as you type, once typing pauses.
  useEffect(() => {
    if (draft === q) return
    const t = setTimeout(() => update({ q: draft.trim() || null }), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const result = useQuery(() => api.explore({ query: q, type, tag }), [api, q, type, tag])

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    update({ q: draft.trim() || null })
  }

  const filtering = Boolean(q || type || tag)

  return (
    <PublicLayout>
      <div className="explore">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="page-title">
            Explore engineering work
          </h1>
          <p className="small muted">Incidents, investigations, decisions and designs, each linked to the PRs, issues and docs behind it.</p>
          <form className="hero__search" role="search" onSubmit={submit}>
            <Icon name="search" size={20} />
            <label htmlFor="explore-q" className="sr-only">
              Search public records
            </label>
            <input
              id="explore-q"
              type="search"
              autoComplete="off"
              placeholder="Search an error, a tool, or ask how someone fixed it"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn--primary hero__go">
              Search
            </button>
          </form>
          {!q && (
            <div className="hero__try">
              <span className="small muted">Try</span>
              {TRY.map((t) => (
                <button key={t} type="button" className="chip chip--btn" onClick={() => setDraft(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="explore__body">
          <div className="explore__feed">
            {result.error && <ErrorState error={result.error} onRetry={result.reload} />}
            {result.loading && !result.data && <Loading label="Loading records" />}
            {result.data && (
              <FeedList
                labelledBy="feed-title"
                items={result.data.items}
                header={
                  <>
                    <Icon name={q ? 'search' : 'trend'} size={16} />
                    <h2 id="feed-title" className="feed__title">
                      {q ? 'Results' : 'Latest records'}
                    </h2>
                    <span className="feed__count small muted" aria-live="polite">
                      ·{' '}
                      {filtering
                        ? `${result.data.items.length} of ${result.data.total}${q ? ` matching “${q}”` : ''}${tag ? ` tagged ${tag}` : ''}`
                        : `${result.data.total} records`}
                    </span>
                    {filtering && (
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => {
                          setDraft('')
                          setParams(new URLSearchParams(), { replace: true })
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                    <span className="push-right">
                      <FilterMenu options={TYPES} value={type ?? 'all'} onChange={(k) => update({ type: k === 'all' ? null : k })} />
                    </span>
                  </>
                }
                footer={
                  result.data.items.length === 0 && (
                    <div className="feed__empty">
                      <Empty title="No records match yet">
                        Solved something like this? <Link to="/new">Write it up</Link> — yours could be the first.
                      </Empty>
                    </div>
                  )
                }
              />
            )}
          </div>

          <aside className="explore__rail" aria-label="Browse and contribute">
            {result.data && result.data.tags.length > 0 && (
              <section className="stack gap-10" aria-labelledby="tags-title">
                <h2 id="tags-title" className="eyebrow">
                  Browse by topic
                </h2>
                <div className="row gap-6 wrap">
                  {result.data.tags.map((t) => (
                    <Link key={t.tag} to={`/t/${t.tag}`} className="chip chip--btn">
                      #{t.tag}
                      <span className="muted chip__count">{t.count}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {!me && (
              <section className="how card" aria-labelledby="how-title">
                <h2 id="how-title" className="side-title">
                  How it works
                </h2>
                <ol className="how__steps">
                  <li>
                    <strong>Write up how you solved it.</strong>
                  </li>
                  <li>
                    <strong>Attach the PRs that fixed it.</strong>
                  </li>
                  <li>
                    <strong>Ledger verifies them with GitHub.</strong>
                  </li>
                </ol>
                <Link to="/new" className="btn btn--primary">
                  Write your first one
                </Link>
              </section>
            )}
          </aside>
        </div>
      </div>
    </PublicLayout>
  )
}
