import type { ReactNode } from 'react'
import type { RecordType, SourceKind, SourceStatus } from '../api/types'
import { Icon, type IconName } from './Icon'

const TYPE_LABEL: Record<RecordType, string> = {
  incident: 'Incident',
  investigation: 'Investigation',
  decision: 'Decision',
}

export function TypeTag({ type }: { type: RecordType }) {
  return <span className={`tag tag--${type}`}>{TYPE_LABEL[type]}</span>
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'amber' | 'green' | 'red' }) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}

const SOURCE_ICON: Record<SourceKind, IconName> = {
  slack: 'hash',
  gitlab_issue: 'issue',
  github_issue: 'issue',
  gitlab_mr: 'merge',
  github_pr: 'merge',
  doc: 'file',
  link: 'link',
}

export function SourceIcon({ kind }: { kind: SourceKind }) {
  return <Icon name={SOURCE_ICON[kind]} size={14} />
}

const STATUS_TONE: Record<SourceStatus, string> = {
  fetched: 'ok',
  linked: 'muted',
  pasted: 'muted',
  failed: 'bad',
}

export function SourceStatusLabel({ status }: { status: SourceStatus }) {
  return <span className={`source-status source-status--${STATUS_TONE[status]}`}>{status}</span>
}

export function VerifiedBadge({ label, detail, url }: { label: string; detail?: string; url?: string }) {
  const body = (
    <>
      <Icon name="check" size={12} strokeWidth={2.5} />
      <span>
        {label}
        {detail && (
          <>
            {' · '}
            <span className="verified__detail">{detail}</span>
          </>
        )}
      </span>
    </>
  )
  return url ? (
    <a className="verified" href={url} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <span className="verified">{body}</span>
  )
}
