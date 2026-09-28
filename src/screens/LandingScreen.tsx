import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { FeedItem, RecordType } from '../api/types'
import { PublicLayout } from '../app/PublicLayout'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { KindPill } from '../components/PostContent'
import { Empty, ErrorState, Loading } from '../components/States'
import { VerifiedBadge } from '../components/Tags'
import { shortDate } from '../lib/format'
import { stripInline } from '../lib/inline'
import { postMinutes } from '../lib/publicPost'
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
          <span className="hero__eyebrow">
            <Icon name="check" size={13} strokeWidth={3} />
            Every write-up links to the work that fixed it
          </span>
          <h1 id="hero-title" className="hero__title">
            How engineers actually solved it — <span className="hero__accent">with the proof attached.</span>
          </h1>
          <p className="hero__sub">
            Incidents, investigations, decisions and system designs, written by the engineers who did the work and verified
            against their merged code.
          </p>
          <form className="hero__search" role="search" onSubmit={submit}>
            <Icon name="search" size={20} />
            <label htmlFor="explore-q" className="sr-only">
              Search public write-ups
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
          <section className="explore__feed" aria-labelledby="feed-title">
            <div className="explore__bar">
              <div className="row gap-8 wrap" role="group" aria-label="Filter by type">
                {TYPES.map((t) => {
                  const on = (type ?? 'all') === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`filter${on ? ' filter--on' : ''}`}
                      aria-pressed={on}
                      onClick={() => update({ type: t.key === 'all' ? null : t.key })}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="row gap-10 wrap explore__status">
              <h2 id="feed-title" className="eyebrow">
                {q ? 'Results' : 'Latest write-ups'}
              </h2>
              {result.data && (
                <span className="small muted" aria-live="polite">
                  {filtering
                    ? `${result.data.items.length} of ${result.data.total} write-ups${q ? ` matching “${q}”` : ''}${tag ? ` tagged ${tag}` : ''}`
                    : `${result.data.total} write-ups`}
                </span>
              )}
              {filtering && (
                <button
                  type="button"
                  className="btn-link push-right"
                  onClick={() => {
                    setDraft('')
                    setParams(new URLSearchParams(), { replace: true })
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {result.error && <ErrorState error={result.error} onRetry={result.reload} />}
            {result.loading && !result.data && <Loading label="Loading write-ups" />}
            {result.data?.items.length === 0 && (
              <Empty title="No write-ups match yet">
                Solved something like this? <Link to="/new">Write it up</Link> — yours could be the first.
              </Empty>
            )}
            <ul className="card-list">
              {result.data?.items.map((item) => (
                <li key={`${item.author.handle}/${item.post.slug}`}>
                  <FeedCard item={item} onTag={(t) => update({ tag: t })} />
                </li>
              ))}
            </ul>
          </section>

          <aside className="explore__rail" aria-label="Browse and contribute">
            {result.data && result.data.tags.length > 0 && (
              <section className="stack gap-10" aria-labelledby="tags-title">
                <h2 id="tags-title" className="eyebrow">
                  Browse by topic
                </h2>
                <div className="row gap-6 wrap">
                  {result.data.tags.map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      className={`chip chip--btn${tag === t.tag ? ' chip--on' : ''}`}
                      aria-pressed={tag === t.tag}
                      onClick={() => update({ tag: tag === t.tag ? null : t.tag })}
                    >
                      {t.tag}
                      <span className="muted chip__count">{t.count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="how card" aria-labelledby="how-title">
              <h2 id="how-title" className="side-title">
                How it works
              </h2>
              <ol className="how__steps">
                <li>
                  <strong>Solve it at work.</strong> Ledger drafts the write-up from the issue, MRs and Slack thread.
                </li>
                <li>
                  <strong>Remove what’s private.</strong> Names, services and internal links are redacted before anything leaves.
                </li>
                <li>
                  <strong>Publish with proof.</strong> Your merged code becomes a verified badge, without showing the code.
                </li>
              </ol>
              <Link to="/new" className="btn btn--primary">
                Write your first one
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </PublicLayout>
  )
}

function FeedCard({ item, onTag }: { item: FeedItem; onTag: (tag: string) => void }) {
  const { post, author } = item
  // Show the strongest proof first: code the author wrote, then everything else.
  const verified = post.badges
    .filter((b) => b.verified)
    .sort((a, b) => Number(/^(Authored|Maintainer)/.test(b.label)) - Number(/^(Authored|Maintainer)/.test(a.label)))
  return (
    <article className="feed-card">
      <div className="row gap-8 wrap">
        <KindPill type={post.type} />
        {post.tags.map((t) => (
          <button key={t} type="button" className="feed-card__tag" onClick={() => onTag(t)}>
            #{t}
          </button>
        ))}
      </div>
      <h3 className="feed-card__title">
        <Link to={`/u/${author.handle}/${post.slug}`} className="stretched">
          {post.title}
        </Link>
      </h3>
      <p className="card-excerpt">{stripInline(post.summary)}</p>
      {post.result && (
        <p className="feed-card__result">
          <span className="muted">{post.result.label}:</span> {post.result.before} → {post.result.after}
        </p>
      )}
      <div className="feed-card__foot">
        <Link to={`/u/${author.handle}`} className="feed-card__author">
          <Avatar user={author} size="xs" />
          <span>{author.name}</span>
        </Link>
        <span className="muted small">
          {shortDate(post.publishedAt)} · {postMinutes(post)} min read
        </span>
        {verified[0] && (
          <span className="push-right">
            <VerifiedBadge label={verified[0].label} />
          </span>
        )}
      </div>
    </article>
  )
}
