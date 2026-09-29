import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { PublicLayout } from '../app/PublicLayout'
import { useMe } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Inline } from '../components/Inline'
import { KindPill, PostContent } from '../components/PostContent'
import { HitButton, PublicQA } from '../components/PublicQA'
import type { PostThread, PublicPost } from '../api/types'
import { ErrorState, Loading } from '../components/States'
import { features } from '../lib/features'
import { shortDate } from '../lib/format'
import { postMinutes } from '../lib/publicPost'
import { useQuery } from '../lib/useAsync'

export function PostScreen() {
  const { handle = '', slug = '' } = useParams()
  const api = useApi()
  const location = useLocation()
  const me = useMe()
  const data = useQuery(
    () => Promise.all([api.getPost(handle, slug), api.getProfile(handle), api.getThread(handle, slug)]),
    [api, handle, slug],
  )
  const [thread, setThread] = useState<PostThread>()
  const [postOverride, setPostOverride] = useState<PublicPost>()
  useEffect(() => {
    setThread(data.data?.[2])
    setPostOverride(undefined)
  }, [data.data])
  const [banner, setBanner] = useState(Boolean((location.state as { justPublished?: boolean } | null)?.justPublished))

  if (data.error)
    return (
      <PublicLayout>
        <ErrorState error={data.error} onRetry={data.reload} />
      </PublicLayout>
    )
  if (!data.data || data.data[0].post.slug !== slug)
    return (
      <PublicLayout>
        <Loading label="Loading post" />
      </PublicLayout>
    )

  const [{ post: loadedPost, author }, profile, loadedThread] = data.data
  const post = postOverride ?? loadedPost
  const currentThread = thread ?? loadedThread
  const isMe = me?.id === author.id
  const more = profile.posts.filter((p) => p.slug !== post.slug).slice(0, 3)
  const partOf = features.projects ? profile.projects?.find((p) => p.records.some((r) => r.postSlug === post.slug)) : undefined

  return (
    <PublicLayout>
      <div className="post-page">
        <article className="post-main">
          <nav className="post-crumbs" aria-label="Breadcrumb">
            <Link to={`/u/${author.handle}`}>@{author.handle}</Link>
            <span aria-hidden="true">/</span>
            <span className="truncate" aria-current="page">
              {post.title}
            </span>
          </nav>

          {banner && (
            <div className="banner banner--green" role="status">
              <Icon name="check" size={16} />
              <span>Your post is live. Share the link — the verification badges travel with it.</span>
              <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setBanner(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          )}

          <header className="post-head">
            <div className="row gap-10 wrap">
              <KindPill type={post.type} />
              {post.tags.map((t) => (
                <Link key={t} to={`/t/${t}`} className="post-head__tag">
                  #{t}
                </Link>
              ))}
            </div>
            <h1 className="post-head__title">{post.title}</h1>
            {partOf && (
              <Link to={`/u/${author.handle}/projects/${partOf.slug}`} className="part-of">
                <Icon name="folder" size={13} />
                Part of <strong>{partOf.title}</strong>
              </Link>
            )}
            <div className="post-head__meta">
              <Avatar user={author} size="sm" />
              <span>
                <strong className="text">{author.name}</strong>
                {post.employerLine && ` ${post.employerLine}`} · published{' '}
                <time dateTime={post.publishedAt}>{shortDate(post.publishedAt)}</time> · {postMinutes(post)} min read
                {post.context && <> · {post.context}</>}
              </span>
            </div>
          </header>

          <PostContent
            decision={post.decision}
            sections={
              post.followUps?.length
                ? [...post.sections, { heading: 'Follow-ups', kind: 'list' as const, body: post.followUps.map((f) => `- ${f}`).join('\n') }]
                : post.sections
            }
            result={post.result}
            lesson={post.lesson}
            render={(text) => <Inline text={text} />}
          />

          <div className="hit-row">
            <HitButton handle={handle} slug={slug} isAuthor={isMe} thread={currentThread} onThread={setThread} />
            <span className="small muted">
              {isMe ? 'Engineers who ran into the same problem.' : 'Ran into the same problem? Let the author know it’s not just them.'}
            </span>
          </div>

          {features.publicQA && (
            <PublicQA
              handle={handle}
              slug={slug}
              author={author}
              isAuthor={isMe}
              thread={currentThread}
              onThread={setThread}
              onPost={setPostOverride}
            />
          )}

          {features.workspace && isMe && post.promotedFromRecordId && (
            <div className="owner-bar">
              <Icon name="lock" size={13} />
              <span>
                Only you see this · from team record <span className="mono">{post.promotedFromRecordId}</span>
              </span>
              <Link to={`/records/${post.promotedFromRecordId}/promote`} className="push-right">
                Edit redactions
              </Link>
            </div>
          )}
        </article>

        <aside className="post-rail" aria-label="Evidence and more write-ups">
          {post.badges.length > 0 && (
            <section className="stack gap-12" aria-labelledby="evidence-title">
              <h2 id="evidence-title" className="post-section__label">
                Evidence
              </h2>
              <ul className="evidence-list">
                {post.badges.map((b) => {
                  const body = (
                    <>
                      <span className="evidence-list__label">{b.label}</span>
                      {b.detail && <span className="evidence-list__detail">{b.detail}</span>}
                    </>
                  )
                  return (
                    <li key={b.label + b.detail} className="evidence-list__item">
                      <Icon name="check" size={15} strokeWidth={2.5} className="text-green" />
                      {b.url ? (
                        <a href={b.url} target="_blank" rel="noreferrer" className="evidence-list__body">
                          {body}
                        </a>
                      ) : (
                        <span className="evidence-list__body">{body}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="small muted">Checked against GitLab and GitHub when published. Private work is verified without showing the code or company.</p>
            </section>
          )}

          {more.length > 0 && (
            <section className="stack gap-12" aria-labelledby="more-title">
              <h2 id="more-title" className="post-section__label">
                More from @{author.handle}
              </h2>
              {more.map((p) => (
                <Link key={p.slug} to={`/u/${author.handle}/${p.slug}`} className="more-card">
                  <KindPill type={p.type} />
                  <span className="more-card__title">{p.title}</span>
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </PublicLayout>
  )
}
