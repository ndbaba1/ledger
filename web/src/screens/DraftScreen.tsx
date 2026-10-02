import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { Draft } from '../api/types'
import { useSession, useUsers } from '../app/session'
import { AvatarStack } from '../components/Avatar'
import { GapCard, type GapActions } from '../components/GapCard'
import { Icon } from '../components/Icon'
import { Inline } from '../components/Inline'
import { PaneTabs } from '../components/PaneTabs'
import { SourceList } from '../components/SourceList'
import { SignalsPanel } from '../components/Signals'
import { ErrorState, FieldError, Loading } from '../components/States'
import { Tag, TypeTag } from '../components/Tags'
import { relativeTime } from '../lib/format'
import { SECTION_LABELS, TIMELINE_MARK } from '../lib/labels'
import { useMutation, useQuery } from '../lib/useAsync'

type Pane = 'draft' | 'sources'

export function DraftScreen() {
  const { id = '' } = useParams()
  const api = useApi()
  const draft = useQuery(() => api.getDraft(id), [api, id])

  if (draft.error) return <ErrorState error={draft.error} onRetry={draft.reload} />
  if (!draft.data) return <Loading label="Loading draft" />
  return <DraftView draft={draft.data} onChange={draft.setData} />
}

function DraftView({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const api = useApi()
  const navigate = useNavigate()
  const { refreshInbox, workspace } = useSession()
  const users = useUsers(draft.coAuthorIds)
  const [pane, setPane] = useState<Pane>('draft')
  const [activeCite, setActiveCite] = useState<string>()
  const [gapErrors, setGapErrors] = useState<Record<string, string | undefined>>({})
  const [busyGap, setBusyGap] = useState<string>()

  const labels = SECTION_LABELS[draft.type]
  const openGaps = draft.gaps.filter((g) => g.status === 'open').length

  // Scroll the cited source into view once its pane is visible.
  useEffect(() => {
    if (!activeCite) return
    document.getElementById(`source-${activeCite}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeCite, pane])

  const cite = (key: string) => {
    setActiveCite(key)
    setPane('sources')
  }

  const gapOp = async (gapId: string, op: () => Promise<Draft>) => {
    setBusyGap(gapId)
    setGapErrors((e) => ({ ...e, [gapId]: undefined }))
    try {
      const next = await op()
      onChange(next)
      return next
    } catch (e) {
      setGapErrors((errs) => ({ ...errs, [gapId]: e instanceof Error ? e.message : String(e) }))
      return undefined
    } finally {
      setBusyGap(undefined)
    }
  }

  const gapActions: GapActions = {
    answer: (gapId, text) => gapOp(gapId, () => api.answerGap(draft.id, gapId, text)),
    attachEvidence: (gapId, url) =>
      gapOp(gapId, async () => {
        const withSource = await api.addSource(draft.id, url)
        const added = withSource.sources[withSource.sources.length - 1]
        return api.answerGap(draft.id, gapId, `Evidence attached as ${added.key}: ${added.title}`)
      }),
    keep: (gapId) => gapOp(gapId, () => api.keepGapUnverified(draft.id, gapId)),
    remove: (gapId) => gapOp(gapId, () => api.removeGapClaim(draft.id, gapId)),
    reopen: (gapId) => gapOp(gapId, () => api.reopenGap(draft.id, gapId)),
  }

  const approve = useMutation(() => api.approveDraft(draft.id))
  const onApprove = async () => {
    const record = await approve.run()
    if (record) {
      refreshInbox()
      navigate(`/records/${record.id}`, { state: { justPublished: true } })
    }
  }

  const alreadyPublished = draft.status === 'published' && draft.publishedRecordId

  return (
    <div className="page page--split">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/inbox">inbox</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">draft/{draft.slug}</span>
      </nav>

      <PaneTabs<Pane>
        label="Draft sections"
        active={pane}
        onChange={setPane}
        tabs={[
          { key: 'draft', label: 'Draft' },
          { key: 'sources', label: <>Case file <span className="mono muted">{draft.sources.length}</span></> },
        ]}
      />

      <div className="split" data-pane={pane}>
        <section className="split__main" aria-label="Draft">
          <header className="stack gap-10">
            <div className="row gap-8 wrap">
              <TypeTag type={draft.type} />
              <Tag tone={alreadyPublished ? 'green' : 'amber'}>{alreadyPublished ? 'Published' : 'Draft · needs review'}</Tag>
              <span className="mono muted small">
                {[draft.severity, draft.service, draft.resolvedIn && `${draft.resolvedIn} to resolve`].filter(Boolean).join(' · ')}
              </span>
            </div>
            <h1 className="doc-title">{draft.title}</h1>
            <p className="small muted">
              Drafted from <span className="mono text">{draft.anchor}</span> · {draft.sources.length} sources stitched ·{' '}
              {draft.trigger} · {relativeTime(draft.createdAt)}
            </p>
          </header>

          {openGaps > 0 && (
            <div className="banner banner--amber" role="status">
              <Icon name="alert" size={16} />
              <span>
                {openGaps} gap{openGaps === 1 ? '' : 's'} to resolve before publishing. Every claim cites a source; uncited
                claims are flagged.
              </span>
              <button
                type="button"
                className="btn-link banner__action"
                onClick={() => document.getElementById('gaps')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Jump to gaps
              </button>
            </div>
          )}

          <Section title={labels.summary}>
            <p className="prose">
              <Inline text={draft.summary} onCite={cite} activeCite={activeCite} />
            </p>
          </Section>

          <Section title={labels.timeline}>
            <ol className="timeline">
              {draft.timeline.map((t, i) => {
                const mark = TIMELINE_MARK[t.kind]
                return (
                  <li key={i} className={`timeline__row timeline__row--${t.kind}`}>
                    <span className="timeline__at">{t.at}</span>
                    <span className="timeline__text">
                      {mark && <span className={`timeline__mark timeline__mark--${mark.tone}`}>{mark.label}</span>}
                      <Inline text={t.text} onCite={cite} activeCite={activeCite} />
                    </span>
                  </li>
                )
              })}
            </ol>
          </Section>

          <div className="grid-2">
            <Section title={labels.rootCause} card>
              <p className="prose prose--sm">
                <Inline text={draft.rootCause} onCite={cite} activeCite={activeCite} />
              </p>
            </Section>
            <Section title={labels.fix} card>
              <p className="prose prose--sm">
                <Inline text={draft.fix} onCite={cite} activeCite={activeCite} />
              </p>
            </Section>
          </div>

          {draft.gaps.length > 0 && (
            <section id="gaps" className="stack gap-10" aria-labelledby="gaps-title">
              <h2 id="gaps-title" className={`section-title${openGaps ? ' section-title--amber' : ''}`}>
                Gaps · {openGaps} open
              </h2>
              <div className="grid-2">
                {draft.gaps.map((g) => (
                  <GapCard key={g.id} gap={g} actions={gapActions} error={gapErrors[g.id]} busy={busyGap === g.id} />
                ))}
              </div>
            </section>
          )}
        </section>

        <aside className="split__side" aria-label="Case file">
          <div className="side-head">
            <h2 className="side-title">Case file</h2>
            <span className="mono muted small">
              {draft.sources.length} sources · {Math.max(...draft.sources.map((s) => s.hops))} hops
            </span>
          </div>
          <SourceList sources={draft.sources} activeKey={activeCite} />
          <AddSource draft={draft} onChange={onChange} />
          {draft.redactions.length > 0 && (
            <div className="panel">
              <span className="row gap-8 strong">
                <Icon name="lock" size={14} className="text-green" />
                Redacted before drafting
              </span>
              <ul className="plain-list mono small">
                {draft.redactions.map((r) => (
                  <li key={r.label}>
                    {r.count} × {r.label}
                  </li>
                ))}
              </ul>
              <span className="small muted">Fetched with your own permissions. Raw source text is discarded after drafting.</span>
            </div>
          )}
          <SignalsPanel
            signals={draft.signals ?? []}
            title="Signals detected"
            note="Found in the case file. They’re saved with the record so EngLog can point here when they fire again."
          />
          <div className="row gap-8 small muted">
            <span>Co-authors from sources</span>
            <AvatarStack users={draft.coAuthorIds.map((uid) => users.get(uid)).filter((u) => u !== undefined)} />
          </div>
        </aside>
      </div>

      <div className="action-bar">
        <div className="action-bar__inner">
          <span className="action-bar__hint small muted">
            {alreadyPublished
              ? 'Already published to the team.'
              : openGaps
                ? `Resolve ${openGaps} gap${openGaps === 1 ? '' : 's'} to publish.`
                : `Publishes to ${workspace.name}. You can promote it to public later.`}
          </span>
          <FieldError message={approve.error} />
          {alreadyPublished ? (
            <Link className="btn btn--primary" to={`/records/${draft.publishedRecordId}`}>
              View record
            </Link>
          ) : (
            <button type="button" className="btn btn--primary" onClick={onApprove} disabled={openGaps > 0 || approve.pending}>
              {approve.pending ? 'Publishing…' : 'Approve & publish to team'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, card, children }: { title: string; card?: boolean; children: ReactNode }) {
  return (
    <section className={card ? 'card stack gap-6' : 'stack gap-8'}>
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  )
}

function AddSource({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const api = useApi()
  const [url, setUrl] = useState('')
  const add = useMutation((u: string) => api.addSource(draft.id, u))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = await add.run(url)
    if (next) {
      onChange(next)
      setUrl('')
    }
  }

  return (
    <form className="stack gap-6" onSubmit={submit}>
      <label htmlFor="add-source" className="sr-only">
        Add a source link
      </label>
      <div className="row gap-8">
        <input
          id="add-source"
          className="input input--dashed"
          type="url"
          inputMode="url"
          placeholder="Paste a link — Slack, MR, doc…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            add.clearError()
          }}
        />
        <button type="submit" className="btn" disabled={!url.trim() || add.pending}>
          <Icon name="plus" size={14} />
          Add
        </button>
      </div>
      <FieldError message={add.error} />
    </form>
  )
}
