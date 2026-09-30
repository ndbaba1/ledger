import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { RecordType } from '../api/types'
import { PublicLayout } from '../app/PublicLayout'
import { useMe, useSetMe } from '../app/session'
import { Icon } from '../components/Icon'
import { Empty, ErrorState, Loading } from '../components/States'
import { FeedList, FilterMenu } from '../components/FeedList'
import { ListBox, ListHeader } from '../components/ListBox'
import { ProfileHeader, type ProfileEditField } from '../components/ProfileHeader'
import { ProfileHeaderEditor } from '../components/ProfileHeaderEditor'
import { ProjectSummary } from '../components/ProjectSummary'
import { features } from '../lib/features'
import { useQuery } from '../lib/useAsync'

const TABS: { key: RecordType | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'incident', label: 'Incidents' },
  { key: 'investigation', label: 'Investigations' },
  { key: 'decision', label: 'Decisions' },
  { key: 'design', label: 'Designs' },
]

export function ProfileScreen() {
  const { handle = '' } = useParams()
  const api = useApi()
  const me = useMe()
  const setMe = useSetMe()
  const profile = useQuery(() => api.getProfile(handle), [api, handle])
  const [tab, setTab] = useState<RecordType | 'all'>('all')
  const [searchParams, setSearchParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [focusField, setFocusField] = useState<ProfileEditField>('name')

  const isMe = profile.data?.user.id === me?.id

  // ?edit=1 opens the editor straight away (see the /me/profile redirect);
  // strip it from the URL so refreshing/sharing the link doesn't reopen it.
  useEffect(() => {
    if (!isMe || searchParams.get('edit') !== '1') return
    setEditing(true)
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMe])

  const closeEditing = () => {
    setEditing(false)
    document.getElementById('profile-edit-button')?.focus()
  }

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

  const data = profile.data
  const { user, posts, projects = [], hitByViewer = [], verifiedPRs, repos } = data
  const visible = posts.filter((p) => tab === 'all' || p.type === tab)
  const verifiedFallback = posts.flatMap((p) => p.badges).filter((b) => b.verified).length

  return (
    <PublicLayout>
      <div className="profile">
        <div className="profile__main stack gap-24">
          {editing ? (
            <ProfileHeaderEditor
              user={user}
              focus={focusField}
              onSaved={(updated) => {
                profile.setData({ ...data, user: updated })
                setMe(updated)
                closeEditing()
              }}
              onCancel={closeEditing}
            />
          ) : (
            <ProfileHeader
              user={user}
              isMe={isMe}
              onEdit={(field) => {
                setFocusField(field ?? 'name')
                setEditing(true)
              }}
            />
          )}

          {features.projects && projects.length > 0 && (
            <ListBox
              labelledBy="profile-projects"
              header={
                <ListHeader id="profile-projects" icon={<Icon name="folder" size={16} />} title="Projects" count={projects.length}>
                  {isMe && (
                    <Link to="/inbox#projects" className="btn-link push-right">
                      Add a project
                    </Link>
                  )}
                </ListHeader>
              }
            >
              {projects.map((p) => (
                <li key={p.slug}>
                  <ProjectSummary project={p} handle={user.handle} />
                </li>
              ))}
            </ListBox>
          )}

          <FeedList
            labelledBy="profile-posts"
            showAuthor={false}
            items={visible.map((post) => ({ post, author: user, hitByMe: hitByViewer.includes(post.slug) }))}
            header={
              <ListHeader
                id="profile-posts"
                icon={<Icon name="book" size={16} />}
                title="Records"
                count={tab === 'all' ? posts.length : `${visible.length} of ${posts.length}`}
              >
                {posts.length > 0 && (
                  <span className="push-right">
                    <FilterMenu
                      options={TABS.flatMap((t) => {
                        const n = t.key === 'all' ? posts.length : posts.filter((p) => p.type === t.key).length
                        return t.key !== 'all' && n === 0 ? [] : [{ key: t.key, label: `${t.label} · ${n}` }]
                      })}
                      value={tab}
                      onChange={setTab}
                    />
                  </span>
                )}
              </ListHeader>
            }
            footer={
              visible.length === 0 && (
                <div className="feed__empty">
                  <Empty title="No records yet">
                    {isMe ? (
                      features.workspace ? (
                        <>
                          Promote a <Link to="/records">team record</Link> to publish your first one.
                        </>
                      ) : (
                        <>
                          Solved something like this? <Link to="/new">Write it up</Link> — it could be your first one.
                        </>
                      )
                    ) : null}
                  </Empty>
                </div>
              )
            }
          />
        </div>

        <aside className="profile__side stack gap-16" aria-label="Proof of work">
          <div className="card stack gap-14">
            <h2 className="side-title">Proof of work</h2>
            <div className={repos !== undefined ? 'grid-3 grid-3--tight' : 'grid-2 grid-2--tight'}>
              <div className="stat">
                <span className="stat__n">{posts.length}</span>
                <span className="small muted">records</span>
              </div>
              <div className="stat">
                <span className="stat__n text-green">{verifiedPRs ?? verifiedFallback}</span>
                <span className="small muted">verified PRs</span>
              </div>
              {repos !== undefined && (
                <div className="stat">
                  <span className="stat__n">{repos}</span>
                  <span className="small muted">{repos === 1 ? 'repo' : 'repos'}</span>
                </div>
              )}
            </div>
            <p className="small muted">
              {features.workspace
                ? 'Badges are checked against the source when a record is published. Private work still earns the checkmark, without revealing code or company.'
                : 'Each piece of evidence is checked with GitHub when the record is published.'}
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
          {isMe && features.workspace && (
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
