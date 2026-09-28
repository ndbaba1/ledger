import type { TeamRecord } from '../api/types'
import { useUsers } from '../app/session'
import { AvatarStack } from './Avatar'
import { Icon } from './Icon'
import { KindMeta, ListRow } from './ListBox'
import { shortDate } from '../lib/format'

/** A team record in the shared list style, used in the records list and search results. */
export function RecordRow({ record, excerpt }: { record: TeamRecord; excerpt: string }) {
  const users = useUsers(record.authorIds)
  const authors = record.authorIds.map((id) => users.get(id)).filter((u) => u !== undefined)
  return (
    <ListRow
      to={`/records/${record.id}`}
      title={record.title}
      summary={excerpt}
      meta={
        <>
          <KindMeta type={record.type} />
          <span className="mono">{record.id}</span>
          {authors.length > 0 && (
            <span className="feed-row__people">
              <AvatarStack users={authors} />
              {authors.length === 1 ? authors[0].name : `${authors[0].name} +${authors.length - 1}`}
            </span>
          )}
          <span>{shortDate(record.publishedAt)}</span>
          {record.result && (
            <span className="feed-row__result" title={record.result.label}>
              {record.result.before} → {record.result.after}
            </span>
          )}
          {record.promotedPostSlug && (
            <span className="feed-row__proof">
              <Icon name="globe" size={12} />
              public
            </span>
          )}
        </>
      }
    />
  )
}
