import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { RecordType } from '../api/types'

/**
 * The one list style used across EngLog: a single bordered box with a header
 * line and divider rows. Explore, topics, profiles, records, search, the
 * inbox and cases all use it.
 */
export function ListBox({
  labelledBy,
  header,
  children,
  footer,
  className,
}: {
  labelledBy?: string
  header?: ReactNode
  /** `<ListRow>`s, or any `<li>`s. */
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className={`feed${className ? ` ${className}` : ''}`} aria-labelledby={labelledBy}>
      {header && <div className="feed__head">{header}</div>}
      {hasRows && <ul className="feed__list">{children}</ul>}
      {footer}
    </section>
  )
}

/** The header line: an icon, a title and a count, with room for actions on the right. */
export function ListHeader({
  id,
  icon,
  title,
  count,
  children,
}: {
  id: string
  icon?: ReactNode
  title: string
  count?: ReactNode
  /** Right-aligned actions such as a filter menu. */
  children?: ReactNode
}) {
  return (
    <>
      {icon}
      <h2 id={id} className="feed__title">
        {title}
      </h2>
      {count !== undefined && count !== null && count !== false && (
        <span className="feed__count small muted" aria-live="polite">
          · {count}
        </span>
      )}
      {children}
    </>
  )
}

/** One row: optional lead (avatar), title, a short summary, a metadata line, and an optional action on the right. */
export function ListRow({
  title,
  to,
  lead,
  kicker,
  summary,
  meta,
  aside,
}: {
  title: ReactNode
  to?: string
  lead?: ReactNode
  /** A small line above the title, for status. */
  kicker?: ReactNode
  summary?: ReactNode
  meta?: ReactNode
  aside?: ReactNode
}) {
  return (
    <li>
      <article className="feed-row">
        <div className="feed-row__main">
          {kicker && <div className="feed-row__meta">{kicker}</div>}
          <div className="feed-row__title">
            {lead}
            <h3>{to ? <Link to={to}>{title}</Link> : title}</h3>
          </div>
          {summary && <p className="feed-row__summary">{summary}</p>}
          {meta && <div className="feed-row__meta">{meta}</div>}
        </div>
        {aside && <div className="feed-row__aside">{aside}</div>}
      </article>
    </li>
  )
}

const KIND_NAME: Record<RecordType, string> = {
  incident: 'Incident',
  investigation: 'Investigation',
  decision: 'Decision',
  design: 'Design',
}

/** The write-up type as a colored dot and a word, like a repo's language. */
export function KindMeta({ type }: { type: RecordType }) {
  return (
    <span className="feed-row__kind">
      <span className={`kind-dot kind-dot--${type}`} aria-hidden="true" />
      {KIND_NAME[type]}
    </span>
  )
}
