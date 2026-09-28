import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { RecordType } from '../api/types'
import { PublicLayout } from '../app/PublicLayout'
import { Avatar } from '../components/Avatar'
import { KindPill } from '../components/PostContent'
import { ErrorState, Loading } from '../components/States'
import { stripInline } from '../lib/inline'
import { useQuery } from '../lib/useAsync'

const TYPE_ORDER: RecordType[] = ['incident', 'investigation', 'decision', 'design']

/** Everything published about one topic, most-hit problems first. Shareable at /t/:tag. */
export function TopicScreen() {
  const { tag = '' } = useParams()
  const api = useApi()
  const topic = useQuery(() => api.getTopic(tag), [api, tag])

  if (topic.error)
    return (
      <PublicLayout>
        <ErrorState error={topic.error} onRetry={topic.reload} />
      </PublicLayout>
    )
  if (!topic.data || topic.data.tag !== tag.toLowerCase())
    return (
      <PublicLayout>
        <Loading label={`Loading #${tag}`} />
      </PublicLayout>
    )

  const { items, related, totalHits } = topic.data
  const byType = TYPE_ORDER.map((t) => [t, items.filter((i) => i.post.type === t).length] as const).filter(([, n]) => n > 0)

  return (
    <PublicLayout>
      <div className="topic">
        <nav className="post-crumbs" aria-label="Breadcrumb">
          <Link to="/">Explore</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">#{topic.data.tag}</span>
        </nav>

        <header className="topic__head">
          <h1 className="topic__title">
            <span className="topic__hash">#</span>
            {topic.data.tag}
          </h1>
          <p className="topic__sub">
            {items.length} verified write-up{items.length === 1 ? '' : 's'}
            {totalHits > 0 && ` · ${totalHits} engineers hit these problems`} ·{' '}
            {byType.map(([t, n]) => `${n} ${t}${n === 1 ? '' : 's'}`).join(', ')}
          </p>
        </header>

        <div className="topic__body">
          <section aria-labelledby="topic-list" className="stack gap-14">
            <h2 id="topic-list" className="eyebrow">
              Most-hit problems first
            </h2>
            <ol className="topic__list">
              {items.map(({ post, author }, i) => (
                <li key={`${author.handle}/${post.slug}`} className="topic-row">
                  <span className="topic-row__rank" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="stack gap-8">
                    <div className="row gap-8 wrap">
                      <KindPill type={post.type} />
                      {typeof post.hitCount === 'number' && post.hitCount > 0 && (
                        <span className="topic-row__hits">
                          {post.hitCount} hit this
                        </span>
                      )}
                    </div>
                    <h3 className="feed-card__title">
                      <Link to={`/u/${author.handle}/${post.slug}`} className="topic-row__link">
                        {post.title}
                      </Link>
                    </h3>
                    <p className="card-excerpt">{stripInline(post.lesson ?? post.summary)}</p>
                    <Link to={`/u/${author.handle}`} className="feed-card__author small">
                      <Avatar user={author} size="xs" />
                      {author.name}
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {related.length > 0 && (
            <aside className="stack gap-10" aria-labelledby="related-topics">
              <h2 id="related-topics" className="eyebrow">
                Often seen with
              </h2>
              <div className="row gap-6 wrap">
                {related.map((r) => (
                  <Link key={r.tag} to={`/t/${r.tag}`} className="chip chip--btn">
                    #{r.tag}
                    <span className="muted chip__count">{r.count}</span>
                  </Link>
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </PublicLayout>
  )
}
