import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { RecordType } from '../api/types'
import { AskCard } from '../components/AskCard'
import { SignalMatcher } from '../components/SignalMatcher'
import { Icon } from '../components/Icon'
import { ListBox, ListHeader } from '../components/ListBox'
import { RecordRow } from '../components/RecordRow'
import { Empty, ErrorState, Loading } from '../components/States'
import { useQuery } from '../lib/useAsync'

const FILTERS: { key: RecordType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'incident', label: 'Incidents' },
  { key: 'investigation', label: 'Investigations' },
  { key: 'decision', label: 'Decisions' },
  { key: 'design', label: 'Designs' },
]

const SUGGESTIONS = ['Has connection pool saturation happened before?', 'pgbouncer', 'redis', 'flaky ci']

/** Questions and multi-word queries get a written answer above the results. */
function wantsAnswer(q: string): boolean {
  const t = q.trim()
  return t.endsWith('?') || t.split(/\s+/).length >= 3
}

export function SearchScreen() {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const type = (params.get('type') as RecordType | null) ?? undefined
  const [draft, setDraft] = useState(q)
  const [debounced, setDebounced] = useState(q)

  // Keep the input in sync when the URL changes (e.g. from the top-bar search).
  useEffect(() => {
    setDraft(q)
    setDebounced(q)
  }, [q])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 200)
    return () => clearTimeout(t)
  }, [draft])

  useEffect(() => {
    if (debounced === q) return
    const next = new URLSearchParams(params)
    if (debounced) next.set('q', debounced)
    else next.delete('q')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const results = useQuery(() => api.search(debounced, type), [api, debounced, type])

  const mode = params.get('mode') === 'match' ? 'match' : 'search'
  const setMode = (m: 'search' | 'match') => {
    const next = new URLSearchParams(params)
    if (m === 'match') next.set('mode', 'match')
    else next.delete('mode')
    setParams(next, { replace: true })
  }

  const setType = (key: RecordType | 'all') => {
    const next = new URLSearchParams(params)
    if (key === 'all') next.delete('type')
    else next.set('type', key)
    setParams(next, { replace: true })
  }

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">Search</h1>
          <p className="page-sub">Search by symptom, error or service, or ask a question in plain words.</p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Search mode">
        <button type="button" role="tab" aria-selected={mode === 'search'} className="tabs__tab" onClick={() => setMode('search')}>
          Search records
        </button>
        <button type="button" role="tab" aria-selected={mode === 'match'} className="tabs__tab" onClick={() => setMode('match')}>
          Match an alert or error
        </button>
      </div>

      {mode === 'match' ? (
        <SignalMatcher />
      ) : (
      <>
      <form className="search-box" role="search" onSubmit={(e) => e.preventDefault()}>
        <Icon name="search" size={18} />
        <label htmlFor="search-q" className="sr-only">
          Search records
        </label>
        <input
          id="search-q"
          type="search"
          autoComplete="off"
          placeholder="Search, or ask “has this happened before?”"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>

      <div className="row gap-8 wrap" role="group" aria-label="Filter by type">
        {FILTERS.map((f) => {
          const active = (type ?? 'all') === f.key
          return (
            <button key={f.key} type="button" className={`filter${active ? ' filter--on' : ''}`} aria-pressed={active} onClick={() => setType(f.key)}>
              {f.label}
            </button>
          )
        })}
      </div>

      {!debounced && (
        <div className="row gap-8 wrap small muted">
          <span>Try</span>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip chip--btn" onClick={() => setDraft(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {debounced && wantsAnswer(debounced) && <AskCard question={debounced} />}

      {results.error && <ErrorState error={results.error} onRetry={results.reload} />}
      {results.loading && !results.data && <Loading label="Searching" />}
      {results.data?.length === 0 && (
        <Empty title="Nothing yet">
          No record covers this. If you’re solving it now, open a case so the next person finds it.
        </Empty>
      )}
      {results.data && results.data.length > 0 && (
        <ListBox
          labelledBy="results-title"
          header={
            <ListHeader
              id="results-title"
              icon={<Icon name={debounced ? 'search' : 'book'} size={16} />}
              title={debounced ? 'Results' : 'All records'}
              count={
                debounced
                  ? `${results.data.length} record${results.data.length === 1 ? '' : 's'} matching “${debounced}”`
                  : `${results.data.length} records`
              }
            />
          }
        >
          {results.data.map((hit) => (
            <RecordRow key={hit.record.id} record={hit.record} excerpt={hit.excerpt} />
          ))}
        </ListBox>
      )}
      </>
      )}
    </div>
  )
}
