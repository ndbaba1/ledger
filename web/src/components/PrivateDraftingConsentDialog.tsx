import { useState } from 'react'
import { FieldError } from './States'

/**
 * Shown in place of the "Start from a PR or issue" box once a private
 * source is detected and the user hasn't consented before. Not a true
 * modal — this codebase has no overlay/dialog primitive, so it replaces the
 * box inline, same as the box's own loading state does.
 */
export function PrivateDraftingConsentDialog({ onAccept, onCancel }: { onAccept: () => Promise<void>; onCancel: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const accept = async () => {
    setPending(true)
    setError(undefined)
    try {
      await onAccept()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <div className="card stack gap-10" role="alertdialog" aria-labelledby="consent-title">
      <strong id="consent-title">Send this to Anthropic?</strong>
      <p className="small muted">
        EngLog will send this repo's PR/issue title, description and comments — never code — to Anthropic to write the draft. It isn't used for
        training.
      </p>
      <div className="row gap-8">
        <button type="button" className="btn btn--primary" onClick={accept} disabled={pending}>
          {pending ? 'Starting…' : 'Accept'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
      <FieldError message={error} />
    </div>
  )
}
