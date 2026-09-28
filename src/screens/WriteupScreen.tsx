import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { Writeup, WriteupFields, WriteupStatus } from '../api/types'
import { useSession } from '../app/session'
import { Icon } from '../components/Icon'
import { Inline } from '../components/Inline'
import { PaneTabs } from '../components/PaneTabs'
import { KindPill, PostContent } from '../components/PostContent'
import { SourceIcon } from '../components/Tags'
import { ErrorState, FieldError, Loading } from '../components/States'
import { relativeTime } from '../lib/format'
import { sectionsFor } from '../lib/publicPost'
import { useMutation, useQuery } from '../lib/useAsync'
import { TYPE_INFO, publishRequirements, toLines, writeupToRecord, type FieldDef } from '../lib/writeups'

type View = 'write' | 'preview' | 'side'

/** Editable text for every field; list fields are kept as raw text while typing. */
interface FormText {
  title: string
  context: string
  symptom: string
  constraints: string
  rootCause: string
  flow: string
  ruledOut: string
  fix: string
  lesson: string
  resultLabel: string
  resultBefore: string
  resultAfter: string
}

function toForm(w: Writeup): FormText {
  return {
    title: w.title,
    context: w.context,
    symptom: w.symptom,
    constraints: w.constraints.join('\n'),
    rootCause: w.rootCause,
    flow: w.flow.join('\n'),
    ruledOut: w.ruledOut.join('\n'),
    fix: w.fix,
    lesson: w.lesson,
    resultLabel: w.result?.label ?? '',
    resultBefore: w.result?.before ?? '',
    resultAfter: w.result?.after ?? '',
  }
}

function toFields(f: FormText): WriteupFields {
  const hasResult = f.resultLabel.trim() || f.resultBefore.trim() || f.resultAfter.trim()
  return {
    title: f.title,
    context: f.context,
    symptom: f.symptom,
    constraints: toLines(f.constraints),
    rootCause: f.rootCause,
    flow: toLines(f.flow),
    ruledOut: toLines(f.ruledOut),
    fix: f.fix,
    lesson: f.lesson,
    result: hasResult
      ? { label: f.resultLabel.trim(), before: f.resultBefore.trim(), after: f.resultAfter.trim() }
      : undefined,
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
  const { me, workspace } = useSession()
  const [w, setW] = useState(initial)
  const [form, setForm] = useState<FormText>(() => toForm(initial))
  const [view, setView] = useState<View>('write')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const dirty = useRef(false)
  const info = TYPE_INFO[w.type]

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

  const set = (key: keyof FormText, value: string) => {
    dirty.current = true
    setForm((f) => ({ ...f, [key]: value }))
  }

  const status = useMutation((s: WriteupStatus) => api.setWriteupStatus(w.id, s))
  const publish = useMutation(async () => {
    await api.saveWriteup(w.id, fields)
    return api.publishWriteup(w.id)
  })

  const onPublish = async () => {
    const record = await publish.run()
    if (record) navigate(`/records/${record.id}`, { state: { justPublished: true } })
  }

  const previewRecord = writeupToRecord({ ...current }, { id: 'preview', publishedAt: w.updatedAt, authorId: me.id })
  const isDesign = w.type === 'design'
  const canPublish = missing === 0 && !publish.pending

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
          <Link to="/inbox">inbox</Link>
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
              <input
                id="w-title"
                className="writer__title"
                placeholder={`Title, e.g. ${info.example}`}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
              {info.fields.map((f) => (
                <Field key={f.key} def={f} value={form[f.key]} onChange={(v) => set(f.key, v)} />
              ))}
              <fieldset className="writer__field fieldset">
                <legend className="writer__label">
                  Result <span className="writer__opt">{isDesign ? 'needed before publishing' : 'optional'}</span>
                </legend>
                <p className="writer__help" id="w-result-help">
                  One number that moved, e.g. “Checkout p99: 4.2s → 310ms”.
                </p>
                <div className="result-inputs">
                  <label className="stack gap-4">
                    <span className="small muted">Measure</span>
                    <input className="input" value={form.resultLabel} onChange={(e) => set('resultLabel', e.target.value)} placeholder="Checkout p99" aria-describedby="w-result-help" />
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
              </fieldset>
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

          <Evidence writeup={w} onChange={(next) => setW((prev) => ({ ...prev, evidence: next.evidence }))} />

          <section className="stack gap-10 side-section" aria-labelledby="w-ready">
            <h2 id="w-ready" className="eyebrow">
              Ready to publish
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
            <FieldError message={publish.error} />
            <button type="button" className="btn btn--primary" onClick={onPublish} disabled={!canPublish}>
              {publish.pending ? 'Publishing…' : `Publish to ${workspace.name}`}
            </button>
            <p className="small muted">
              {missing > 0
                ? `${missing} thing${missing === 1 ? '' : 's'} left. Drafts stay private to you.`
                : 'Teammates will see it in records and search. You can promote it to public afterwards.'}
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Field({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const id = `w-${def.key}`
  const helpId = `${id}-help`
  return (
    <div className="writer__field">
      <label htmlFor={id} className="writer__label">
        {def.label} {!def.required && <span className="writer__opt">optional</span>}
      </label>
      <p id={helpId} className="writer__help">
        {def.help}
      </p>
      {def.kind === 'short' ? (
        <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={helpId} />
      ) : (
        <textarea
          id={id}
          className={`input${def.kind === 'lines' ? ' input--lines' : ''}`}
          rows={def.kind === 'lines' ? 3 : 4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={helpId}
          aria-required={def.required || undefined}
        />
      )}
    </div>
  )
}

function Evidence({ writeup, onChange }: { writeup: Writeup; onChange: (w: Writeup) => void }) {
  const api = useApi()
  const [url, setUrl] = useState('')
  const add = useMutation((u: string) => api.addWriteupEvidence(writeup.id, u))
  const remove = useMutation((key: string) => api.removeWriteupEvidence(writeup.id, key))

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
        <p className="small muted">Link the MRs, PRs, issues or docs behind this. They become sources on the record.</p>
      )}
      <ul className="plain-list evidence-edit">
        {writeup.evidence.map((e) => (
          <li key={e.key} className="evidence-edit__item">
            <SourceIcon kind={e.kind} />
            <span className="evidence-edit__title">{e.title}</span>
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
