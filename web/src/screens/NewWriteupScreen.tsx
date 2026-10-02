import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { RecordType } from '../api/types'
import { Icon } from '../components/Icon'
import { KindPill } from '../components/PostContent'
import { StartFromSource } from '../components/StartFromSource'
import { FieldError } from '../components/States'
import { features } from '../lib/features'
import { useMutation } from '../lib/useAsync'
import { TYPE_INFO } from '../lib/writeups'

const ORDER: RecordType[] = ['incident', 'investigation', 'decision', 'design']

export function NewWriteupScreen() {
  const api = useApi()
  const navigate = useNavigate()
  const create = useMutation((type: RecordType) => api.createWriteup(type))
  const draftFromSource = useMutation((type: RecordType, url: string) => api.startDraftFromSource(url, type))
  const [pendingSource, setPendingSource] = useState<{ url: string; note?: string }>()

  // Back from installing the GitHub App on GitHub's own site, after the
  // drafting box's verification gate hit a private repo it couldn't see yet
  // — the URL comes back via ?url= (no write-up was created to return to,
  // see StartFromSource) so the box can be refilled and tried again.
  const [params, setParams] = useSearchParams()
  const initialUrl = params.get('url') ?? undefined
  useEffect(() => {
    if (!params.get('url') && params.get('installed') !== '1') return
    setParams(
      (p) => {
        p.delete('url')
        p.delete('installed')
        return p
      },
      { replace: true },
    )
    // Only ever react to these params on the redirect back from GitHub.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = async (type: RecordType) => {
    if (pendingSource) {
      const dr = await draftFromSource.run(type, pendingSource.url)
      if (dr?.writeupId) navigate(`/write/${dr.writeupId}`, { replace: true })
      return
    }
    const w = await create.run(type)
    if (w) navigate(`/write/${w.id}`, { replace: true })
  }

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">New write-up</h1>
          <p className="page-sub">
            Write it yourself from a template. It stays private until you publish it, and every write-up needs evidence — an
            MR, PR or issue — before it can {features.workspace ? 'go to the team' : 'be published'}.
          </p>
        </div>
      </header>

      {features.draftFromSource && (
        <StartFromSource
          initialUrl={initialUrl}
          onNeedsTemplate={(url, note) => setPendingSource({ url, note })}
          onDrafted={(writeupId) => navigate(`/write/${writeupId}`, { replace: true })}
        />
      )}

      {pendingSource && (
        <p className="small muted" role="status">
          {pendingSource.note ?? 'Not enough in the source to draft from.'} Pick a template below to draft a blank write-up with the source
          attached as evidence.
        </p>
      )}

      <ul className="type-grid">
        {ORDER.map((type) => {
          const info = TYPE_INFO[type]
          const required = info.fields.filter((f) => f.required).map((f) => f.label)
          return (
            <li key={type} className="type-grid__item">
            <button
              type="button"
              className="type-card"
              onClick={() => pick(type)}
              disabled={create.pending || draftFromSource.pending}
            >
              <KindPill type={type} />
              <span className="type-card__blurb">{info.blurb}</span>
              <span className="type-card__example">e.g. {info.example}</span>
              <span className="type-card__fields">
                {info.fields.map((f) => f.label).join(' · ')}
              </span>
              <span className="type-card__go">
                {pendingSource ? 'Draft it' : `Start ${info.label.toLowerCase()}`}
                <Icon name="arrowRight" size={14} />
              </span>
              <span className="sr-only">Required: {required.join(', ')}</span>
            </button>
            </li>
          )
        })}
      </ul>
      <FieldError message={create.error ?? draftFromSource.error} />
      <p className="small muted">
        Designs start as a <strong className="text">proposal</strong> you can write before building. They can be published once
        they’ve shipped, with the MRs that built them and a result after launch.
      </p>
    </div>
  )
}
