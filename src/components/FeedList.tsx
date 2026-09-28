import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { FeedItem, RecordType } from '../api/types'
import { useSession } from '../app/session'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { stripInline } from '../lib/inline'
import { shortDate } from '../lib/format'
import { useMutation } from '../lib/useAsync'

const KIND_NAME: Record<RecordType, string> = {
  incident: 'Incident',
  investigation: 'Investigation',
  decision: 'Decision',
  design: 'Design',
}

/** Code the author wrote is the strongest proof, so it goes first. */
function strongestProof(item: FeedItem) {
  return item.post.badges
    .filter((b) => b.verified)
    .sort((a, b) => Number(/^(Authored|Maintainer)/.test(b.label)) - Number(/^(Authored|Maintainer)/.test(a.label)))[0]
}

/**
 * One bordered list of write-ups with divider rows: a header line, then rows
 * with the title, a one-line summary and a metadata line.
 */
export function FeedList({
  header,
  labelledBy,
  items,
  summary = 'summary',
  footer,
}: {
  header: ReactNode
  labelledBy: string
  items: FeedItem[]
  /** Which line to show under the title. Topic pages lead with the lesson. */
  summary?: 'summary' | 'lesson'
  footer?: ReactNode
}) {
  return (
    <section className="feed" aria-labelledby={labelledBy}>
      <div className="feed__head">{header}</div>
      {items.length > 0 && (
        <ul className="feed__list">
          {items.map((item) => (
            <li key={`${item.author.handle}/${item.post.slug}`}>
              <FeedRow item={item} summary={summary} />
            </li>
          ))}
        </ul>
      )}
      {footer}
    </section>
  )
}

function FeedRow({ item, summary }: { item: FeedItem; summary: 'summary' | 'lesson' }) {
  const { post, author } = item
  const proof = strongestProof(item)
  const text = summary === 'lesson' ? (post.lesson ?? post.summary) : post.summary
  return (
    <article className="feed-row">
      <div className="feed-row__main">
        <div className="feed-row__title">
          <Link to={`/u/${author.handle}`} className="feed-row__avatar" aria-label={author.name} tabIndex={-1}>
            <Avatar user={author} size="xs" />
          </Link>
          <h3>
            <Link to={`/u/${author.handle}/${post.slug}`}>{post.title}</Link>
          </h3>
        </div>
        <p className="feed-row__summary">{stripInline(text)}</p>
        <div className="feed-row__meta">
          <span className="feed-row__kind">
            <span className={`kind-dot kind-dot--${post.type}`} aria-hidden="true" />
            {KIND_NAME[post.type]}
          </span>
          <Link to={`/u/${author.handle}`} className="feed-row__author">
            {author.name}
          </Link>
          <span>{shortDate(post.publishedAt)}</span>
          {post.result && (
            <span className="feed-row__result" title={post.result.label}>
              {post.result.before} → {post.result.after}
            </span>
          )}
          {proof && (
            <span className="feed-row__proof" title={proof.detail}>
              <Icon name="check" size={12} strokeWidth={3} />
              {proof.label}
            </span>
          )}
        </div>
      </div>
      <HitToggle item={item} />
    </article>
  )
}

/** The feed's “star”: tell the author you ran into the same problem. */
function HitToggle({ item }: { item: FeedItem }) {
  const api = useApi()
  const { me } = useSession()
  const [state, setState] = useState({ n: item.post.hitCount ?? 0, on: Boolean(item.hitByMe) })
  const toggle = useMutation(() => api.toggleHit(item.author.handle, item.post.slug))
  const label = `${state.n} engineer${state.n === 1 ? '' : 's'} hit this`

  if (item.author.id === me.id) {
    if (!state.n) return null
    return (
      <span className="hit-toggle hit-toggle--static" title={label}>
        <span className="hit-toggle__label">Hits</span>
        <span className="hit-toggle__count">{state.n}</span>
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`hit-toggle${state.on ? ' hit-toggle--on' : ''}`}
      aria-pressed={state.on}
      aria-label={`${state.on ? 'You hit this too' : 'I hit this too'} · ${label}`}
      title="Ran into the same problem? Let the author know."
      disabled={toggle.pending}
      onClick={async () => {
        const next = await toggle.run()
        if (next) setState({ n: next.hitCount, on: next.hitByMe })
      }}
    >
      <span className="hit-toggle__label">
        <Icon name={state.on ? 'check' : 'plus'} size={14} strokeWidth={2.5} />
        <span>{state.on ? 'You hit this too' : 'I hit this too'}</span>
      </span>
      <span className="hit-toggle__count">{state.n}</span>
    </button>
  )
}

/** A compact “Filter” menu for choosing one option, like the type of write-up. */
export function FilterMenu<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[]
  value: K
  onChange: (key: K) => void
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.key === value)
  const active = value !== options[0].key
  return (
    <div className="filter-menu" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button
        type="button"
        className={`btn btn--sm filter-menu__btn${active ? ' filter-menu__btn--on' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="filter" size={14} />
        {active ? current?.label : 'Filter'}
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <>
          <div className="filter-menu__scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="filter-menu__pop" role="group" aria-label="Filter by type">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                className="filter-menu__item"
                aria-pressed={o.key === value}
                onClick={() => {
                  onChange(o.key)
                  setOpen(false)
                }}
              >
                <span className="filter-menu__check">{o.key === value && <Icon name="check" size={13} strokeWidth={2.5} />}</span>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
