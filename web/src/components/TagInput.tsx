import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Icon } from './Icon'

/** Lowercase, trimmed, no leading "#", spaces become dashes. */
function clean(raw: string): string {
  return raw.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 24)
}

/**
 * Chips you type: Enter or comma adds, Backspace on an empty box removes the
 * last one, × removes any. Pasting "go, postgres, redis" adds all three.
 */
export function TagInput({
  id,
  tags,
  onChange,
  max = 12,
  placeholder = 'Add a tag',
  suggestions = [],
  describedBy,
}: {
  id: string
  tags: string[]
  onChange: (tags: string[]) => void
  max?: number
  placeholder?: string
  /** Offered as one-click chips while there's room. */
  suggestions?: string[]
  describedBy?: string
}) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const full = tags.length >= max

  const add = (values: string[]) => {
    const next = [...tags]
    for (const v of values.map(clean)) {
      if (v && !next.includes(v) && next.length < max) next.push(v)
    }
    if (next.length !== tags.length) onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && text.trim()) {
      e.preventDefault()
      add([text])
      setText('')
    } else if (e.key === 'Enter') {
      e.preventDefault()
    } else if (e.key === 'Backspace' && !text && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (/[,\n]/.test(pasted)) {
      e.preventDefault()
      add(pasted.split(/[,\n]/))
    }
  }

  const offered = suggestions.filter((s) => !tags.includes(s)).slice(0, 8)

  return (
    <div className="stack gap-8">
      <div className={`tag-input${full ? ' tag-input--full' : ''}`} onClick={() => input.current?.focus()}>
        {tags.map((t) => (
          <span key={t} className="tag-input__chip">
            {t}
            <button
              type="button"
              className="tag-input__remove"
              aria-label={`Remove ${t}`}
              onClick={(e) => {
                e.stopPropagation()
                onChange(tags.filter((x) => x !== t))
              }}
            >
              <Icon name="x" size={11} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          className="tag-input__field"
          value={text}
          disabled={full}
          placeholder={full ? `${max} is the limit` : tags.length ? '' : placeholder}
          aria-describedby={describedBy}
          onChange={(e) => setText(e.target.value.replace(',', ''))}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (text.trim()) {
              add([text])
              setText('')
            }
          }}
        />
      </div>
      {!full && offered.length > 0 && (
        <div className="row gap-6 wrap" aria-label="Suggestions">
          {offered.map((s) => (
            <button key={s} type="button" className="chip chip--btn tag-input__suggest" onClick={() => add([s])}>
              <Icon name="plus" size={11} strokeWidth={2.5} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
