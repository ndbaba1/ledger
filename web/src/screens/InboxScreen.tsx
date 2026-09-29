import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { AvatarStack } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Empty, ErrorState, Loading } from '../components/States'
import { KindMeta, ListBox, ListHeader, ListRow } from '../components/ListBox'
import { useUsers } from '../app/session'
import { relativeTime } from '../lib/format'
import { stripInline } from '../lib/inline'
import { useQuery } from '../lib/useAsync'
import { publishBlockers } from '../lib/writeups'

export function InboxScreen() {
  const api = useApi()
  const drafts = useQuery(() => api.listDrafts(), [api])
  const writeups = useQuery(() => api.listWriteups(), [api])
  const projects = useQuery(() => api.listProjectCandidates(), [api])
  const location = useLocation()
  const ready = Boolean(projects.data && drafts.data)
  useEffect(() => {
    if (ready && location.hash === '#projects') document.getElementById('projects')?.scrollIntoView({ block: 'start' })
  }, [ready, location.hash])
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
        <ListBox
          labelledBy="yours-title"
          header={<ListHeader id="yours-title" icon={<Icon name="file" size={16} />} title="Your write-ups" count={writeups.data.length} />}
        >
          {writeups.data.map((w) => {
            const left = publishBlockers(w).length
            return (
              <ListRow
                key={w.id}
                to={`/write/${w.id}`}
                title={w.title || 'Untitled write-up'}
                meta={
                  <>
                    <KindMeta type={w.type} />
                    <span className={`status-pill status-pill--${w.status}`}>
                      {w.status === 'proposed' ? 'Proposed' : w.status === 'shipped' ? 'Shipped' : 'Draft'}
                    </span>
                    <span>edited {relativeTime(w.updatedAt)}</span>
                    <span className={left ? 'feed-row__warn' : 'feed-row__ok'}>
                      {left ? `${left} thing${left === 1 ? '' : 's'} left before publishing` : 'Ready to publish'}
                    </span>
                  </>
                }
                aside={
                  <Link to={`/write/${w.id}`} className="btn btn--sm hide-mobile" tabIndex={-1} aria-hidden="true">
                    Continue
                  </Link>
                }
              />
            )
          })}
        </ListBox>
      )}

      {drafts.loading && !drafts.data && <Loading label="Loading drafts" />}

      {drafts.error && <ErrorState error={drafts.error} onRetry={drafts.reload} />}
      {drafts.data?.length === 0 && (
        <Empty title="Inbox zero">New drafts appear here when an issue closes with the ledger label, or when someone runs /ledger track.</Empty>
      )}

      {drafts.data && drafts.data.length > 0 && (
        <ListBox
          labelledBy="drafts-title"
          header={
            <ListHeader id="drafts-title" icon={<Icon name="inbox" size={16} />} title="Drafted from your work" count={`${drafts.data.length} waiting`} />
          }
        >
          {drafts.data.map((d) => {
            const openGaps = d.gaps.filter((g) => g.status === 'open').length
            const coAuthors = d.coAuthorIds.map((id) => users.get(id)).filter((u) => u !== undefined)
            return (
              <ListRow
                key={d.id}
                to={`/drafts/${d.slug}`}
                title={d.title}
                summary={stripInline(d.summary)}
                meta={
                  <>
                    <KindMeta type={d.type} />
                    <span className={openGaps ? 'feed-row__warn' : 'feed-row__ok'}>
                      {openGaps ? `${openGaps} gap${openGaps === 1 ? '' : 's'} to fill` : 'Ready to approve'}
                    </span>
                    <span className="mono">{d.anchor}</span>
                    <span className="feed-row__people">
                      <Icon name="link" size={12} />
                      {d.sources.length} sources
                    </span>
                    {coAuthors.length > 0 && <AvatarStack users={coAuthors} />}
                    <span>{relativeTime(d.createdAt)}</span>
                  </>
                }
                aside={
                  <Link to={`/drafts/${d.slug}`} className={`btn btn--sm hide-mobile${openGaps ? '' : ' btn--primary'}`} tabIndex={-1} aria-hidden="true">
                    Review
                  </Link>
                }
              />
            )
          })}
        </ListBox>
      )}
      {projects.data && projects.data.length > 0 && (
        <div id="projects">
          <ListBox
            labelledBy="projects-title"
            header={
              <ListHeader
                id="projects-title"
                icon={<Icon name="folder" size={16} />}
                title="Projects Ledger noticed"
                count={`${projects.data.filter((p) => !p.publishedSlug).length} new`}
              />
            }
          >
            {projects.data.map((p) => (
              <ListRow
                key={p.id}
                to={`/projects/${p.id}`}
                title={p.suggestedTitle}
                summary={`${p.recordIds.length} records and ${p.changes.length} merge requests share ${p.groupedBy}. Name it and publish it as one body of work on your profile.`}
                meta={
                  <>
                    <span className="mono">{p.groupedBy}</span>
                    <span className="feed-row__people">
                      <Icon name="merge" size={12} />
                      {p.changes.filter((c) => c.role === 'authored').length} authored
                    </span>
                    {p.publishedSlug ? <span className="feed-row__ok">On your profile</span> : <span className="feed-row__warn">Not published</span>}
                  </>
                }
                aside={
                  <Link to={`/projects/${p.id}`} className={`btn btn--sm hide-mobile${p.publishedSlug ? '' : ' btn--primary'}`} tabIndex={-1} aria-hidden="true">
                    {p.publishedSlug ? 'Update' : 'Name it'}
                  </Link>
                }
              />
            ))}
          </ListBox>
        </div>
      )}
    </div>
  )
}
