import { Link } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { AvatarStack } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Empty, ErrorState, Loading } from '../components/States'
import { Tag, TypeTag } from '../components/Tags'
import { useUsers } from '../app/session'
import { relativeTime } from '../lib/format'
import { stripInline } from '../lib/inline'
import { useQuery } from '../lib/useAsync'
import { KindPill } from '../components/PostContent'
import { publishBlockers } from '../lib/writeups'

export function InboxScreen() {
  const api = useApi()
  const drafts = useQuery(() => api.listDrafts(), [api])
  const writeups = useQuery(() => api.listWriteups(), [api])
  const users = useUsers(drafts.data?.flatMap((d) => d.coAuthorIds) ?? [])

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">Review inbox</h1>
          <p className="page-sub">Drafts Ledger assembled from your work, and write-ups you started. Nothing is published until you approve it.</p>
        </div>
        <Link to="/new" className="btn push-right hide-mobile">
          <Icon name="plus" size={14} />
          New write-up
        </Link>
      </header>

      {writeups.data && writeups.data.length > 0 && (
        <section className="stack gap-10" aria-labelledby="yours-title">
          <h2 id="yours-title" className="section-title">
            Your write-ups
          </h2>
          <ul className="card-list">
            {writeups.data.map((w) => {
              const left = publishBlockers(w).length
              return (
                <li key={w.id}>
                  <Link to={`/write/${w.id}`} className="card card--link">
                    <div className="row gap-8 wrap">
                      <KindPill type={w.type} />
                      <span className={`status-pill status-pill--${w.status}`}>
                        {w.status === 'proposed' ? 'Proposed' : w.status === 'shipped' ? 'Shipped' : 'Draft'}
                      </span>
                      <span className="mono muted small push-right">edited {relativeTime(w.updatedAt)}</span>
                    </div>
                    <h3 className="card-title">{w.title || 'Untitled write-up'}</h3>
                    <span className={`small ${left ? 'text-amber' : 'text-green'}`}>
                      {left ? `${left} thing${left === 1 ? '' : 's'} left before publishing` : 'Ready to publish'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {drafts.data && drafts.data.length > 0 && (
        <h2 className="section-title">Drafted from your work</h2>
      )}

      {drafts.loading && !drafts.data && <Loading label="Loading drafts" />}
      {drafts.error && <ErrorState error={drafts.error} onRetry={drafts.reload} />}
      {drafts.data?.length === 0 && (
        <Empty title="Inbox zero">New drafts appear here when an issue closes with the ledger label, or when someone runs /ledger track.</Empty>
      )}

      <ul className="card-list">
        {drafts.data?.map((d) => {
          const openGaps = d.gaps.filter((g) => g.status === 'open').length
          return (
            <li key={d.id}>
              <Link to={`/drafts/${d.slug}`} className="card card--link draft-card">
                <div className="row gap-8 wrap">
                  <TypeTag type={d.type} />
                  {openGaps > 0 ? (
                    <Tag tone="amber">
                      {openGaps} gap{openGaps === 1 ? '' : 's'}
                    </Tag>
                  ) : (
                    <Tag tone="green">ready to approve</Tag>
                  )}
                  <span className="mono muted small">{relativeTime(d.createdAt)}</span>
                </div>
                <h2 className="card-title">{d.title}</h2>
                <p className="card-excerpt">{stripInline(d.summary)}</p>
                <div className="row gap-12 wrap small muted">
                  <span className="mono">{d.anchor}</span>
                  <span className="row gap-4">
                    <Icon name="link" size={13} />
                    {d.sources.length} sources
                  </span>
                  <span>{d.trigger}</span>
                  <span className="push-right">
                    <AvatarStack users={d.coAuthorIds.map((id) => users.get(id)).filter((u) => u !== undefined)} />
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
