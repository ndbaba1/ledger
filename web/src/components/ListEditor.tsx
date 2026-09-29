import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Icon } from './Icon'

interface ListEditorProps {
  id: string
  items: string[]
  onChange: (items: string[]) => void
  /** Shown in empty rows, e.g. "Kafka — a new cluster to run". */
  placeholder: string
  /** What one item is called, for button and screen-reader labels. */
  itemName: string
  numbered?: boolean
  labelledBy: string
}

/**
 * An ordered list of one-line items: Enter adds a row, Backspace on an
 * empty row removes it, and each row can be moved or deleted.
 */
export function ListEditor({ id, items, onChange, placeholder, itemName, numbered = false, labelledBy }: ListEditorProps) {
  const rows = items.length ? items : ['']
  const focusIndex = useRef<number | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    if (focusIndex.current === null) return
    const input = listRef.current?.querySelectorAll('input')[focusIndex.current]
    input?.focus()
    focusIndex.current = null
  })

  const update = (next: string[], focus?: number) => {
    if (focus !== undefined) focusIndex.current = focus
    onChange(next)
  }

  const setAt = (i: number, value: string) => update(rows.map((r, j) => (j === i ? value : r)))
  const insertAfter = (i: number) => update([...rows.slice(0, i + 1), '', ...rows.slice(i + 1)], i + 1)
  const removeAt = (i: number) => {
    const next = rows.filter((_, j) => j !== i)
    update(next.length ? next : [''], Math.max(0, i - 1))
  }
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    update(next, j)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      insertAfter(i)
    } else if (e.key === 'Backspace' && rows[i] === '' && rows.length > 1) {
      e.preventDefault()
      removeAt(i)
    } else if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      move(i, -1)
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      move(i, 1)
    }
  }

  return (
    <div className="list-editor">
      <ol ref={listRef} className="list-editor__rows" aria-labelledby={labelledBy}>
        {rows.map((row, i) => (
          <li key={i} className="list-editor__row">
            <span className="list-editor__marker" aria-hidden="true">
              {numbered ? String(i + 1).padStart(2, '0') : '•'}
            </span>
            <label htmlFor={`${id}-${i}`} className="sr-only">
              {itemName} {i + 1}
            </label>
            <input
              id={`${id}-${i}`}
              className="list-editor__input"
              value={row}
              placeholder={i === 0 ? placeholder : ''}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            />
            <span className="list-editor__actions">
              <button type="button" className="icon-btn icon-btn--sm" aria-label={`Move ${itemName} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="chevronRight" size={14} style={{ transform: 'rotate(-90deg)' }} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={`Move ${itemName} ${i + 1} down`}
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                <Icon name="chevronRight" size={14} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove ${itemName} ${i + 1}`} onClick={() => removeAt(i)}>
                <Icon name="x" size={14} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-link list-editor__add" onClick={() => insertAfter(rows.length - 1)}>
        <Icon name="plus" size={13} /> Add {itemName}
      </button>
    </div>
  )
}
