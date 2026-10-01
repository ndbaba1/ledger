import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { ID, Writeup } from '../api/types'
import { PublicLayout } from '../app/PublicLayout'
import { useMe } from '../app/session'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { KindMeta, ListBox, ListHeader, ListRow } from '../components/ListBox'
import { Empty, ErrorState, Loading } from '../components/States'
import { relativeTime, shortDate } from '../lib/format'
import { useQuery } from '../lib/useAsync'

/** Live mode's stand-in for the workspace: a signed-in user's own drafts and published posts. */
export function MyWriteupsScreen() {
  const api = useApi()
  const me = useMe()!
  const location = useLocation()
  const [justDeleted, setJustDeleted] = useState(Boolean((location.state as { justDeleted?: boolean } | null)?.justDeleted))
  const data = useQuery(() => Promise.all([api.listWriteups(), api.getProfile(me.handle)]), [api, me.handle])
  const [drafts, profile] = data.data ?? [undefined, undefined]

  const handleDeleted = (id: ID) => {
    if (!data.data) return
    data.setData([data.data[0].filter((w) => w.id !== id), data.data[1]])
  }

  return (
    <PublicLayout>
      <div className="page page--narrow">
        <header className="page-head">
          <div>
            <h1 className="page-title">Your records</h1>
            <p className="page-sub">Drafts stay private to you until you publish them to your profile.</p>
          </div>
          <Link to="/new" className="btn btn--primary">
            <Icon name="plus" size={15} strokeWidth={2.5} />
            New write-up
          </Link>
        </header>

        {justDeleted && (
          <div className="banner banner--green" role="status">
            <Icon name="check" size={16} />
            <span>Draft deleted.</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setJustDeleted(false)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {data.error && <ErrorState error={data.error} onRetry={data.reload} />}
        {!data.data && !data.error && <Loading label="Loading your records" />}

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
                <DraftRow key={w.id} writeup={w} onDeleted={handleDeleted} />
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

/** One draft row, with its own delete confirmation — same inline-confirm pattern as a workspace member row. */
function DraftRow({ writeup, onDeleted }: { writeup: Writeup; onDeleted: (id: ID) => void }) {
  const api = useApi()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const confirmDelete = async () => {
    setPending(true)
    setError(undefined)
    try {
      await api.deleteWriteup(writeup.id)
      onDeleted(writeup.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  if (confirming) {
    return (
      <li>
        <ConfirmDialog
          title="Delete this draft?"
          message="This can't be undone."
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          pending={pending}
          error={error}
          onConfirm={confirmDelete}
          onCancel={() => setConfirming(false)}
        />
      </li>
    )
  }

  return (
    <ListRow
      to={`/write/${writeup.id}`}
      title={writeup.title || 'Untitled record'}
      meta={
        <>
          <KindMeta type={writeup.type} />
          <span>Saved {relativeTime(writeup.updatedAt)}</span>
        </>
      }
      aside={
        <button type="button" className="icon-btn" aria-label={`Delete ${writeup.title || 'draft'}`} onClick={() => setConfirming(true)}>
          <Icon name="x" size={14} />
        </button>
      }
    />
  )
}
