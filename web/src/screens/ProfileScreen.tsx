import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { RecordType } from '../api/types'
import { PublicLayout } from '../app/PublicLayout'
import { useMe } from '../app/session'
import { Icon } from '../components/Icon'
import { Empty, ErrorState, Loading } from '../components/States'
import { FeedList, FilterMenu } from '../components/FeedList'
import { ListBox, ListHeader } from '../components/ListBox'
import { ProfileHeader } from '../components/ProfileHeader'
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

  const { user, posts, projects = [], hitByViewer = [], verifiedPRs, repos } = profile.data
  const visible = posts.filter((p) => tab === 'all' || p.type === tab)
  const verifiedFallback = posts.flatMap((p) => p.badges).filter((b) => b.verified).length
  const isMe = user.id === me?.id
  const needsProfileContent = isMe && !user.headline && (user.stack?.length ?? 0) === 0

  return (
    <PublicLayout>
      <div className="profile">
        <div className="profile__main stack gap-24">
          <div className="row gap-16 wrap" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <ProfileHeader user={user} />
            </div>
            {isMe && (
              <Link to="/me/profile" className="btn btn--ghost btn--sm">
                Edit profile
              </Link>
            )}
          </div>

          {needsProfileContent && (
            <p className="small muted">
              Add a headline and your stack so readers know what you work on — <Link to="/me/profile">edit your profile</Link>.
            </p>
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
                title="Write-ups"
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
                  <Empty title="No write-ups yet">
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

        <aside className="profile__side stack gap-16" aria-label="Verified activity">
          <div className="card stack gap-14">
            <h2 className="side-title">Proof of work</h2>
            <div className={repos !== undefined ? 'grid-3 grid-3--tight' : 'grid-2 grid-2--tight'}>
              <div className="stat">
                <span className="stat__n">{posts.length}</span>
                <span className="small muted">write-ups</span>
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
                ? 'Badges are checked against the source when a post is published. Private work shows as verified without revealing code or company.'
                : 'Each badge is checked with GitHub when the post is published.'}
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
