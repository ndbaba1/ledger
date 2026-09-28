import { useNavigate } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { RecordType } from '../api/types'
import { Icon } from '../components/Icon'
import { KindPill } from '../components/PostContent'
import { FieldError } from '../components/States'
import { useMutation } from '../lib/useAsync'
import { TYPE_INFO } from '../lib/writeups'

const ORDER: RecordType[] = ['incident', 'investigation', 'decision', 'design']

export function NewWriteupScreen() {
  const api = useApi()
  const navigate = useNavigate()
  const create = useMutation((type: RecordType) => api.createWriteup(type))

  const pick = async (type: RecordType) => {
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
            MR, PR or issue — before it can go to the team.
          </p>
        </div>
      </header>

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
              disabled={create.pending}
            >
              <KindPill type={type} />
              <span className="type-card__blurb">{info.blurb}</span>
              <span className="type-card__example">e.g. {info.example}</span>
              <span className="type-card__fields">
                {info.fields.map((f) => f.label).join(' · ')}
              </span>
              <span className="type-card__go">
                Start {info.label.toLowerCase()}
                <Icon name="arrowRight" size={14} />
              </span>
              <span className="sr-only">Required: {required.join(', ')}</span>
            </button>
            </li>
          )
        })}
      </ul>
      <FieldError message={create.error} />
      <p className="small muted">
        Designs start as a <strong className="text">proposal</strong> you can write before building. They can be published once
        they’ve shipped, with the MRs that built them and a result after launch.
      </p>
    </div>
  )
}
