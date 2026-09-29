import type { ReactNode } from 'react'

export interface PaneTab<K extends string> {
  key: K
  label: ReactNode
}

/** Segmented switch between panes; only visible below the split breakpoint. */
export function PaneTabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: PaneTab<K>[]
  active: K
  onChange: (key: K) => void
  label: string
}) {
  return (
    <div className="pane-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className="pane-tabs__tab"
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
