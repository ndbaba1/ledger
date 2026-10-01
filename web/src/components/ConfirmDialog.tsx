import { FieldError } from './States'

/**
 * Not a true modal — this codebase has no overlay/dialog primitive (see
 * PrivateDraftingConsentDialog, the other user of this pattern) — so it
 * replaces whatever's in its place inline instead of overlaying the page.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  pendingLabel?: string
  pending?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="card stack gap-10" role="alertdialog" aria-label={title}>
      <strong>{title}</strong>
      <p className="small muted">{message}</p>
      <div className="row gap-8">
        <button type="button" className="btn btn--danger-text" onClick={onConfirm} disabled={pending}>
          {pending ? (pendingLabel ?? 'Working…') : confirmLabel}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
      <FieldError message={error} />
    </div>
  )
}
