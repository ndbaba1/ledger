import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const notFound = error.name === 'NotFoundError'
  return (
    <div className="state state--error" role="alert">
      <Icon name="alert" size={20} />
      <strong>{notFound ? 'Not found' : 'Something went wrong'}</strong>
      <span className="muted">{error.message}</span>
      <div className="row gap-8">
        {onRetry && !notFound && (
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
        <Link to="/inbox" className="btn btn--ghost">
          Back to inbox
        </Link>
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {children && <span className="muted">{children}</span>}
    </div>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  )
}
