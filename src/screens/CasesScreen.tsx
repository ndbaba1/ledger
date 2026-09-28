import { Link } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { useUsers } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Empty, ErrorState, Loading } from '../components/States'
import { relativeTime } from '../lib/format'
import { useQuery } from '../lib/useAsync'

export function CasesScreen() {
  const api = useApi()
  const cases = useQuery(() => api.listCases(), [api])
  const users = useUsers(cases.data?.map((c) => c.ownerId) ?? [])

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">Open cases</h1>
          <p className="page-sub">
            Work in progress. Anything linked to a case joins its case file, so the draft is ready when the fix ships.
          </p>
        </div>
      </header>

      <div className="panel panel--tip">
        <span className="row gap-8 strong">
          <Icon name="sparkle" size={14} className="text-amber" />
          Open a case while you work
        </span>
        <ul className="plain-list small muted">
          <li>
            Add the <span className="mono text">~ledger</span> label to a GitLab or GitHub issue
          </li>
          <li>
            Run <span className="mono text">/ledger track</span> in a Slack thread
          </li>
        </ul>
      </div>

      {cases.loading && !cases.data && <Loading label="Loading cases" />}
      {cases.error && <ErrorState error={cases.error} onRetry={cases.reload} />}
      {cases.data?.length === 0 && <Empty title="No open cases" />}

      <ul className="card-list">
        {cases.data?.map((c) => {
          const owner = users.get(c.ownerId)
          return (
            <li key={c.id} className="card stack gap-8">
              <div className="row gap-8 small muted wrap">
                <span className="dot dot--live" aria-hidden="true" />
                <span>collecting</span>
                <span aria-hidden="true">·</span>
                <span>{c.openedVia}</span>
                <span className="push-right mono">{relativeTime(c.openedAt)}</span>
              </div>
              <h2 className="card-title">{c.title}</h2>
              <div className="row gap-12 small muted wrap">
                <span className="mono">{c.anchor}</span>
                <span className="row gap-4">
                  <Icon name="link" size={13} />
                  {c.sourceCount} sources so far
                </span>
                {owner && (
                  <span className="row gap-6 push-right">
                    <Avatar user={owner} size="xs" />
                    {owner.name}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="small muted">
        Cases become drafts in your <Link to="/inbox">review inbox</Link> when the anchor issue closes.
      </p>
    </div>
  )
}
