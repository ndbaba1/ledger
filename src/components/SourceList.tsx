import type { Source } from '../api/types'
import { SOURCE_KIND_LABEL } from '../lib/sources'
import { SourceIcon, SourceStatusLabel } from './Tags'

/** The list of sources behind a draft or record; `activeKey` highlights one. */
export function SourceList({ sources, activeKey }: { sources: Source[]; activeKey?: string }) {
  return (
    <ul className="source-list">
      {sources.map((s) => (
        <li
          key={s.key}
          id={`source-${s.key}`}
          className={`source${activeKey === s.key ? ' source--active' : ''}`}
          aria-current={activeKey === s.key ? 'true' : undefined}
        >
          <span className="source__key">{s.key}</span>
          <span className="source__icon" title={SOURCE_KIND_LABEL[s.kind]}>
            <SourceIcon kind={s.kind} />
          </span>
          <span className="source__body">
            <span className="source__title">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
              {s.hops === 0 && s.kind !== 'doc' && <span className="mini-tag">anchor</span>}
            </span>
            <span className="source__detail">{s.detail}</span>
          </span>
          <SourceStatusLabel status={s.status} />
        </li>
      ))}
    </ul>
  )
}
