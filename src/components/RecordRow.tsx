import { Link } from 'react-router-dom'
import type { TeamRecord } from '../api/types'
import { useUsers } from '../app/session'
import { AvatarStack } from './Avatar'
import { Icon } from './Icon'
import { TypeTag } from './Tags'
import { shortDate } from '../lib/format'

/** A record summary row, used in the records list and search results. */
export function RecordRow({ record, excerpt }: { record: TeamRecord; excerpt: string }) {
  const users = useUsers(record.authorIds)
  const authors = record.authorIds.map((id) => users.get(id)).filter((u) => u !== undefined)
  return (
    <Link to={`/records/${record.id}`} className="card card--link record-row">
      <div className="row gap-8 wrap">
        <TypeTag type={record.type} />
        <span className="mono muted small">{record.id}</span>
        {record.promotedPostSlug && (
          <span className="row gap-4 small text-green">
            <Icon name="globe" size={12} />
            public
          </span>
        )}
        <span className="mono muted small push-right">{shortDate(record.publishedAt)}</span>
      </div>
      <h2 className="card-title">{record.title}</h2>
      <p className="card-excerpt">{excerpt}</p>
      <div className="row gap-8 wrap">
        {record.tags.map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
        <span className="push-right">
          <AvatarStack users={authors} />
        </span>
      </div>
    </Link>
  )
}
