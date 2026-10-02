import type { Signal, SignalKind } from '../api/types'
import { SIGNAL_KINDS, SIGNAL_LABEL } from '../lib/signals'
import { Icon, type IconName } from './Icon'

const KIND_ICON: Record<SignalKind, IconName> = {
  alert: 'alert',
  metric: 'history',
  error: 'x',
  log: 'file',
}

/** One alert, metric, error or log line, shown in monospace with its kind. */
export function SignalChip({ signal, highlight = false }: { signal: Signal; highlight?: boolean }) {
  return (
    <span className={`signal signal--${signal.kind}${highlight ? ' signal--hit' : ''}`}>
      <span className="signal__kind">
        <Icon name={KIND_ICON[signal.kind]} size={12} strokeWidth={2.5} />
        {SIGNAL_LABEL[signal.kind]}
      </span>
      <code className="signal__value">{signal.value}</code>
      {signal.foundIn && <span className="signal__src">{signal.foundIn}</span>}
    </span>
  )
}

/** The panel on records and drafts: how this problem shows up, so EngLog can recognise it next time. */
export function SignalsPanel({ signals, title = 'Fires as', note }: { signals: Signal[]; title?: string; note?: string }) {
  if (!signals.length) return null
  return (
    <section className="stack gap-10" aria-labelledby="signals-title">
      <div className="row gap-8">
        <h2 id="signals-title" className="eyebrow">
          {title}
        </h2>
        <span className="pill pill--xs push-right">
          <Icon name="lock" size={10} />
          team only
        </span>
      </div>
      <ul className="plain-list signal-list">
        {signals.map((s, i) => (
          <li key={i}>
            <SignalChip signal={s} />
          </li>
        ))}
      </ul>
      <p className="small muted">{note ?? 'When one of these fires again, EngLog points the on-call engineer here.'}</p>
    </section>
  )
}

/** Editor rows: pick a kind, paste the value. */
export function SignalsEditor({
  id,
  signals,
  onChange,
  labelledBy,
}: {
  id: string
  signals: Signal[]
  onChange: (s: Signal[]) => void
  labelledBy: string
}) {
  const rows = signals.length ? signals : [{ kind: 'alert' as const, value: '' }]
  const set = (i: number, patch: Partial<Signal>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i)
    onChange(next.length ? next : [{ kind: 'alert', value: '' }])
  }
  return (
    <div className="list-editor">
      <ol className="list-editor__rows" aria-labelledby={labelledBy}>
        {rows.map((row, i) => {
          const example = SIGNAL_KINDS.find((k) => k.kind === row.kind)?.example
          return (
            <li key={i} className="signal-row">
              <label htmlFor={`${id}-kind-${i}`} className="sr-only">
                Signal {i + 1} kind
              </label>
              <select
                id={`${id}-kind-${i}`}
                className="signal-row__kind"
                value={row.kind}
                onChange={(e) => set(i, { kind: e.target.value as SignalKind })}
              >
                {SIGNAL_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
              <label htmlFor={`${id}-value-${i}`} className="sr-only">
                Signal {i + 1}
              </label>
              <input
                id={`${id}-value-${i}`}
                className="list-editor__input signal-row__value"
                value={row.value}
                placeholder={example}
                onChange={(e) => set(i, { value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onChange([...rows, { kind: row.kind, value: '' }])
                  }
                }}
              />
              <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove signal ${i + 1}`} onClick={() => remove(i)}>
                <Icon name="x" size={14} />
              </button>
            </li>
          )
        })}
      </ol>
      <button type="button" className="btn-link list-editor__add" onClick={() => onChange([...rows, { kind: 'error', value: '' }])}>
        <Icon name="plus" size={13} /> Add signal
      </button>
    </div>
  )
}
