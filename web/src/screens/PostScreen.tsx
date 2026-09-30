import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { PublicLayout } from '../app/PublicLayout'
import { useMe } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Inline, Markdown } from '../components/Inline'
import { KindPill, PostContent } from '../components/PostContent'
import { HitButton, PublicQA } from '../components/PublicQA'
import type { PostThread, PublicPost, User, VerifiedEvidenceItem } from '../api/types'
import { ErrorState, Loading } from '../components/States'
import { features } from '../lib/features'
import { monthYear, shortDate, slugifyHeading } from '../lib/format'
import { evidenceCountLabel, groupVerifiedEvidence, postMinutes, type EvidenceGroup } from '../lib/publicPost'
import { useQuery } from '../lib/useAsync'

/** Section headings for the "On this page" nav, in reading order. */
function onThisPageHeadings(post: PublicPost): string[] {
  return [
    ...post.sections.map((s) => s.heading),
    ...(post.followUps?.length ? ['Follow-ups'] : []),
    ...(features.publicQA ? ['Ask the author'] : []),
  ]
}

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
  const navState = location.state as { justPublished?: boolean; justUpdated?: boolean } | null
  const [banner, setBanner] = useState(Boolean(navState?.justPublished || navState?.justUpdated))
  const justUpdated = Boolean(navState?.justUpdated)
  const highlighted = useRef<string | undefined>(undefined)

  // Deep-links to a question (#q-<id>) scroll to it and highlight it briefly.
  useEffect(() => {
    const id = location.hash.replace('#', '')
    if (!id || !data.data || highlighted.current === id) return
    const el = document.getElementById(id)
    if (!el) return
    highlighted.current = id
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('qa__thread--highlight')
    const t = setTimeout(() => el.classList.remove('qa__thread--highlight'), 2500)
    return () => clearTimeout(t)
  }, [location.hash, data.data])

  const [activeAnchor, setActiveAnchor] = useState<string>()

  // Highlights the "On this page" entry for whichever section is nearest
  // the top of the viewport. Tracks visibility across callbacks (only
  // changed entries are reported) rather than trusting any single one.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !data.data) return
    const current = postOverride ?? data.data[0].post
    const ids = onThisPageHeadings(current).map(slugifyHeading)
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el))
    if (elements.length === 0) return

    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const active = ids.find((id) => visible.has(id))
        if (active) setActiveAnchor(active)
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [data.data, postOverride])

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
  const revisions = post.revisions ?? []
  const updatedAt = revisions[0]?.createdAt
  const askersById = new Map(currentThread.askers.map((u) => [u.id, u]))
  const onThisPage = onThisPageHeadings(post)
  // Live posts always set `evidence` (unverified/plain links) and
  // `verifiedEvidence` (grouped by badge type), even when empty; mock posts
  // never set either, and only ever have the already-verified flat `badges`.
  const isLivePost = post.evidence !== undefined || post.verifiedEvidence !== undefined
  const verifiedGroups = isLivePost ? groupVerifiedEvidence(post.verifiedEvidence ?? []) : []
  const flatEvidence = isLivePost ? (post.evidence ?? []) : post.badges
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
            {isMe && post.writeupId && (
              <Link to={`/write/${post.writeupId}`} className="btn btn--ghost btn--sm push-right">
                <Icon name="pencil" size={13} />
                Edit post
              </Link>
            )}
          </nav>

          {banner && (
            <div className="banner banner--green" role="status">
              <Icon name="check" size={16} />
              <span>
                {justUpdated ? 'Your update is live.' : 'Your post is live. Share the link — the verification badges travel with it.'}
              </span>
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
                <time dateTime={post.publishedAt}>{shortDate(post.publishedAt)}</time>
                {updatedAt && (
                  <>
                    {' '}
                    · updated <span className="text"><time dateTime={updatedAt}>{shortDate(updatedAt)}</time></span>
                  </>
                )}{' '}
                · {postMinutes(post)} min read
                {post.context && <> · {post.context}</>}
              </span>
            </div>
          </header>

          <PostContent
            decision={post.decision}
            sections={post.sections}
            result={post.result}
            lesson={post.lesson}
            render={(text) => <Inline text={text} />}
          />

          {post.followUps?.length ? (
            <section id="follow-ups" className="post-section">
              <h2 className="post-section__label">Follow-ups</h2>
              <ul className="followups">
                {post.followUps.map((f, i) => {
                  const asker = f.askerId ? askersById.get(f.askerId) : undefined
                  return (
                    <li key={i}>
                      {f.question && (
                        <strong className="followups__q">
                          <Inline text={f.question} />
                        </strong>
                      )}
                      {asker && (
                        <Link to={`/u/${asker.handle}`} className="small muted followups__asker">
                          Asked by {asker.name}
                        </Link>
                      )}
                      <div className="followups__a">
                        <Markdown text={f.answer} paragraphClass="" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

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

          {revisions.length > 0 && (
            <details className="post-history">
              <summary className="post-section__label">
                History · {revisions.length} change{revisions.length === 1 ? '' : 's'}
              </summary>
              <ol className="post-history__list">
                {revisions.map((r) => (
                  <li key={r.id}>
                    <span className="mono small muted">{shortDate(r.createdAt)}</span>
                    <span className="small">{r.summary}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </article>

        <aside className="post-rail" aria-label="Author, evidence and more records">
          <AuthorCard author={author} />

          {(verifiedGroups.length > 0 || flatEvidence.length > 0) && (
            <section className="stack gap-12 rail-section" aria-labelledby="evidence-title">
              <h2 id="evidence-title" className="post-section__label">
                Evidence
              </h2>
              {verifiedGroups.length > 0 && (
                <div className="stack gap-14">
                  {verifiedGroups.map((group) => (
                    <EvidenceGroupRows key={group.badgeType} group={group} />
                  ))}
                </div>
              )}
              {flatEvidence.length > 0 && (
                <ul className="evidence-list">
                  {flatEvidence.map((b, i) => {
                    const body = (
                      <>
                        <span className="evidence-list__label">{b.label}</span>
                        <span className="evidence-list__detail">{b.verified ? b.detail : 'not verified'}</span>
                      </>
                    )
                    return (
                      <li key={b.url ?? i} className={`evidence-list__item${b.verified ? '' : ' evidence-list__item--unverified'}`}>
                        <Icon name={b.verified ? 'check' : 'link'} size={15} strokeWidth={2.5} className={b.verified ? 'text-green' : 'muted'} />
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
              )}
              <p className="small muted">Each piece of evidence is checked with GitHub when the record is published.</p>
            </section>
          )}

          {onThisPage.length > 0 && (
            <nav className="rail-section" aria-labelledby="on-this-page-title">
              <h2 id="on-this-page-title" className="post-section__label">
                On this page
              </h2>
              <ul className="on-this-page">
                {onThisPage.map((heading) => {
                  const id = slugifyHeading(heading)
                  return (
                    <li key={id}>
                      <Link
                        to={`${location.pathname}#${id}`}
                        className={`on-this-page__link${activeAnchor === id ? ' on-this-page__link--active' : ''}`}
                      >
                        {heading}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          )}

          {more.length > 0 && (
            <section className="stack gap-12 rail-section" aria-labelledby="more-title">
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

/** One badge-type bucket in the grouped Evidence rail: a heading with a count, then compact rows. */
function EvidenceGroupRows({ group }: { group: EvidenceGroup }) {
  const [expanded, setExpanded] = useState(false)
  const truncatable = group.items.length > 5
  const shown = truncatable && !expanded ? group.items.slice(0, 3) : group.items

  return (
    <div className="evidence-group">
      <div className="evidence-group__head">
        <Icon name="check" size={14} strokeWidth={2.5} className="text-green" />
        <span className="evidence-group__label">{group.label}</span>
        <span className="small muted">· {evidenceCountLabel(group.items)}</span>
      </div>
      <ul className="plain-list evidence-group__rows">
        {shown.map((item, i) => (
          <EvidenceGroupRow key={item.url ?? `${group.badgeType}-${i}`} item={item} />
        ))}
      </ul>
      {truncatable && (
        <button type="button" className="btn-link small" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show less' : `+${group.items.length - 3} more`}
        </button>
      )}
    </div>
  )
}

function EvidenceGroupRow({ item }: { item: VerifiedEvidenceItem }) {
  const when = item.date ? monthYear(item.date) : undefined
  return (
    <li className="evidence-group__row">
      {item.private ? (
        <span className="evidence-group__row-title">
          <Icon name="lock" size={11} className="muted" />
          {item.kind === 'github_issue' ? 'Private issue' : 'Private PR'}
        </span>
      ) : (
        <a href={item.url} target="_blank" rel="noreferrer" className="evidence-group__row-title">
          #{item.number} {item.title}
        </a>
      )}
      <span className="small muted evidence-group__row-detail">
        {item.private ? 'private GitHub project' : item.repo}
        {when && ` · ${when}`}
      </span>
    </li>
  )
}

/** Who wrote this, always shown even when there's no evidence or other posts to fill the rail. */
function AuthorCard({ author }: { author: User }) {
  return (
    <section className="author-card" aria-labelledby="author-card-title">
      <Avatar user={author} size="lg" />
      <h2 id="author-card-title" className="author-card__name">
        {author.name}
      </h2>
      <span className="small muted">@{author.handle}</span>
      {author.headline && <p className="small author-card__headline">{author.headline}</p>}
      {author.stack && author.stack.length > 0 && (
        <div className="row gap-6 wrap">
          {author.stack.slice(0, 6).map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
      )}
      <Link to={`/u/${author.handle}`} className="btn btn--ghost btn--sm">
        View profile
      </Link>
    </section>
  )
}
