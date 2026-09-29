import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { tokenizeInline } from '../lib/inline'
import { parseBlocks } from '../lib/markdown'

interface InlineProps {
  text: string
  /** Called when a citation chip is pressed; omit to render citations as plain chips. */
  onCite?: (key: string) => void
  activeCite?: string
  /** Where a numbered reference like [1] should link; omit to show plain chips. */
  refHref?: (n: number) => string | undefined
}

/** Renders `code` spans and [S1] citation chips inside running text. */
export function Inline({ text, onCite, activeCite, refHref }: InlineProps) {
  return (
    <>
      {tokenizeInline(text).map((t, i) => {
        if (t.type === 'text') return <Fragment key={i}>{t.value}</Fragment>
        if (t.type === 'code') return <code key={i} className="code-inline">{t.value}</code>
        if (t.type === 'bold')
          return (
            <strong key={i}>
              <Inline text={t.value} onCite={onCite} activeCite={activeCite} refHref={refHref} />
            </strong>
          )
        if (t.type === 'italic')
          return (
            <em key={i}>
              <Inline text={t.value} onCite={onCite} activeCite={activeCite} refHref={refHref} />
            </em>
          )
        if (t.type === 'link')
          return (
            <a key={i} href={t.href} target="_blank" rel="noreferrer noopener" className="text-link">
              {t.text}
            </a>
          )
        if (t.type === 'ref') {
          const href = refHref?.(t.n)
          return href ? (
            <Link key={i} to={href} className="ref" aria-label={`Record ${t.n}`}>
              {t.n}
            </Link>
          ) : (
            <span key={i} className="ref">
              {t.n}
            </span>
          )
        }
        const active = activeCite === t.key
        return onCite ? (
          <button
            key={i}
            type="button"
            className={`cite${active ? ' cite--active' : ''}`}
            onClick={() => onCite(t.key)}
            aria-label={`Show source ${t.key}`}
            aria-pressed={active}
          >
            {t.key}
          </button>
        ) : (
          <span key={i} className="cite">
            {t.key}
          </span>
        )
      })}
    </>
  )
}

/**
 * Block-level Markdown: paragraphs, bullet and numbered lists, fenced code.
 * `render` draws each run of inline text, so callers can highlight redactions.
 */
export function Markdown({
  text,
  render = (t) => <Inline text={t} />,
  paragraphClass = 'prose',
}: {
  text: string
  render?: (text: string) => ReactNode
  paragraphClass?: string
}) {
  return (
    <>
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'p')
          return (
            <p key={i} className={paragraphClass}>
              {render(b.text)}
            </p>
          )
        if (b.type === 'code')
          return (
            <pre key={i} className="code-block">
              <code>{b.code}</code>
            </pre>
          )
        const items = b.items.map((item, j) => <li key={j}>{render(item)}</li>)
        return b.type === 'ul' ? (
          <ul key={i} className="prose-list">
            {items}
          </ul>
        ) : (
          <ol key={i} className="prose-list prose-list--numbered" start={b.start}>
            {items}
          </ol>
        )
      })}
    </>
  )
}

/** @deprecated use Markdown */
export const RichBody = ({ text }: { text: string }) => <Markdown text={text} />
