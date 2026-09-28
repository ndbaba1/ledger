import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { PublicLayout } from '../app/PublicLayout'
import { useSession } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { RichBody } from '../components/Inline'
import { ErrorState, Loading } from '../components/States'
import { TypeTag, VerifiedBadge } from '../components/Tags'
import { useQuery } from '../lib/useAsync'
import { shortDate } from '../lib/format'
import { postMinutes } from '../lib/publicPost'

export function PostScreen() {
  const { handle = '', slug = '' } = useParams()
  const api = useApi()
  const location = useLocation()
  const { me } = useSession()
  const data = useQuery(() => api.getPost(handle, slug), [api, handle, slug])
  const [banner, setBanner] = useState(Boolean((location.state as { justPublished?: boolean } | null)?.justPublished))

  if (data.error)
    return (
      <PublicLayout>
        <ErrorState error={data.error} onRetry={data.reload} />
      </PublicLayout>
    )
  if (!data.data)
    return (
      <PublicLayout>
        <Loading label="Loading post" />
      </PublicLayout>
    )

  const { post, author } = data.data
  const isMe = author.id === me.id

  return (
    <PublicLayout>
      <article className="post">
        <Link to={`/u/${author.handle}`} className="row gap-6 small muted back-link">
          <Icon name="arrowLeft" size={14} /> @{author.handle}
        </Link>

        {banner && (
          <div className="banner banner--green" role="status">
            <Icon name="check" size={16} />
            <span>Your post is live. Share the link — the verification badges travel with it.</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setBanner(false)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        <header className="stack gap-14">
          <div className="row gap-8 wrap">
            <TypeTag type={post.type} />
            <span className="mono muted small">{post.tags.join(' · ')}</span>
          </div>
          <h1 className="post__title">{post.title}</h1>
          <div className="row gap-10 wrap">
            <Avatar user={author} size="md" />
            <div className="stack">
              <span className="strong">{author.name}</span>
              <span className="mono small muted">
                @{author.handle}
                {post.employerLine && ` · ${post.employerLine}`} · <time dateTime={post.publishedAt}>{shortDate(post.publishedAt)}</time> · {postMinutes(post)} min read
              </span>
            </div>
          </div>
          {post.badges.length > 0 && (
            <div className="row gap-8 wrap">
              {post.badges.map((b) => (
                <VerifiedBadge key={b.label + b.detail} label={b.label} detail={b.detail} url={b.url} />
              ))}
            </div>
          )}
        </header>

        <div className="stack gap-24 post__body">
          {post.sections.map((s) => (
            <section key={s.heading} className="stack gap-8">
              <h2 className="post__h2">{s.heading}</h2>
              <RichBody text={s.body} />
            </section>
          ))}
        </div>

        {isMe && post.promotedFromRecordId && (
          <div className="panel row gap-10 wrap small">
            <Icon name="lock" size={14} className="muted" />
            <span className="muted">Only you see this: promoted from team record {post.promotedFromRecordId}.</span>
            <Link to={`/records/${post.promotedFromRecordId}/promote`} className="push-right">
              Edit redactions
            </Link>
          </div>
        )}
      </article>
    </PublicLayout>
  )
}
