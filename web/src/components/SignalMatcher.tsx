import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { SignalMatch } from '../api/types'
import { useSession } from '../app/session'
import { Icon } from './Icon'
import { KindPill } from './PostContent'
import { SignalChip } from './Signals'
import { FieldError } from './States'
import { stripInline } from '../lib/inline'
import { useMutation } from '../lib/useAsync'
import { shortDate } from '../lib/format'

const EXAMPLES = [
  '[FIRING:1] CheckoutP99LatencyHigh (checkout-api, prod-eu-1)',
  'FATAL: sorry, too many clients already',
  'OOM command not allowed when used memory > maxmemory',
]

const STRENGTH: Record<SignalMatch['strength'], string> = {
  exact: 'Exact match',
  strong: 'Strong match',
  partial: 'Partial match',
}

/**
 * Paste an alert or error and see which past records it matches. This is the
 * lookup the Slack bot runs when an alert fires in an incident channel.
 */
export function SignalMatcher() {
  const api = useApi()
  const { workspace } = useSession()
  const [text, setText] = useState('')
  const [checked, setChecked] = useState('')
  const [matches, setMatches] = useState<SignalMatch[]>()
  const match = useMutation((t: string) => api.matchSignal(t))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const res = await match.run(text)
    if (res) {
      setMatches(res)
      setChecked(text.trim())
    }
  }

  const top = matches?.[0]

  return (
    <section className="matcher" aria-labelledby="matcher-title">
      <div className="stack gap-4">
        <h2 id="matcher-title" className="side-title">
          Seen this before?
        </h2>
        <p className="small muted">Paste an alert, metric or error. EngLog checks it against the signals saved on every record.</p>
      </div>
      <form className="stack gap-8" onSubmit={submit}>
        <label htmlFor="matcher-text" className="sr-only">
          Alert, metric or error
        </label>
        <textarea
          id="matcher-text"
          className="input input--lines"
          rows={2}
          placeholder={EXAMPLES[0]}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            match.clearError()
          }}
        />
        <div className="row gap-8 wrap">
          <button type="submit" className="btn" disabled={!text.trim() || match.pending}>
            <Icon name="search" size={14} />
            Check
          </button>
          <span className="small muted">Try:</span>
          {EXAMPLES.slice(1).map((ex) => (
            <button key={ex} type="button" className="chip chip--btn" onClick={() => setText(ex)}>
              {ex.length > 34 ? `${ex.slice(0, 34)}…` : ex}
            </button>
          ))}
        </div>
        <FieldError message={match.error} />
      </form>

      {matches && (
        <div className="stack gap-12" aria-live="polite">
          {matches.length === 0 ? (
            <p className="small muted">
              No record matches this yet. When it’s solved, the signals saved with that record will catch it next time.
            </p>
          ) : (
            <>
              <ol className="match-list">
                {matches.map((m) => (
                  <li key={m.record.id} className="match">
                    <div className="row gap-8 wrap">
                      <span className={`match__strength match__strength--${m.strength}`}>{STRENGTH[m.strength]}</span>
                      <KindPill type={m.record.type} />
                      <span className="mono small muted">
                        {m.record.id} · {shortDate(m.record.publishedAt)}
                      </span>
                    </div>
                    <Link to={`/records/${m.record.id}`} className="match__title">
                      {m.record.title}
                    </Link>
                    <SignalChip signal={m.signal} highlight />
                    <p className="small muted">Fix: {stripInline(m.record.fix).slice(0, 160)}{m.record.fix.length > 160 ? '…' : ''}</p>
                  </li>
                ))}
              </ol>

              {top && (
                <figure className="slack-preview">
                  <figcaption className="small muted">What EngLog would reply in the alert’s Slack thread</figcaption>
                  <div className="slack">
                    <div className="slack__alert">
                      <span className="slack__bot slack__bot--alerts">A</span>
                      <div className="stack gap-2">
                        <span className="slack__name">Alertmanager</span>
                        <code className="slack__text">{checked}</code>
                      </div>
                    </div>
                    <div className="slack__reply">
                      <span className="slack__bot">E</span>
                      <div className="stack gap-6">
                        <span className="slack__name">
                          EngLog <span className="slack__app">APP</span>
                        </span>
                        <p className="slack__text">
                          {top.strength === 'exact' ? 'This has fired before.' : 'This looks like something the team has seen before.'}{' '}
                          <strong>{top.record.id}: {top.record.title}</strong>
                        </p>
                        <p className="slack__text slack__text--muted">
                          Root cause: {stripInline(top.record.rootCause).slice(0, 140)}
                          {top.record.rootCause.length > 140 ? '…' : ''}
                        </p>
                        <div className="row gap-6 wrap">
                          <span className="slack__button">Open record</span>
                          {matches.length > 1 && <span className="slack__button">{matches.length - 1} more match{matches.length > 2 ? 'es' : ''}</span>}
                          <span className="slack__button slack__button--quiet">Not related</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="small muted">Posted in {workspace.name}’s incident channels once the Slack app is connected.</p>
                </figure>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
