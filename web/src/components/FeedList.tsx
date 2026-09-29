import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { FeedItem } from '../api/types'
import { signInWithGithub } from '../app/githubAuth'
import { useMe } from '../app/session'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { KindMeta, ListBox, ListRow } from './ListBox'
import { stripInline } from '../lib/inline'
import { shortDate } from '../lib/format'
import { useMutation } from '../lib/useAsync'

/** Code the author wrote is the strongest proof, so it goes first. */
function strongestProof(item: FeedItem) {
  return item.post.badges
    .filter((b) => b.verified)
    .sort((a, b) => Number(/^(Authored|Maintainer)/.test(b.label)) - Number(/^(Authored|Maintainer)/.test(a.label)))[0]
}

/** A list of published write-ups in the shared list style. */
export function FeedList({
  header,
  labelledBy,
  items,
  summary = 'summary',
  showAuthor = true,
  footer,
}: {
  header: ReactNode
  labelledBy: string
  items: FeedItem[]
  /** Which line to show under the title. Topic pages lead with the lesson. */
  summary?: 'summary' | 'lesson'
  /** Off on a profile, where every post is by the same person. */
  showAuthor?: boolean
  footer?: ReactNode
}) {
  return (
    <ListBox labelledBy={labelledBy} header={header} footer={footer}>
      {items.map((item) => {
        const { post, author } = item
        const proof = strongestProof(item)
        return (
          <ListRow
            key={`${author.handle}/${post.slug}`}
            to={`/u/${author.handle}/${post.slug}`}
            title={post.title}
            lead={
              showAuthor && (
                <Link to={`/u/${author.handle}`} className="feed-row__avatar" aria-label={author.name} tabIndex={-1}>
                  <Avatar user={author} size="xs" />
                </Link>
              )
            }
            summary={stripInline(summary === 'lesson' ? (post.lesson ?? post.summary) : post.summary)}
            meta={
              <>
                <KindMeta type={post.type} />
                {showAuthor && (
                  <Link to={`/u/${author.handle}`} className="feed-row__author">
                    {author.name}
                  </Link>
                )}
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
              </>
            }
            aside={<HitToggle item={item} />}
          />
        )
      })}
    </ListBox>
  )
}

/** The feed's “star”: tell the author you ran into the same problem. */
function HitToggle({ item }: { item: FeedItem }) {
  const api = useApi()
  const me = useMe()
  const location = useLocation()
  const [state, setState] = useState({ n: item.post.hitCount ?? 0, on: Boolean(item.hitByMe) })
  const toggle = useMutation(() => api.toggleHit(item.author.handle, item.post.slug))
  const label = `${state.n} engineer${state.n === 1 ? '' : 's'} hit this`

  if (item.author.id === me?.id) {
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
        if (!me) return void signInWithGithub(location.pathname + location.search)
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
