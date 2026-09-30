import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { Signal, Writeup, WriteupFields, WriteupStatus } from '../api/types'
import { useMaybeWorkspace, useMe } from '../app/session'
import { Icon } from '../components/Icon'
import { Inline } from '../components/Inline'
import { PaneTabs } from '../components/PaneTabs'
import { KindPill, PostContent } from '../components/PostContent'
import { ListEditor } from '../components/ListEditor'
import { RichEditor } from '../components/RichEditor'
import { SignalsEditor } from '../components/Signals'
import { SourceIcon } from '../components/Tags'
import { ErrorState, FieldError, Loading } from '../components/States'
import { features } from '../lib/features'
import { relativeTime } from '../lib/format'
import { sectionsFor } from '../lib/publicPost'
import { useMutation, useQuery } from '../lib/useAsync'
import { TYPE_INFO, publishRequirements, writeupToRecord, type FieldDef } from '../lib/writeups'

type View = 'write' | 'preview' | 'side'

/** Editor state: Markdown for text fields, arrays (blank rows kept while typing) for lists. */
interface FormState {
  title: string
  context: string
  symptom: string
  constraints: string[]
  rootCause: string
  flow: string[]
  ruledOut: string[]
  fix: string
  lesson: string
  resultLabel: string
  resultBefore: string
  resultAfter: string
  signals: Signal[]
}

function toForm(w: Writeup): FormState {
  return {
    title: w.title,
    context: w.context,
    symptom: w.symptom,
    constraints: [...w.constraints],
    rootCause: w.rootCause,
    flow: [...w.flow],
    ruledOut: [...w.ruledOut],
    fix: w.fix,
    lesson: w.lesson,
    resultLabel: w.result?.label ?? '',
    resultBefore: w.result?.before ?? '',
    resultAfter: w.result?.after ?? '',
    signals: w.signals.map((x) => ({ ...x })),
  }
}

function toFields(f: FormState): WriteupFields {
  const hasResult = f.resultLabel.trim() || f.resultBefore.trim() || f.resultAfter.trim()
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean)
  return {
    title: f.title,
    context: f.context,
    symptom: f.symptom,
    constraints: clean(f.constraints),
    rootCause: f.rootCause,
    flow: clean(f.flow),
    ruledOut: clean(f.ruledOut),
    fix: f.fix,
    lesson: f.lesson,
    result: hasResult
      ? { label: f.resultLabel.trim(), before: f.resultBefore.trim(), after: f.resultAfter.trim() }
      : undefined,
    signals: f.signals.filter((x) => x.value.trim()),
  }
}

export function WriteupScreen() {
  const { id = '' } = useParams()
  const api = useApi()
  const writeup = useQuery(() => api.getWriteup(id), [api, id])

  if (writeup.error) return <ErrorState error={writeup.error} onRetry={writeup.reload} />
  if (!writeup.data || writeup.data.id !== id) return <Loading label="Opening write-up" />
  return <Editor key={writeup.data.id} initial={writeup.data} />
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function Editor({ initial }: { initial: Writeup }) {
  const api = useApi()
  const navigate = useNavigate()
  const me = useMe()!
  const workspace = useMaybeWorkspace()
  const [w, setW] = useState(initial)
  const [form, setForm] = useState<FormState>(() => toForm(initial))
  const [view, setView] = useState<View>('write')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const dirty = useRef(false)
  const info = TYPE_INFO[w.type]

  // Back from installing the GitHub App on GitHub's own site — the setup
  // callback already re-verified evidence server-side, so `initial` (loaded
  // right after) already reflects it; just show the notice and drop the param.
  const [params, setParams] = useSearchParams()
  const [justInstalled, setJustInstalled] = useState(false)
  useEffect(() => {
    if (params.get('installed') !== '1') return
    setJustInstalled(true)
    setParams(
      (p) => {
        p.delete('installed')
        return p
      },
      { replace: true },
    )
    // Only ever react to the param on the redirect back from GitHub.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fields = useMemo(() => toFields(form), [form])
  const current = { ...w, ...fields }
  const requirements = publishRequirements(current)
  const missing = requirements.filter((r) => !r.done).length

  // Autosave a moment after typing stops.
  useEffect(() => {
    if (!dirty.current) return
    setSaveState('saving')
    const t = setTimeout(() => {
      api
        .saveWriteup(w.id, fields)
        .then((saved) => {
          setW((prev) => ({ ...prev, updatedAt: saved.updatedAt }))
          setSaveState('saved')
        })
        .catch(() => setSaveState('error'))
    }, 600)
    return () => clearTimeout(t)
  }, [api, w.id, fields])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    dirty.current = true
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Version 1 of the backend publishes straight to the profile; unbuilt
  // screens (team records) stay on the mock.
  const alreadyPublished = Boolean(w.postSlug)
  const [changeSummary, setChangeSummary] = useState('')
  const status = useMutation((s: WriteupStatus) => api.setWriteupStatus(w.id, s))
  const publish = useMutation(async () => {
    await api.saveWriteup(w.id, fields)
    return features.workspace ? api.publishWriteup(w.id) : api.publishWriteupToProfile(w.id, changeSummary.trim())
  })

  const onPublish = async () => {
    const result = await publish.run()
    if (!result) return
    if ('slug' in result) navigate(`/u/${me.handle}/${result.slug}`, { state: alreadyPublished ? { justUpdated: true } : { justPublished: true } })
    else navigate(`/records/${result.id}`, { state: { justPublished: true } })
  }

  const previewRecord = writeupToRecord({ ...current }, { id: 'preview', publishedAt: w.updatedAt, authorId: me.id })
  const isDesign = w.type === 'design'
  const canPublish = missing === 0 && !publish.pending && (!alreadyPublished || changeSummary.trim().length > 0)

  if (w.publishedRecordId) {
    return (
      <div className="state">
        <strong>This write-up is published</strong>
        <Link to={`/records/${w.publishedRecordId}`} className="btn">
          Open the record
        </Link>
      </div>
    )
  }

  return (
    <div className="page page--split">
      <div className="row gap-12 wrap page-toolbar">
        <nav className="crumbs" aria-label="Breadcrumb">
          {features.workspace ? <Link to="/inbox">inbox</Link> : <Link to="/me/writeups">your write-ups</Link>}
          <span aria-hidden="true">/</span>
          <span aria-current="page">write-up</span>
        </nav>
        <KindPill type={w.type} />
        {isDesign ? (
          <span className={`status-pill status-pill--${w.status}`}>{w.status === 'shipped' ? 'Shipped' : 'Proposed'}</span>
        ) : (
          <span className="status-pill status-pill--draft">Draft</span>
        )}
        <span className="small muted" aria-live="polite">
          {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Couldn’t save — keep this tab open and try again' : `Saved ${relativeTime(w.updatedAt)}`}
        </span>
        <div className="segmented segmented--compact push-right hide-mobile" role="tablist" aria-label="Editor view">
          {(['write', 'preview'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v || (v === 'write' && view === 'side')}
              className={`segmented__btn${view === v || (v === 'write' && view === 'side') ? ' segmented__btn--on' : ''}`}
              onClick={() => setView(v)}
            >
              {v === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>
      </div>

      <PaneTabs<View>
        label="Write-up sections"
        active={view}
        onChange={setView}
        tabs={[
          { key: 'write', label: 'Write' },
          { key: 'preview', label: 'Preview' },
          { key: 'side', label: <>Publish {missing > 0 && <span className="mono muted">{missing}</span>}</> },
        ]}
      />

      <div className="split split--write" data-pane={view}>
        <section className="split__main" aria-label={view === 'preview' ? 'Preview' : 'Write'}>
          {view === 'preview' ? (
            <div className="stack gap-20">
              <header className="post-head">
                <KindPill type={w.type} />
                <h1 className="post-head__title">{current.title || 'Untitled write-up'}</h1>
                {current.context && <p className="small muted">{current.context}</p>}
              </header>
              <PostContent
                decision={w.type === 'decision' && current.rootCause ? current.rootCause : undefined}
                sections={sectionsFor(previewRecord).filter((s) => s.body.trim())}
                result={previewRecord.result}
                lesson={previewRecord.lesson || undefined}
                render={(text) => <Inline text={text} />}
              />
            </div>
          ) : (
            <form className="writer" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="w-title" className="sr-only">
                Title
              </label>
              <TitleInput value={form.title} placeholder={`Title, e.g. ${info.example}`} onChange={(v) => set('title', v)} />
              {info.fields.map((f, i) => (
                <SectionCard key={f.key} def={f} step={i + 1} filled={isFilled(fields, f.key)}>
                  {f.kind === 'short' ? (
                    <input
                      id={`w-${f.key}`}
                      className="input"
                      value={form[f.key] as string}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.key, e.target.value)}
                      aria-labelledby={`w-${f.key}-label`}
                      aria-describedby={`w-${f.key}-help`}
                    />
                  ) : f.kind === 'lines' ? (
                    <ListEditor
                      id={`w-${f.key}`}
                      items={form[f.key] as string[]}
                      onChange={(items) => set(f.key, items)}
                      placeholder={f.placeholder ?? ''}
                      itemName={f.itemName ?? 'item'}
                      numbered={f.numbered}
                      labelledBy={`w-${f.key}-label`}
                    />
                  ) : (
                    <RichEditor
                      id={`w-${f.key}`}
                      value={form[f.key] as string}
                      onChange={(md) => set(f.key, md)}
                      placeholder={f.placeholder}
                      labelledBy={`w-${f.key}-label`}
                      describedBy={`w-${f.key}-help`}
                    />
                  )}
                </SectionCard>
              ))}
              <SectionCard
                def={{
                  key: 'result' as never,
                  label: 'Result',
                  help: 'One number that moved, e.g. “Checkout p99: 4.2s → 310ms”.',
                  kind: 'short',
                  required: isDesign,
                }}
                step={info.fields.length + 1}
                filled={Boolean(fields.result?.label && fields.result.before && fields.result.after)}
                optionalLabel={isDesign ? 'needed to publish' : undefined}
              >
                <div className="result-inputs">
                  <label className="stack gap-4">
                    <span className="small muted">Measure</span>
                    <input className="input" value={form.resultLabel} onChange={(e) => set('resultLabel', e.target.value)} placeholder="Checkout p99" />
                  </label>
                  <label className="stack gap-4">
                    <span className="small muted">Before</span>
                    <input className="input" value={form.resultBefore} onChange={(e) => set('resultBefore', e.target.value)} placeholder="4.2s" />
                  </label>
                  <label className="stack gap-4">
                    <span className="small muted">After</span>
                    <input className="input" value={form.resultAfter} onChange={(e) => set('resultAfter', e.target.value)} placeholder="310ms" />
                  </label>
                </div>
              </SectionCard>
              {features.workspace && (
                <SectionCard
                  def={{
                    key: 'signals' as never,
                    label: 'Signals',
                    help: 'The alert that fired, the metric that moved, the error people saw. Ledger uses these to recognise the problem next time. Team only — never published.',
                    kind: 'short',
                  }}
                  step={info.fields.length + 2}
                  filled={fields.signals.length > 0}
                >
                  <SignalsEditor id="w-signals" signals={form.signals} onChange={(sig) => set('signals', sig)} labelledBy="w-signals-label" />
                </SectionCard>
              )}
            </form>
          )}
        </section>

        <aside className="split__side" aria-label="Status, evidence and publishing">
          {isDesign && (
            <section className="stack gap-8" aria-labelledby="w-status">
              <h2 id="w-status" className="eyebrow">
                Status
              </h2>
              <div className="segmented" role="radiogroup" aria-label="Design status">
                {(['proposed', 'shipped'] as const).map((s) => (
                  <label key={s} className={`segmented__opt${w.status === s ? ' segmented__opt--on' : ''}`}>
                    <input
                      type="radio"
                      name="w-status"
                      checked={w.status === s}
                      disabled={status.pending}
                      onChange={async () => {
                        const next = await status.run(s)
                        if (next) setW((prev) => ({ ...prev, status: next.status }))
                      }}
                    />
                    {s === 'proposed' ? 'Proposed' : 'Shipped'}
                  </label>
                ))}
              </div>
              <p className="small muted">
                {w.status === 'proposed'
                  ? 'Write the proposal now. Mark it shipped once it’s built and running.'
                  : 'Add the MRs that built it and a result after launch, then publish.'}
              </p>
              <FieldError message={status.error} />
            </section>
          )}

          {justInstalled && (
            <div className="banner banner--green" role="status">
              <Icon name="check" size={16} />
              <span>
                Ledger can now verify {[...new Set(w.evidence.filter((e) => e.private && e.owner).map((e) => e.owner))].join(', ') || 'that repo'}.
              </span>
              <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setJustInstalled(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
          <Evidence writeup={w} onChange={(next) => setW((prev) => ({ ...prev, evidence: next.evidence }))} />

          <section className="stack gap-10 side-section" aria-labelledby="w-ready">
            <h2 id="w-ready" className="eyebrow">
              {alreadyPublished ? 'Ready to update' : 'Ready to publish'}
            </h2>
            <ul className="checklist">
              {requirements.map((r) => (
                <li key={r.label} className={`checklist__item${r.done ? ' checklist__item--done' : ''}`}>
                  <Icon name={r.done ? 'check' : 'x'} size={14} strokeWidth={2.5} />
                  <span>{r.label}</span>
                  <span className="sr-only">{r.done ? 'done' : 'missing'}</span>
                </li>
              ))}
            </ul>
            {alreadyPublished && missing === 0 && (
              <label className="stack gap-4">
                <span className="small muted">What changed?</span>
                <input
                  id="w-change-summary"
                  className="input"
                  maxLength={140}
                  placeholder="e.g. Clarified the root cause"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                />
              </label>
            )}
            <FieldError message={publish.error} />
            <button type="button" className="btn btn--primary" onClick={onPublish} disabled={!canPublish}>
              {publish.pending
                ? alreadyPublished
                  ? 'Updating…'
                  : 'Publishing…'
                : workspace
                  ? `Publish to ${workspace.name}`
                  : alreadyPublished
                    ? 'Publish update'
                    : 'Publish to your profile'}
            </button>
            <p className="small muted">
              {missing > 0
                ? `${missing} thing${missing === 1 ? '' : 's'} left. Drafts stay private to you.`
                : alreadyPublished
                  ? 'Updates the post readers already see, at the same link.'
                  : workspace
                    ? 'Teammates will see it in records and search. You can promote it to public afterwards.'
                    : 'Anyone can find it on your profile and in search.'}
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

/** A title field that wraps and grows instead of scrolling sideways on small screens. */
function TitleInput({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      id="w-title"
      rows={1}
      className="writer__title"
      placeholder={placeholder}
      value={value}
      // A title is one line: Enter shouldn't add a newline.
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
    />
  )
}

function isFilled(fields: WriteupFields, key: FieldDef['key']): boolean {
  const v = fields[key]
  return Array.isArray(v) ? v.length > 0 : v.trim().length > 0
}

/** One template section: numbered header, required/optional badge, hint, then its editor. */
function SectionCard({
  def,
  step,
  filled,
  optionalLabel,
  children,
}: {
  def: FieldDef
  step: number
  filled: boolean
  optionalLabel?: string
  children: ReactNode
}) {
  const id = `w-${def.key}`
  return (
    <section className={`wsec${filled ? ' wsec--filled' : ''}`} aria-labelledby={`${id}-label`}>
      <header className="wsec__head">
        <span className="wsec__step" aria-hidden="true">
          {filled ? <Icon name="check" size={13} strokeWidth={3} /> : String(step).padStart(2, '0')}
        </span>
        <h2 id={`${id}-label`} className="wsec__title">
          {def.label}
        </h2>
        <span className={`wsec__badge${def.required ? ' wsec__badge--req' : ''}`}>
          {optionalLabel ?? (def.required ? 'required' : 'optional')}
        </span>
      </header>
      <p id={`${id}-help`} className="wsec__help">
        {def.help}
      </p>
      {children}
    </section>
  )
}

function Evidence({ writeup, onChange }: { writeup: Writeup; onChange: (w: Writeup) => void }) {
  const api = useApi()
  const [url, setUrl] = useState('')
  const add = useMutation((u: string) => api.addWriteupEvidence(writeup.id, u))
  const remove = useMutation((key: string) => api.removeWriteupEvidence(writeup.id, key))
  const recheck = useMutation((key: string) => api.recheckWriteupEvidence(writeup.id, key))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = await add.run(url)
    if (next) {
      onChange(next)
      setUrl('')
    }
  }

  return (
    <section className="stack gap-10 side-section" aria-labelledby="w-evidence">
      <h2 id="w-evidence" className="eyebrow">
        Evidence
      </h2>
      {writeup.evidence.length === 0 && (
        <p className="small muted">
          {features.workspace
            ? 'Link the MRs, PRs, issues or docs behind this. They become sources on the record.'
            : 'Paste the PRs or issues behind this. Ledger verifies them with GitHub and turns them into verified badges.'}
        </p>
      )}
      <ul className="plain-list evidence-edit">
        {writeup.evidence.map((e) => (
          <li key={e.key} className="evidence-edit__item">
            <SourceIcon kind={e.kind} />
            <span className="evidence-edit__title">
              {e.title}
              {e.private && e.verified && <Icon name="lock" size={11} />}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${e.title}`}
              disabled={remove.pending}
              onClick={async () => {
                const next = await remove.run(e.key)
                if (next) onChange(next)
              }}
            >
              <Icon name="x" size={14} />
            </button>
            {e.private && e.verified && (
              <span className="evidence-edit__reason small muted">Only you see the title — readers see “private GitHub project”.</span>
            )}
            {e.failureReason && (
              <span className="evidence-edit__reason">
                <Icon name="alert" size={11} /> {e.failureReason}
              </span>
            )}
            {(e.failureCode === 'app_not_installed' || e.failureCode === 'repo_not_in_installation') && (
              <span className="row gap-6 evidence-edit__actions">
                <a href={e.installUrl} className="btn btn--primary btn--sm">
                  {e.failureCode === 'app_not_installed' ? `Install Ledger on ${e.owner}` : 'Give Ledger access to this repo'}
                </a>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={recheck.pending}
                  onClick={async () => {
                    const next = await recheck.run(e.key)
                    if (next) onChange(next)
                  }}
                >
                  Check again
                </button>
              </span>
            )}
            {e.refreshWarning && (
              <span className="evidence-edit__warning" title="Couldn't re-check this on the last republish — the previous result still stands.">
                <Icon name="alert" size={11} /> {e.refreshWarning}
              </span>
            )}
          </li>
        ))}
      </ul>
      <form className="stack gap-6" onSubmit={submit}>
        <label htmlFor="w-evidence-url" className="sr-only">
          Evidence link
        </label>
        <div className="row gap-8">
          <input
            id="w-evidence-url"
            className="input input--dashed"
            type="url"
            inputMode="url"
            placeholder="Paste an MR, PR, issue or doc link"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              add.clearError()
            }}
          />
          <button type="submit" className="btn" disabled={!url.trim() || add.pending}>
            Add
          </button>
        </div>
        <FieldError message={add.error} />
      </form>
    </section>
  )
}
