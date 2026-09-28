import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { RecordType } from '../api/types'
import { PublicLayout } from '../app/PublicLayout'
import { useSession } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Empty, ErrorState, Loading } from '../components/States'
import { TypeTag, VerifiedBadge } from '../components/Tags'
import { stripInline } from '../lib/inline'
import { postMinutes } from '../lib/publicPost'
import { useQuery } from '../lib/useAsync'

const TABS: { key: RecordType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'incident', label: 'Incidents' },
  { key: 'investigation', label: 'Investigations' },
  { key: 'decision', label: 'Decisions' },
  { key: 'design', label: 'Designs' },
]

export function ProfileScreen() {
  const { handle = '' } = useParams()
  const api = useApi()
  const { me } = useSession()
  const profile = useQuery(() => api.getProfile(handle), [api, handle])
  const [tab, setTab] = useState<RecordType | 'all'>('all')

  if (profile.error)
    return (
      <PublicLayout>
        <ErrorState error={profile.error} onRetry={profile.reload} />
      </PublicLayout>
    )
  if (!profile.data)
    return (
      <PublicLayout>
        <Loading label="Loading profile" />
      </PublicLayout>
    )

  const { user, posts } = profile.data
  const visible = posts.filter((p) => tab === 'all' || p.type === tab)
  const verified = posts.flatMap((p) => p.badges).filter((b) => b.verified).length
  const isMe = user.id === me.id

  return (
    <PublicLayout>
      <div className="profile">
        <div className="profile__main stack gap-24">
          <section className="profile-head" aria-label="Profile">
            <Avatar user={user} size="xl" />
            <div className="stack gap-8">
              <div className="row gap-12 wrap baseline">
                <h1 className="page-title">{user.name}</h1>
                <span className="mono muted">@{user.handle}</span>
              </div>
              {(user.headline || user.location) && (
                <p className="text">{[user.headline, user.location].filter(Boolean).join(' · ')}</p>
              )}
              {user.stack && (
                <div className="row gap-6 wrap">
                  {user.stack.map((s) => (
                    <span key={s} className="chip">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="tabs" role="tablist" aria-label="Filter write-ups">
            {TABS.map((t) => {
              const n = t.key === 'all' ? posts.length : posts.filter((p) => p.type === t.key).length
              if (t.key !== 'all' && n === 0) return null
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  className="tabs__tab"
                  onClick={() => setTab(t.key)}
                >
                  {t.label} <span className="mono muted">{n}</span>
                </button>
              )
            })}
          </div>

          {visible.length === 0 && (
            <Empty title="No write-ups yet">
              {isMe ? (
                <>
                  Promote a <Link to="/records">team record</Link> to publish your first one.
                </>
              ) : null}
            </Empty>
          )}

          <ul className="card-list">
            {visible.map((p) => (
              <li key={p.slug}>
                <article className="post-card">
                  <div className="row gap-8 wrap">
                    <TypeTag type={p.type} />
                    <span className="mono muted small">{p.tags.join(' · ')}</span>
                    <span className="mono muted small push-right">{postMinutes(p)} min read</span>
                  </div>
                  <h2 className="card-title card-title--lg">
                    <Link to={`/u/${user.handle}/${p.slug}`} className="stretched">
                      {p.title}
                    </Link>
                  </h2>
                  <p className="card-excerpt">{stripInline(p.summary)}</p>
                  <div className="row gap-8 wrap">
                    {p.badges.map((b) => (
                      <VerifiedBadge key={b.label + b.detail} label={b.label} detail={b.detail} />
                    ))}
                    {p.promotedFromRecordId && <span className="pill small">promoted from a team record</span>}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>

        <aside className="profile__side stack gap-16" aria-label="Verified activity">
          <div className="card stack gap-14">
            <h2 className="side-title">Proof of work</h2>
            <div className="grid-2 grid-2--tight">
              <div className="stat">
                <span className="stat__n">{posts.length}</span>
                <span className="small muted">write-ups</span>
              </div>
              <div className="stat">
                <span className="stat__n text-green">{verified}</span>
                <span className="small muted">verified sources</span>
              </div>
            </div>
            <p className="small muted">
              Badges are checked against the source when a post is published. Private work shows as verified without revealing code
              or company.
            </p>
          </div>
          {user.previously && user.previously.length > 0 && (
            <div className="card stack gap-10">
              <h2 className="side-title">Previously</h2>
              {user.previously.map((p) => (
                <div key={p.org} className="stack gap-2">
                  <span className="strong small">{p.org}</span>
                  <span className="small muted">{p.summary}</span>
                </div>
              ))}
            </div>
          )}
          {isMe && (
            <Link to="/records" className="card card--link">
              <span className="row gap-10 small">
                <Icon name="arrowUpRight" size={14} />
                Promote a team record
              </span>
            </Link>
          )}
        </aside>
      </div>
    </PublicLayout>
  )
}
