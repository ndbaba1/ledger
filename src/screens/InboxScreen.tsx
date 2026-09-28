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

export function InboxScreen() {
  const api = useApi()
  const drafts = useQuery(() => api.listDrafts(), [api])
  const users = useUsers(drafts.data?.flatMap((d) => d.coAuthorIds) ?? [])

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">Review inbox</h1>
          <p className="page-sub">Drafts Ledger assembled from your work. Nothing is published until you approve it.</p>
        </div>
      </header>

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
