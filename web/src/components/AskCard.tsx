import { Link } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { useQuery } from '../lib/useAsync'
import { Icon } from './Icon'
import { Inline } from './Inline'

/**
 * A short answer to the search query, written only from team records and
 * citing each one used, so readers can check it before acting on it.
 */
export function AskCard({ question }: { question: string }) {
  const api = useApi()
  const result = useQuery(() => api.ask(question), [api, question])
  const data = result.data?.question === question ? result.data : undefined

  return (
    <section className="ask" aria-labelledby="ask-title" aria-busy={!data && !result.error}>
      <span className="ask__label">
        <Icon name="sparkle" size={14} />
        Ask EngLog
      </span>
      <h2 id="ask-title" className="ask__q">
        {asQuestion(question)}
      </h2>
      {result.error && <p className="small muted">Couldn’t answer right now: {result.error.message}</p>}
      {!data && !result.error && (
        <div className="ask__skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {data && data.answer === null && (
        <p className="ask__a">No record covers this yet. If you’re working on it now, open a case so the next person finds it.</p>
      )}
      {data?.answer && (
        <>
          <p className="ask__a">
            <Inline
              text={data.answer}
              refHref={(n) => {
                const c = data.citations.find((x) => x.n === n)
                return c ? `/records/${c.recordId}` : undefined
              }}
            />
          </p>
          <ol className="ask__refs">
            {data.citations.map((c) => (
              <li key={c.n}>
                <span className="ref" aria-hidden="true">
                  {c.n}
                </span>
                <Link to={`/records/${c.recordId}`}>{c.title}</Link>
              </li>
            ))}
          </ol>
          <p className="ask__note">Written only from your team’s records. Open the cited records before acting on it.</p>
        </>
      )}
    </section>
  )
}

/** Show the query the way it was asked; add a question mark to question-shaped queries. */
function asQuestion(q: string): string {
  const t = q.trim()
  if (/[?.!]$/.test(t)) return t
  return /^(has|have|how|why|what|when|where|who|which|is|are|was|were|did|do|does|can|should)\b/i.test(t) ? `${t}?` : t
}
