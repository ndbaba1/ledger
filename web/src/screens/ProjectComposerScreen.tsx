import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { EmployerMode, ID, ProjectOptions, ProjectPlan, ProjectRole, RedactionRule } from '../api/types'
import { useSession } from '../app/session'
import { Icon } from '../components/Icon'
import { KindMeta } from '../components/ListBox'
import { PaneTabs } from '../components/PaneTabs'
import { ProjectSummary } from '../components/ProjectSummary'
import { ErrorState, FieldError, Loading } from '../components/States'
import { buildProject, canClaimLead, projectProblems } from '../lib/project'
import { useMutation, useQuery } from '../lib/useAsync'

type Pane = 'redactions' | 'preview'

/** Name a project EngLog noticed, choose what backs it, and publish it to your profile. */
export function ProjectComposerScreen() {
  const { id = '' } = useParams()
  const api = useApi()
  const data = useQuery(() => Promise.all([api.getProjectPlan(id), api.getWorkspaceSettings()]), [api, id])
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  if (!data.data) return <Loading label="Gathering the project" />
  const [plan, settings] = data.data
  return <Composer key={plan.candidate.id} plan={plan} allowed={settings.policy.publicPromotion === 'allowed'} />
}

function initialOptions(plan: ProjectPlan, meId: ID): ProjectOptions {
  const { candidate, records, published } = plan
  const mine = records.filter((r) => r.authorIds.includes(meId))
  const recordIds = mine.map((r) => r.id)
  const chosen = mine
  const withResult = chosen.filter((r) => r.result)
  return {
    title: published?.title ?? candidate.suggestedTitle,
    role: published?.role ?? (canClaimLead(chosen, meId) ? 'led' : 'contributed'),
    recordIds,
    decisionRecordIds: chosen.filter((r) => r.type === 'decision' || r.type === 'design').map((r) => r.id),
    outcomeRecordId: withResult.find((r) => r.type === 'design')?.id ?? withResult[0]?.id ?? null,
    enabledRuleIds: plan.rules.map((r) => r.id),
    employerMode: published ? (published.employerLine ? 'industry' : 'hidden') : 'hidden',
  }
}

function Composer({ plan, allowed }: { plan: ProjectPlan; allowed: boolean }) {
  const api = useApi()
  const navigate = useNavigate()
  const { me } = useSession()
  const [pane, setPane] = useState<Pane>('redactions')
  const [opts, setOpts] = useState<ProjectOptions>(() => initialOptions(plan, me.id))
  const set = (patch: Partial<ProjectOptions>) => setOpts((o) => ({ ...o, ...patch }))
  const publish = useMutation(() => api.publishProject(plan.candidate.id, opts))

  const { candidate, records } = plan
  const chosen = records.filter((r) => opts.recordIds.includes(r.id))
  const problems = projectProblems(candidate, records, opts, me.id)
  const leadOk = canClaimLead(chosen, me.id)
  const employerLine =
    opts.employerMode === 'hidden' ? undefined : `at ${opts.employerMode === 'industry' ? plan.industryLabel : plan.workspaceName}`

  const preview = useMemo(
    () =>
      buildProject(candidate, records, opts, {
        authorId: me.id,
        slug: candidate.publishedSlug ?? 'preview',
        publishedAt: new Date(0).toISOString(),
        rules: plan.rules,
        employerLine,
      }),
    [candidate, records, opts, me.id, plan.rules, employerLine],
  )

  const toggleRecord = (rid: ID) => {
    const on = opts.recordIds.includes(rid)
    const recordIds = on ? opts.recordIds.filter((x) => x !== rid) : [...opts.recordIds, rid]
    set({
      recordIds,
      decisionRecordIds: opts.decisionRecordIds.filter((x) => recordIds.includes(x)),
      outcomeRecordId: opts.outcomeRecordId && recordIds.includes(opts.outcomeRecordId) ? opts.outcomeRecordId : null,
    })
  }
  const toggleRule = (rule: RedactionRule) =>
    set({
      enabledRuleIds: opts.enabledRuleIds.includes(rule.id)
        ? opts.enabledRuleIds.filter((x) => x !== rule.id)
        : [...opts.enabledRuleIds, rule.id],
    })

  const onPublish = async () => {
    const project = await publish.run()
    if (project) navigate(`/u/${me.handle}/projects/${project.slug}`)
  }

  const authored = candidate.changes.filter((c) => c.role === 'authored').length
  const decisionChoices = chosen.filter((r) => r.type === 'decision' || r.type === 'design')
  const outcomeChoices = chosen.filter((r) => r.result)

  return (
    <div className="page page--split">
      <div className="row gap-12 page-toolbar wrap">
        <Link to="/inbox#projects" className="icon-btn icon-btn--outlined" aria-label="Back to inbox">
          <Icon name="arrowLeft" size={16} />
        </Link>
        <div className="stack gap-2">
          <h1 className="page-title page-title--sm">{candidate.publishedSlug ? 'Update project' : 'Publish a project'}</h1>
          <span className="mono muted small">
            {candidate.groupedBy} → @{me.handle}
          </span>
        </div>
      </div>

      <PaneTabs<Pane>
        label="Project"
        active={pane}
        onChange={setPane}
        tabs={[
          { key: 'redactions', label: 'Choose' },
          { key: 'preview', label: 'Preview' },
        ]}
      />

      {!allowed && (
        <div className="banner banner--amber" role="status">
          <Icon name="lock" size={16} />
          <span>Your workspace has turned off publishing to public profiles. You can preview, but not publish.</span>
        </div>
      )}

      <div className="split split--promote" data-pane={pane}>
        <section className="split__side split__side--left stack gap-20" aria-label="Project details">
          <div className="stack gap-6">
            <label htmlFor="project-title" className="side-title">
              Name
            </label>
            <input
              id="project-title"
              className="input"
              value={opts.title}
              maxLength={120}
              onChange={(e) => set({ title: e.target.value })}
            />
            <p className="small muted">
              The only line in your words. Evidence, decisions and outcome are counted or quoted by EngLog, so they can’t be inflated.
            </p>
          </div>

          <fieldset className="stack gap-8 fieldset">
            <legend className="eyebrow">Your role</legend>
            <div className="segmented">
              {(['led', 'contributed'] as ProjectRole[]).map((r) => (
                <label
                  key={r}
                  className={`segmented__opt${opts.role === r ? ' segmented__opt--on' : ''}${r === 'led' && !leadOk ? ' segmented__opt--off' : ''}`}
                >
                  <input type="radio" name="role" checked={opts.role === r} disabled={r === 'led' && !leadOk} onChange={() => set({ role: r })} />
                  {r === 'led' ? 'Led' : 'Contributed'}
                </label>
              ))}
            </div>
            {!leadOk && <p className="small muted">“Led” needs a design or decision record you wrote.</p>}
          </fieldset>

          <fieldset className="stack gap-6 fieldset">
            <legend className="eyebrow">Evidence</legend>
            <p className="small muted">
              <Icon name="merge" size={12} /> {candidate.changes.length} merge requests from {candidate.groupedBy.split(' · ')[0]}: {authored}{' '}
              authored, {candidate.changes.length - authored} reviewed. All are counted, so the numbers stay honest.
            </p>
            {records.map((r) => {
              const mine = r.authorIds.includes(me.id)
              return (
                <label key={r.id} className={`pick${mine ? '' : ' pick--off'}`}>
                  <input type="checkbox" checked={opts.recordIds.includes(r.id)} disabled={!mine} onChange={() => toggleRecord(r.id)} />
                  <span className="stack gap-2">
                    <span className="pick__title">{r.title}</span>
                    <span className="row gap-10 small muted wrap">
                      <KindMeta type={r.type} />
                      <span className="mono">{r.id}</span>
                      <span>{r.promotedPostSlug ? 'public post' : 'team-only'}</span>
                      {!mine && <span>you’re not an author</span>}
                    </span>
                  </span>
                </label>
              )
            })}
          </fieldset>

          {decisionChoices.length > 0 && (
            <fieldset className="stack gap-6 fieldset">
              <legend className="eyebrow">Key decisions</legend>
              {decisionChoices.map((r) => (
                <label key={r.id} className="pick">
                  <input
                    type="checkbox"
                    checked={opts.decisionRecordIds.includes(r.id)}
                    onChange={() =>
                      set({
                        decisionRecordIds: opts.decisionRecordIds.includes(r.id)
                          ? opts.decisionRecordIds.filter((x) => x !== r.id)
                          : [...opts.decisionRecordIds, r.id],
                      })
                    }
                  />
                  <span className="pick__title">{r.title}</span>
                </label>
              ))}
            </fieldset>
          )}

          <fieldset className="stack gap-6 fieldset">
            <legend className="eyebrow">Outcome</legend>
            {outcomeChoices.map((r) => (
              <label key={r.id} className="pick">
                <input type="radio" name="outcome" checked={opts.outcomeRecordId === r.id} onChange={() => set({ outcomeRecordId: r.id })} />
                <span className="stack gap-2">
                  <span className="pick__title">
                    {r.result!.before} → {r.result!.after}
                  </span>
                  <span className="small muted">
                    {r.result!.label} · from {r.id}
                  </span>
                </span>
              </label>
            ))}
            <label className="pick">
              <input type="radio" name="outcome" checked={opts.outcomeRecordId === null} onChange={() => set({ outcomeRecordId: null })} />
              <span className="pick__title muted">No outcome</span>
            </label>
            {outcomeChoices.length === 0 && (
              <p className="small muted">None of the included records has a before → after result, so there’s no outcome to show.</p>
            )}
          </fieldset>

          <fieldset className="stack gap-2 fieldset">
            <legend className="eyebrow">What leaves your company</legend>
            {plan.rules.map((rule) => {
              const on = opts.enabledRuleIds.includes(rule.id)
              const example = rule.replacements[0]
              return (
                <label key={rule.id} className={`rule${on ? ' rule--on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleRule(rule)} />
                  <span className="stack gap-2">
                    <span className="rule__label">{rule.label}</span>
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

          <fieldset className="stack gap-8 fieldset">
            <legend className="eyebrow">Show employer</legend>
            <div className="segmented">
              {(
                [
                  ['hidden', 'Hidden'],
                  ['industry', `“${plan.industryLabel}”`],
                  ['named', plan.workspaceName],
                ] as [EmployerMode, string][]
              ).map(([key, label]) => (
                <label key={key} className={`segmented__opt${opts.employerMode === key ? ' segmented__opt--on' : ''}`}>
                  <input type="radio" name="employer" checked={opts.employerMode === key} onChange={() => set({ employerMode: key })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="split__main preview-pane stack gap-14" aria-label="Project preview">
          <div className="row gap-10 wrap small muted mono">
            <span>PREVIEW</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">/@{me.handle} · Projects</span>
          </div>
          <div className="feed">
            <ul className="feed__list">
              <li>
                <ProjectSummary project={preview} handle={me.handle} linkTitle={false} />
              </li>
            </ul>
          </div>
          <p className="small muted">
            Merge request titles appear on the project page with the same replacements. Refs like <span className="mono">!1788</span>{' '}
            and repository names are never published.
          </p>

          {problems.length > 0 && (
            <ul className="plain-list stack gap-4" aria-label="Before you can publish">
              {problems.map((p) => (
                <li key={p} className="small text-amber row gap-6">
                  <Icon name="alert" size={13} />
                  {p}
                </li>
              ))}
            </ul>
          )}
          <FieldError message={publish.error} />
          <div className="row gap-10">
            <button type="button" className="btn btn--primary" disabled={!allowed || problems.length > 0 || publish.pending} onClick={onPublish}>
              {publish.pending ? 'Publishing…' : candidate.publishedSlug ? 'Update on my profile' : 'Publish to my profile'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
