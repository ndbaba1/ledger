import { forwardRef, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Markdown } from './Inline'

interface MarkdownFieldProps {
  id: string
  /** Accessible name; also labels the Write/Preview tablist. */
  label: string
  value: string
  onChange: (value: string) => void
  /** Cmd/Ctrl+Enter — plain Enter still makes a new line. */
  onSubmit?: () => void
  onFocus?: () => void
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  autoFocus?: boolean
}

const MIN_ROWS = 2

/**
 * The text box shared by every Q&A field: asking, answering, and editing an
 * answer before folding it in. Grows with content (min 2 rows, then scrolls
 * past ~12), has a Write/Preview toggle that renders with the same
 * Markdown/Inline the post itself uses, and submits on Cmd/Ctrl+Enter.
 */
export const MarkdownField = forwardRef<HTMLTextAreaElement, MarkdownFieldProps>(function MarkdownField(
  { id, label, value, onChange, onSubmit, onFocus, placeholder, maxLength, disabled, autoFocus },
  ref,
) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (typeof ref === 'function') ref(textareaRef.current)
    else if (ref) ref.current = textareaRef.current
  })

  useEffect(() => {
    const el = textareaRef.current
    if (!el || tab !== 'write') return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, tab])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.()
    }
  }

  const remaining = maxLength !== undefined ? maxLength - value.length : undefined

  return (
    <div className="markdown-field">
      <div className="row gap-8 wrap">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <div className="segmented segmented--compact markdown-field__tabs" role="tablist" aria-label={`${label} view`}>
          {(['write', 'preview'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={tab === v}
              className={`segmented__btn${tab === v ? ' segmented__btn--on' : ''}`}
              onClick={() => setTab(v)}
            >
              {v === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'write' ? (
        <textarea
          id={id}
          ref={textareaRef}
          className="input markdown-field__textarea"
          rows={MIN_ROWS}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      ) : (
        <div className="markdown-field__preview">
          {value.trim() ? <Markdown text={value} /> : <p className="small muted">Nothing to preview yet.</p>}
        </div>
      )}

      <div className="row gap-8 markdown-field__foot">
        <p className="small muted markdown-field__hint">Supports `code`, **bold**, links and ``` blocks. ⌘/Ctrl+Enter to send.</p>
        {remaining !== undefined && remaining <= 60 && <span className="small muted push-right markdown-field__count">{remaining} left</span>}
      </div>
    </div>
  )
})
