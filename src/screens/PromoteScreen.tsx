import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { EmployerMode, PromotionPlan, RedactionRule, TeamRecord } from '../api/types'
import { useSession } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Inline } from '../components/Inline'
import { PaneTabs } from '../components/PaneTabs'
import { ErrorState, FieldError, Loading } from '../components/States'
import { TypeTag, VerifiedBadge } from '../components/Tags'
import { publishableTexts, rawPostSections } from '../lib/publicPost'
import { countMatches, redact } from '../lib/redact'
import { useMutation, useQuery } from '../lib/useAsync'

type Pane = 'redactions' | 'preview'

export function PromoteScreen() {
  const { id = '' } = useParams()
  const api = useApi()
  const data = useQuery(() => Promise.all([api.getRecord(id), api.getPromotionPlan(id)]), [api, id])

  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  if (!data.data) return <Loading label="Preparing the public version" />
  const [record, plan] = data.data
  return <PromoteView record={record} plan={plan} />
}

const EMPLOYER_OPTIONS: { key: EmployerMode; label: (p: PromotionPlan) => string }[] = [
  { key: 'hidden', label: () => 'Hidden' },
  { key: 'industry', label: (p) => `“${p.industryLabel}”` },
  { key: 'named', label: (p) => p.workspaceName },
]

function PromoteView({ record, plan }: { record: TeamRecord; plan: PromotionPlan }) {
  const api = useApi()
  const navigate = useNavigate()
  const { me } = useSession()
  const [pane, setPane] = useState<Pane>('redactions')
  const [rules, setRules] = useState<RedactionRule[]>(plan.rules)
  const [employer, setEmployer] = useState<EmployerMode>('hidden')
  const publish = useMutation(() =>
    api.publishPost(record.id, { enabledRuleIds: rules.filter((r) => r.enabled).map((r) => r.id), employerMode: employer }),
  )

  const texts = useMemo(() => publishableTexts(record), [record])
  const counts = useMemo(() => new Map(plan.rules.map((r) => [r.id, countMatches(r, texts)])), [plan.rules, texts])
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const sections = useMemo(() => rawPostSections(record), [record])
  const badges = plan.evidence.filter((e) => e.becomes).map((e) => e.becomes!)
  const employerLine =
    employer === 'hidden' ? null : `at ${employer === 'industry' ? plan.industryLabel : plan.workspaceName}`

  const toggle = (id: string) => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))

  const onPublish = async () => {
    const post = await publish.run()
    if (post) navigate(`/u/${me.handle}/${post.slug}`, { state: { justPublished: true } })
  }

  return (
    <div className="page page--split">
      <div className="row gap-12 page-toolbar wrap">
        <Link to={`/records/${record.id}`} className="icon-btn icon-btn--outlined" aria-label="Back to record">
          <Icon name="arrowLeft" size={16} />
        </Link>
        <div className="stack gap-2">
          <h1 className="page-title page-title--sm">{record.promotedPostSlug ? 'Update public post' : 'Promote to public'}</h1>
          <span className="mono muted small">
            {record.id} → @{me.handle}
          </span>
        </div>
      </div>

      <PaneTabs<Pane>
        label="Promotion"
        active={pane}
        onChange={setPane}
        tabs={[
          { key: 'redactions', label: 'What leaves' },
          { key: 'preview', label: 'Preview' },
        ]}
      />

      <div className="split split--promote" data-pane={pane}>
        <section className="split__side split__side--left stack gap-20" aria-label="Redactions">
          <div className="stack gap-4">
            <h2 className="side-title">What leaves your company</h2>
            <p className="small muted">
              Ledger found {total} company-specific detail{total === 1 ? '' : 's'}. Each is replaced in the preview; untick a rule to
              publish that text as written.
            </p>
          </div>

          <fieldset className="stack gap-2 fieldset">
            <legend className="eyebrow">Replacements</legend>
            {rules.map((rule) => {
              const n = counts.get(rule.id) ?? 0
              const example = rule.replacements[0]
              return (
                <label key={rule.id} className={`rule${rule.enabled ? ' rule--on' : ''}`}>
                  <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule.id)} />
                  <span className="stack gap-2">
                    <span className="rule__label">
                      {rule.label} <span className="mono muted small">× {n}</span>
                    </span>
                    {example && (
                      <span className="mono small muted rule__example">
                        {example.match} → {example.with || 'removed'}
                        {rule.replacements.length > 1 && ` (+${rule.replacements.length - 1})`}
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </fieldset>

          <div className="stack gap-8">
            <span className="eyebrow">Evidence becomes proof</span>
            <ul className="evidence">
              {plan.evidence.map(({ source, becomes }) => (
                <li key={source.key} className="evidence__row">
                  <span className="mono small muted evidence__from">{source.title}</span>
                  <Icon name="arrowRight" size={14} className="muted" />
                  <span className={`small ${becomes ? 'text-green' : 'muted'}`}>
                    {becomes ? `Verified: ${becomes.label.toLowerCase()}` : 'Not shown publicly'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <fieldset className="stack gap-8 fieldset">
            <legend className="eyebrow">Show employer</legend>
            <div className="segmented">
              {EMPLOYER_OPTIONS.map((o) => (
                <label key={o.key} className={`segmented__opt${employer === o.key ? ' segmented__opt--on' : ''}`}>
                  <input type="radio" name="employer" checked={employer === o.key} onChange={() => setEmployer(o.key)} />
                  {o.label(plan)}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="split__main preview-pane stack gap-14" aria-label="Public post preview">
          <div className="row gap-10 wrap small muted mono">
            <span>PREVIEW</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">
              /@{me.handle}/{plan.slug}
            </span>
            <span className="row gap-12 push-right">
              <span className="row gap-6">
                <span className="swatch swatch--replaced" aria-hidden="true" />
                replaced
              </span>
              <span className="row gap-6">
                <span className="swatch swatch--removed" aria-hidden="true" />
                removed
              </span>
            </span>
          </div>

          <article className="post-card post-card--preview">
            <div className="row gap-10">
              <Avatar user={me} size="md" />
              <div className="stack">
                <span className="strong">{me.name}</span>
                <span className="mono small muted">
                  @{me.handle}
                  {employerLine && ` · ${employerLine}`}
                </span>
              </div>
            </div>
            <div className="row gap-8">
              <TypeTag type={record.type} />
            </div>
            <h2 className="doc-title">
              <Redacted text={record.title} rules={rules} />
            </h2>
            {sections.map((s) => (
              <section key={s.heading} className="stack gap-6">
                <h3 className="eyebrow">{s.heading}</h3>
                {s.body.includes('\n') || s.body.startsWith('- ') ? (
                  <ul className="prose-list">
                    {s.body.split('\n').map((line, i) => (
                      <li key={i}>
                        <Redacted text={line.replace(/^- /, '')} rules={rules} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="prose">
                    <Redacted text={s.body} rules={rules} />
                  </p>
                )}
              </section>
            ))}
            {badges.length > 0 && (
              <div className="row gap-8 wrap">
                {badges.map((b) => (
                  <VerifiedBadge key={b.label} label={b.label} detail={b.detail} />
                ))}
              </div>
            )}
          </article>
          <p className="small muted">Badges are checked against GitLab and GitHub at publish time. Readers see the badge, never the private link.</p>
        </section>
      </div>

      <div className="action-bar">
        <div className="action-bar__inner">
          <span className="action-bar__hint small muted">Publishes to your public profile. You can update or unpublish it later.</span>
          <FieldError message={publish.error} />
          <button type="button" className="btn btn--primary" onClick={onPublish} disabled={publish.pending}>
            {publish.pending ? 'Publishing…' : record.promotedPostSlug ? 'Update post' : 'Publish post'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Redacted({ text, rules }: { text: string; rules: RedactionRule[] }) {
  return (
    <>
      {redact(text, rules).map((seg, i) =>
        seg.kind === 'plain' ? (
          <Inline key={i} text={seg.text} />
        ) : seg.kind === 'replaced' ? (
          <mark key={i} className="redact redact--replaced" title={`was: ${seg.original}`}>
            {seg.text}
          </mark>
        ) : (
          <del key={i} className="redact redact--removed">
            {seg.text}
          </del>
        ),
      )}
    </>
  )
}
