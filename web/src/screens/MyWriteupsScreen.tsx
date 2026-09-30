import { Link } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { PublicLayout } from '../app/PublicLayout'
import { useMe } from '../app/session'
import { Icon } from '../components/Icon'
import { KindMeta, ListBox, ListHeader, ListRow } from '../components/ListBox'
import { Empty, ErrorState, Loading } from '../components/States'
import { relativeTime, shortDate } from '../lib/format'
import { useQuery } from '../lib/useAsync'

/** Live mode's stand-in for the workspace: a signed-in user's own drafts and published posts. */
export function MyWriteupsScreen() {
  const api = useApi()
  const me = useMe()!
  const data = useQuery(() => Promise.all([api.listWriteups(), api.getProfile(me.handle)]), [api, me.handle])
  const [drafts, profile] = data.data ?? [undefined, undefined]

  return (
    <PublicLayout>
      <div className="page page--narrow">
        <header className="page-head">
          <div>
            <h1 className="page-title">Your write-ups</h1>
            <p className="page-sub">Drafts stay private to you until you publish them to your profile.</p>
          </div>
          <Link to="/new" className="btn btn--primary">
            <Icon name="plus" size={15} strokeWidth={2.5} />
            New write-up
          </Link>
        </header>

        {data.error && <ErrorState error={data.error} onRetry={data.reload} />}
        {!data.data && !data.error && <Loading label="Loading your write-ups" />}

        {drafts && profile && (
          <div className="stack gap-24">
            <ListBox
              labelledBy="my-drafts"
              header={<ListHeader id="my-drafts" icon={<Icon name="book" size={16} />} title="Drafts" count={drafts.length} />}
              footer={
                drafts.length === 0 && (
                  <div className="feed__empty">
                    <Empty title="No drafts yet">
                      <Link to="/new">Start a write-up</Link> and it'll show up here.
                    </Empty>
                  </div>
                )
              }
            >
              {drafts.map((w) => (
                <ListRow
                  key={w.id}
                  to={`/write/${w.id}`}
                  title={w.title || 'Untitled write-up'}
                  meta={
                    <>
                      <KindMeta type={w.type} />
                      <span>Saved {relativeTime(w.updatedAt)}</span>
                    </>
                  }
                />
              ))}
            </ListBox>

            <ListBox
              labelledBy="my-published"
              header={
                <ListHeader id="my-published" icon={<Icon name="check" size={16} />} title="Published" count={profile.posts.length} />
              }
              footer={
                profile.posts.length === 0 && (
                  <div className="feed__empty">
                    <Empty title="Nothing published yet" />
                  </div>
                )
              }
            >
              {profile.posts.map((post) => (
                <ListRow
                  key={post.slug}
                  to={`/u/${me.handle}/${post.slug}`}
                  title={post.title}
                  meta={
                    <>
                      <KindMeta type={post.type} />
                      <span>Published {shortDate(post.publishedAt)}</span>
                    </>
                  }
                />
              ))}
            </ListBox>
          </div>
        )}
      </div>
    </PublicLayout>
  )
}
