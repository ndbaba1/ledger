import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { tokenizeInline } from '../lib/inline'

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

/** Paragraphs with "- " bullet lines turned into lists. */
export function RichBody({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const line of text.split('\n')) {
    const isItem = line.startsWith('- ')
    const last = blocks[blocks.length - 1]
    if (last && last.list === isItem && isItem) last.lines.push(line.slice(2))
    else blocks.push({ list: isItem, lines: [isItem ? line.slice(2) : line] })
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="prose-list">
            {b.lines.map((l, j) => (
              <li key={j}>
                <Inline text={l} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="prose">
            <Inline text={b.lines.join(' ')} />
          </p>
        ),
      )}
    </>
  )
}
