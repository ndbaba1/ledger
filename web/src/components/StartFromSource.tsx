import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { DraftBlockedError } from '../api/client'
import type { RecordType } from '../api/types'
import { TYPE_INFO } from '../lib/writeups'
import { FieldError } from './States'
import { Icon } from './Icon'
import { PrivateDraftingConsentDialog } from './PrivateDraftingConsentDialog'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 90_000
const TYPES: RecordType[] = ['incident', 'investigation', 'decision', 'design']

type Phase = 'idle' | 'consent' | 'drafting'

/** "acme/checkout" from a GitHub PR/issue URL, for the app-not-installed callout's title. */
function ownerRepoFromUrl(url: string): string | undefined {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\//)
  return m ? `${m[1]}/${m[2]}` : undefined
}

/**
 * The "Start from a PR or issue" box on the New write-up page. On
 * `needs_template`, hands the URL and note up to the parent, which switches
 * the template cards below into "use this source" mode instead of rendering
 * its own — see NewWriteupScreen.
 */
export function StartFromSource({
  onNeedsTemplate,
  onDrafted,
  initialUrl,
}: {
  onNeedsTemplate: (url: string, note: string | undefined) => void
  onDrafted: (writeupId: string) => void
  /** Prefills the URL field — set after returning from installing the GitHub App. */
  initialUrl?: string
}) {
  const api = useApi()
  const [url, setUrl] = useState(initialUrl ?? '')
  const [template, setTemplate] = useState<RecordType | ''>('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string>()
  const [resetAt, setResetAt] = useState<string>()
  const [failedWriteupId, setFailedWriteupId] = useState<string>()
  const [installUrl, setInstallUrl] = useState<string>()
  const [installOwnerRepo, setInstallOwnerRepo] = useState<string>()
  const stoppedRef = useRef(false)

  useEffect(
    () => () => {
      stoppedRef.current = true
    },
    [],
  )

  const reset = () => {
    setError(undefined)
    setResetAt(undefined)
    setFailedWriteupId(undefined)
    setInstallUrl(undefined)
    setInstallOwnerRepo(undefined)
  }

  const start = async () => {
    reset()
    setPhase('drafting')
    stoppedRef.current = false
    try {
      const dr = await api.startDraftFromSource(url.trim(), template || undefined)
      if (dr.status === 'ready' && dr.writeupId) {
        onDrafted(dr.writeupId)
        return
      }
      poll(dr.draftId, Date.now())
    } catch (e) {
      handleBlocked(e)
    }
  }

  const poll = (draftId: string, startedAt: number) => {
    window.setTimeout(async () => {
      if (stoppedRef.current) return
      try {
        const dr = await api.getDraftRequest(draftId)
        if (stoppedRef.current) return
        if (dr.status === 'ready' && dr.writeupId) {
          onDrafted(dr.writeupId)
          return
        }
        if (dr.status === 'failed') {
          setError(dr.error ?? 'Drafting failed. Start from the template instead.')
          setFailedWriteupId(dr.writeupId)
          setPhase('idle')
          return
        }
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setError('This is taking longer than expected.')
          setFailedWriteupId(dr.writeupId)
          setPhase('idle')
          return
        }
        poll(draftId, startedAt)
      } catch (e) {
        if (!stoppedRef.current) {
          setError(e instanceof Error ? e.message : String(e))
          setPhase('idle')
        }
      }
    }, POLL_INTERVAL_MS)
  }

  const handleBlocked = (e: unknown) => {
    if (e instanceof DraftBlockedError) {
      if (e.code === 'consent_required') {
        setPhase('consent')
        return
      }
      if (e.code === 'needs_template') {
        setPhase('idle')
        onNeedsTemplate(url.trim(), e.note)
        return
      }
      if (e.resetAt) setResetAt(e.resetAt)
      if (e.installUrl) {
        // Shown as its own neutral callout below, not the red error text.
        setInstallUrl(e.installUrl)
        setInstallOwnerRepo(ownerRepoFromUrl(url))
      } else {
        setError(e.message)
      }
      setPhase('idle')
      return
    }
    setError(e instanceof Error ? e.message : String(e))
    setPhase('idle')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim()) start()
  }

  if (phase === 'consent') {
    return (
      <PrivateDraftingConsentDialog
        onAccept={async () => {
          await api.acceptPrivateDraftingConsent()
          await start()
        }}
        onCancel={() => setPhase('idle')}
      />
    )
  }

  if (phase === 'drafting') {
    return (
      <div className="card row gap-10" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>Reading the PR and its discussion…</span>
      </div>
    )
  }

  return (
    <form className="card stack gap-10" onSubmit={submit}>
      <div className="row gap-8">
        <Icon name="sparkle" size={16} />
        <strong>Start from a PR or issue</strong>
      </div>
      <p className="small muted">Paste a GitHub PR or issue you worked on — Ledger drafts a write-up from its title, description and comments.</p>
      <div className="row gap-8 wrap">
        <label htmlFor="source-url" className="sr-only">
          GitHub PR or issue URL
        </label>
        <input
          id="source-url"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://github.com/owner/repo/pull/123"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            reset()
          }}
        />
        <label htmlFor="source-template" className="sr-only">
          Template
        </label>
        <select id="source-template" className="input" value={template} onChange={(e) => setTemplate(e.target.value as RecordType | '')}>
          <option value="">Let Ledger pick</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_INFO[t].label}
            </option>
          ))}
        </select>
        <button type="submit" className={installUrl ? 'btn' : 'btn btn--primary'} disabled={!url.trim()}>
          Draft it
        </button>
      </div>
      <FieldError message={error} />
      {installUrl && (
        <div className="panel" role="status">
          <span className="row gap-8 strong">
            <Icon name="lock" size={14} />
            Ledger needs access to {installOwnerRepo}
          </span>
          <p className="small muted">Install the Ledger app on this repo. Ledger only uses PR and issue text — never your code.</p>
          <div className="row gap-8">
            <a href={installUrl} className="btn btn--primary btn--sm">
              Install the Ledger app
            </a>
          </div>
        </div>
      )}
      {resetAt && (
        <p className="small muted">Try again after {new Date(resetAt).toLocaleString()}.</p>
      )}
      {failedWriteupId && (
        <p className="small muted">
          <Link to={`/write/${failedWriteupId}`}>Continue in the editor</Link> — the source is already attached as evidence.
        </p>
      )}
    </form>
  )
}
