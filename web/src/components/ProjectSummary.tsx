import { Link } from 'react-router-dom'
import type { ProjectRecordRef, PublicProject } from '../api/types'
import { Icon } from './Icon'
import { periodLabel, recordCounts } from '../lib/project'

const ROLE: Record<PublicProject['role'], string> = { led: 'Led', contributed: 'Contributed' }

/** A record the project points to: a link when it was published, otherwise a team-only mention. */
function RecordLink({ record, handle }: { record: ProjectRecordRef; handle: string }) {
  if (record.postSlug) return <Link to={`/u/${handle}/${record.postSlug}`}>{record.title}</Link>
  return (
    <span className="project-facts__private" title="A team-only record. Ledger checked it against GitHub but it isn’t public.">
      {record.title}
      <Icon name="lock" size={11} />
    </span>
  )
}

/**
 * The project block: name, then evidence, key decisions and outcome. Only the
 * name is the engineer's own words; every other line is counted or quoted by Ledger.
 */
export function ProjectSummary({
  project,
  handle,
  linkTitle = true,
  showTitle = true,
}: {
  project: PublicProject
  handle: string
  linkTitle?: boolean
  /** Off on the project page, where the title is the page heading. */
  showTitle?: boolean
}) {
  const base = `/u/${handle}/projects/${project.slug}`
  const counts = recordCounts(project.records)
  const { changes } = project
  return (
    <article className="project-row">
      <div className="project-row__head">
        {showTitle && <h3 className="project-row__title">{linkTitle ? <Link to={base}>{project.title}</Link> : project.title}</h3>}
        <span className="project-row__when">
          <span className={`role-tag role-tag--${project.role}`}>{ROLE[project.role]}</span>
          {periodLabel(project.period)}
          {project.employerLine && <span className="hide-mobile"> · {project.employerLine}</span>}
        </span>
      </div>
      <dl className="project-facts">
        <dt>Evidence</dt>
        <dd>
          <span className="project-facts__items">
            {changes.total > 0 && (
              <Link to={`${base}#changes`}>
                {changes.total} merge request{changes.total === 1 ? '' : 's'}
                <span className="muted"> ({changes.authored} authored)</span>
              </Link>
            )}
            {counts.map((c) => (
              <Link key={c.type} to={`${base}#records`}>
                {c.label}
              </Link>
            ))}
          </span>
          <span className="project-facts__verified">
            <Icon name="check" size={11} strokeWidth={3} />
            checked with GitHub
          </span>
        </dd>
        {project.decisions.length > 0 && (
          <>
            <dt>Decisions</dt>
            <dd>
              <ul className="project-facts__list">
                {project.decisions.map((d) => (
                  <li key={d.title}>
                    <RecordLink record={d} handle={handle} />
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {project.outcome && (
          <>
            <dt>Outcome</dt>
            <dd>
              <span className="project-facts__outcome">
                {project.outcome.before} → {project.outcome.after}
              </span>{' '}
              <span className="muted">{project.outcome.label.charAt(0).toLowerCase() + project.outcome.label.slice(1)}</span>
            </dd>
          </>
        )}
      </dl>
    </article>
  )
}
