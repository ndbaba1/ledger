import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { PublicLayout } from '../app/PublicLayout'
import { Avatar } from '../components/Avatar'
import { FeedList } from '../components/FeedList'
import { Icon } from '../components/Icon'
import { KindMeta, ListBox, ListHeader, ListRow } from '../components/ListBox'
import { ProjectSummary } from '../components/ProjectSummary'
import { ErrorState, Loading } from '../components/States'
import { shortDate } from '../lib/format'
import { useQuery } from '../lib/useAsync'

/** A published project: the summary, then every piece of evidence behind it. */
export function ProjectScreen() {
  const { handle = '', slug = '' } = useParams()
  const api = useApi()
  const page = useQuery(() => api.getProject(handle, slug), [api, handle, slug])

  if (page.error)
    return (
      <PublicLayout>
        <ErrorState error={page.error} onRetry={page.reload} />
      </PublicLayout>
    )
  if (!page.data)
    return (
      <PublicLayout>
        <Loading label="Loading project" />
      </PublicLayout>
    )

  const { project, author, posts } = page.data
  const teamOnly = project.records.filter((r) => !r.postSlug)

  return (
    <PublicLayout>
      <div className="project-page stack gap-24">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to={`/u/${author.handle}`} className="row gap-8">
            <Avatar user={author} size="xs" />
            {author.name}
          </Link>
          <span aria-hidden="true">/</span>
          <span>projects</span>
        </nav>

        <header className="stack gap-6">
          <span className="eyebrow">Project</span>
          <h1 className="page-title">{project.title}</h1>
          <p className="small muted">
            The name is {author.name.split(' ')[0]}’s. Everything else on this page was counted or quoted by Ledger from verified
            work{project.employerLine ? ` ${project.employerLine}` : ''}.
          </p>
        </header>

        <div className="feed">
          <ul className="feed__list">
            <li>
              <ProjectSummary project={project} handle={author.handle} showTitle={false} />
            </li>
          </ul>
        </div>

        {posts.length > 0 && (
          <div id="records">
            <FeedList
              labelledBy="project-posts"
              items={posts.map((post) => ({ post, author }))}
              showAuthor={false}
              header={<ListHeader id="project-posts" icon={<Icon name="book" size={16} />} title="Public write-ups" count={posts.length} />}
            />
          </div>
        )}

        {teamOnly.length > 0 && (
          <ListBox
            labelledBy="project-private"
            header={
              <ListHeader id="project-private" icon={<Icon name="lock" size={16} />} title="Team-only records" count={teamOnly.length} />
            }
            footer={
              <p className="feed__note small muted">
                Verified by Ledger inside the company. Titles pass through the same redaction as posts; the content stays private.
              </p>
            }
          >
            {teamOnly.map((r) => (
              <ListRow key={r.title} title={r.title} meta={<KindMeta type={r.type} />} />
            ))}
          </ListBox>
        )}

        <div id="changes">
          <ListBox
            labelledBy="project-changes"
            header={
              <ListHeader
                id="project-changes"
                icon={<Icon name="merge" size={16} />}
                title="Merge requests"
                count={`${project.changes.total} · ${project.changes.authored} authored, ${project.changes.reviewed} reviewed`}
              />
            }
            footer={
              <p className="feed__note small muted">
                Checked against the company’s GitLab when published. Titles are redacted and code isn’t shown.
              </p>
            }
          >
            {project.changes.items.map((c) => (
              <li key={c.title + c.mergedAt} className="change-row">
                <Icon name="merge" size={14} className={c.role === 'authored' ? 'text-green' : 'muted'} />
                <span className="change-row__title">{c.title}</span>
                <span className={`change-row__role${c.role === 'authored' ? ' change-row__role--authored' : ''}`}>{c.role}</span>
                <span className="change-row__date">{shortDate(c.mergedAt)}</span>
              </li>
            ))}
          </ListBox>
        </div>
      </div>
    </PublicLayout>
  )
}
