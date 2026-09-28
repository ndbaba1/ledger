import { useState, type FormEvent } from 'react'
import type { Draft, Gap } from '../api/types'
import { Icon } from './Icon'
import { FieldError } from './States'

const GAP_KIND_LABEL: Record<Gap['kind'], string> = {
  missing_context: 'Missing context',
  unsupported_claim: 'Unsupported claim',
}

const RESOLVED_LABEL: Record<Exclude<Gap['status'], 'open'>, string> = {
  answered: 'Answered',
  kept_unverified: 'Kept, marked unverified',
  removed: 'Claim removed',
}

export interface GapActions {
  answer: (gapId: string, text: string) => Promise<Draft | undefined>
  attachEvidence: (gapId: string, url: string) => Promise<Draft | undefined>
  keep: (gapId: string) => Promise<Draft | undefined>
  remove: (gapId: string) => Promise<Draft | undefined>
  reopen: (gapId: string) => Promise<Draft | undefined>
}

export function GapCard({ gap, actions, error, busy }: { gap: Gap; actions: GapActions; error?: string; busy: boolean }) {
  const [text, setText] = useState('')
  const inputId = `gap-${gap.id}`

  if (gap.status !== 'open') {
    return (
      <div className="gapcard gapcard--resolved">
        <div className="row gap-8">
          <Icon name="check" size={14} />
          <span className="eyebrow eyebrow--green">{RESOLVED_LABEL[gap.status]}</span>
          <button type="button" className="btn-link push-right" onClick={() => actions.reopen(gap.id)} disabled={busy}>
            Undo
          </button>
        </div>
        <p className="gapcard__prompt muted">{gap.prompt}</p>
        {gap.answer && <p className="gapcard__answer">{gap.answer}</p>}
      </div>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const done =
      gap.kind === 'missing_context' ? await actions.answer(gap.id, text) : await actions.attachEvidence(gap.id, text)
    if (done) setText('')
  }

  return (
    <form className="gapcard" onSubmit={submit}>
      <span className="eyebrow eyebrow--amber">{GAP_KIND_LABEL[gap.kind]}</span>
      <p className="gapcard__prompt">{gap.prompt}</p>
      <label htmlFor={inputId} className="label">
        {gap.kind === 'missing_context' ? 'Your answer, or paste a link' : 'Paste a link to the evidence'}
      </label>
      {gap.kind === 'missing_context' ? (
        <textarea
          id={inputId}
          className="input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. cost review — we thought checkout was over-provisioned"
        />
      ) : (
        <input
          id={inputId}
          className="input"
          type="url"
          inputMode="url"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://… screenshot, query output, dashboard"
        />
      )}
      <FieldError message={error} />
      <div className="row gap-8 wrap">
        <button type="submit" className="btn" disabled={busy || !text.trim()}>
          {gap.kind === 'missing_context' ? 'Save answer' : 'Attach evidence'}
        </button>
        {gap.kind === 'unsupported_claim' && (
          <>
            <button type="button" className="btn btn--ghost" onClick={() => actions.keep(gap.id)} disabled={busy}>
              Keep, mark unverified
            </button>
            <button type="button" className="btn btn--danger-text" onClick={() => actions.remove(gap.id)} disabled={busy}>
              Remove claim
            </button>
          </>
        )}
      </div>
    </form>
  )
}
