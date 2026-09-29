import type { Source, SourceExcerpt as Excerpt } from '../api/types'
import { Icon } from './Icon'
import { SourceIcon } from './Tags'

/** The quoted evidence from one source: diff lines or thread messages. */
export function SourceExcerpt({ excerpt }: { excerpt: Excerpt }) {
  if (excerpt.kind === 'diff') {
    return (
      <div className="excerpt excerpt--diff" role="group" aria-label={`Diff of ${excerpt.file}`}>
        <div className="excerpt__file">{excerpt.file}</div>
        <pre className="diff">
          {excerpt.lines.map((l, i) => (
            <span key={i} className={`diff__line diff__line--${l.op === '+' ? 'add' : l.op === '-' ? 'del' : 'ctx'}`}>
              <span className="diff__op" aria-hidden="true">
                {l.op === ' ' ? ' ' : l.op}
              </span>
              <span className="sr-only">{l.op === '+' ? 'added: ' : l.op === '-' ? 'removed: ' : ''}</span>
              {l.text}
              {'\n'}
            </span>
          ))}
        </pre>
      </div>
    )
  }
  return (
    <div className="excerpt excerpt--quotes">
      {excerpt.quotes.map((q, i) => (
        <blockquote key={i} className="quote">
          “{q}”
        </blockquote>
      ))}
    </div>
  )
}

/** "Drafted from": the concrete evidence a record was built on. */
export function DraftedFrom({ sources }: { sources: Source[] }) {
  const quoted = sources.filter((s) => s.excerpt)
  const linked = sources.filter((s) => !s.excerpt && (s.kind === 'link' || s.kind === 'doc'))
  if (!quoted.length && !linked.length) return null

  return (
    <section className="stack gap-14" aria-labelledby="drafted-from">
      <h2 id="drafted-from" className="eyebrow">
        Drafted from
      </h2>
      {quoted.map((s) => (
        <div key={s.key} className="stack gap-8">
          <span className="drafted__head">
            <SourceIcon kind={s.kind} />
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            ) : (
              <span>{s.title}</span>
            )}
            <span className="source__key">{s.key}</span>
          </span>
          <SourceExcerpt excerpt={s.excerpt!} />
        </div>
      ))}
      {linked.length > 0 && (
        <div className="stack gap-6">
          <span className="drafted__head drafted__head--plain">
            <Icon name="link" size={14} />
            Linked evidence
          </span>
          <ul className="plain-list small">
            {linked.map((s) => (
              <li key={s.key} className="row gap-8">
                <span className="source__key">{s.key}</span>
                <span className="muted">{s.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
