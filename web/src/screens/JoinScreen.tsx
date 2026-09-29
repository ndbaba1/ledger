import { useNavigate, useParams } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { PublicLayout } from '../app/PublicLayout'
import { useSession } from '../app/session'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { FieldError, Loading } from '../components/States'
import { useMutation, useQuery } from '../lib/useAsync'

/** What someone sees when they open an invite email or link. */
export function JoinScreen() {
  const { token = '' } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const { refreshInbox } = useSession()
  const preview = useQuery(() => api.previewInvite(token), [api, token])
  const accept = useMutation(() => api.acceptInvite(token))

  const join = async () => {
    const ws = await accept.run()
    if (ws) {
      refreshInbox()
      navigate('/inbox', { replace: true })
    }
  }

  return (
    <PublicLayout>
      <div className="join">
        {preview.loading && !preview.data && <Loading label="Checking your invite" />}
        {preview.error && (
          <div className="join__card stack gap-12">
            <span className="join__icon join__icon--warn" aria-hidden="true">
              <Icon name="alert" size={22} />
            </span>
            <h1 className="join__title">This invite can’t be used</h1>
            <p className="muted">{preview.error.message}</p>
          </div>
        )}
        {preview.data && (
          <div className="join__card stack gap-16">
            <div className="row gap-10">
              <Avatar user={preview.data.invitedBy} size="md" />
              <span className="small muted">
                <strong className="text">{preview.data.invitedBy.name}</strong>{' '}
                {preview.data.rejoining ? 'invited you back' : 'invited you'}
                {preview.data.invitee ? (
                  <>
                    {' '}
                    as <span className="mono text">@{preview.data.invitee.handle}</span>
                  </>
                ) : preview.data.email ? (
                  <>
                    {' '}
                    as <span className="mono text">{preview.data.email}</span>
                  </>
                ) : null}
              </span>
            </div>
            <div className="stack gap-6">
              <span className="eyebrow">{preview.data.company}</span>
              <h1 className="join__title">Join {preview.data.workspace.name} on Ledger</h1>
              <p className="muted">
                {preview.data.memberCount} engineers · {preview.data.recordCount} records of how the team found and fixed things. You’ll
                join as {preview.data.role === 'admin' ? 'an admin' : `a ${preview.data.role}`}.
              </p>
            </div>
            <ul className="plain-list join__points">
              <li>
                <Icon name="search" size={14} /> Search every incident, investigation, decision and design the team has written up
              </li>
              <li>
                <Icon name="inbox" size={14} /> Get drafts of your own fixes to review, written from your issues, MRs and threads
              </li>
              <li>
                <Icon name="globe" size={14} /> Publish redacted versions to your own public profile, with verified proof
              </li>
            </ul>
            <FieldError message={accept.error} />
            <button type="button" className="btn btn--primary join__cta" onClick={join} disabled={accept.pending}>
              {accept.pending ? 'Joining…' : preview.data.invitee ? `Join as @${preview.data.invitee.handle}` : 'Join with GitHub'}
            </button>
            <p className="small muted">
              {preview.data.invitee
                ? 'Your account, username and public posts stay yours.'
                : 'You’ll pick a username when you sign in. It’s yours, not the company’s.'}{' '}
              If you leave {preview.data.company}, the team keeps its records, still credited to you, and your public profile goes
              with you.
            </p>
          </div>
        )}
      </div>
    </PublicLayout>
  )
}
