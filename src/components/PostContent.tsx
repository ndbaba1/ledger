import type { ReactNode } from 'react'
import type { PostSection, RecordType, ResultMetric } from '../api/types'
import { Icon } from './Icon'
import { Markdown } from './Inline'

const KIND_LABEL: Record<RecordType, string> = {
  incident: 'Production incident',
  investigation: 'Investigation',
  decision: 'Architecture decision',
  design: 'System design',
}

/** Sentence-case type pill used on posts and record cards. */
export function KindPill({ type }: { type: RecordType }) {
  return <span className={`kind-pill kind-pill--${type}`}>{KIND_LABEL[type]}</span>
}

interface PostContentProps {
  decision?: string
  sections: PostSection[]
  result?: ResultMetric
  lesson?: string
  /** Extra blocks shown after the sections, before the result (e.g. a detection query). */
  extra?: ReactNode
  /** Renders a run of text: plain inline markup for a post, highlighted redactions for a preview. */
  render: (text: string) => ReactNode
}

/** The body of a write-up: decision, labeled sections, result and lesson. Shared by posts and the promote preview. */
export function PostContent({ decision, sections, result, lesson, extra, render }: PostContentProps) {
  return (
    <div className="post-content">
      {decision && (
        <section className="decided" aria-labelledby="decided-label">
          <span id="decided-label" className="decided__label">
            <Icon name="check" size={14} strokeWidth={2.5} />
            Decided
          </span>
          <div className="decided__text stack gap-10">
            <Markdown text={decision} render={render} paragraphClass="" />
          </div>
        </section>
      )}

      {sections.map((s) => (
        <section key={s.heading} className="post-section">
          <h2 className="post-section__label">{s.heading}</h2>
          <SectionBody section={s} render={render} />
        </section>
      ))}

      {extra}

      {result && (
        <section className="post-section">
          <h2 className="post-section__label">Result</h2>
          <div className="result">
            <span className="result__label">{result.label}</span>
            <span className="result__value">
              {result.before} <span aria-label="to">→</span> {result.after}
            </span>
          </div>
        </section>
      )}

      {lesson && (
        <section className="lesson-box" aria-labelledby="lesson-label">
          <h2 id="lesson-label" className="post-section__label">
            Lesson
          </h2>
          <div className="lesson-box__text stack gap-10">
            <Markdown text={lesson} render={render} paragraphClass="" />
          </div>
        </section>
      )}
    </div>
  )
}

function SectionBody({ section, render }: { section: PostSection; render: (text: string) => ReactNode }) {
  const kind = section.kind ?? 'text'
  const items = section.body
    .split('\n')
    .filter(Boolean)
    .map((l) => l.replace(/^- /, ''))

  if (kind === 'dead_ends' || kind === 'rejected') {
    return (
      <ol className="steps">
        {items.map((item, i) => (
          <li key={i} className="steps__row">
            <span className="steps__n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="steps__text">
              <span className={`steps__mark steps__mark--${kind}`}>{kind === 'dead_ends' ? 'Dead end —' : 'Rejected —'}</span>{' '}
              {render(item)}
            </span>
          </li>
        ))}
      </ol>
    )
  }
  if (kind === 'flow') {
    return (
      <ol className="flow" aria-label={`${section.heading}: ${items.length} steps`}>
        {items.map((item, i) => (
          <li key={i} className="flow__step">
            <span className="flow__box">{render(item)}</span>
            {i < items.length - 1 && (
              <span className="flow__arrow" aria-hidden="true">
                <Icon name="arrowRight" size={16} />
              </span>
            )}
          </li>
        ))}
      </ol>
    )
  }
  if (kind === 'list') {
    return (
      <ul className="prose-list post-list">
        {items.map((item, i) => (
          <li key={i}>{render(item)}</li>
        ))}
      </ul>
    )
  }
  return (
    <div className="post-text stack gap-12">
      <Markdown text={section.body} render={render} paragraphClass="" />
    </div>
  )
}
