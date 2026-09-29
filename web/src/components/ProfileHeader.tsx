import type { User } from '../api/types'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

export type ProfileEditField = 'name' | 'headline' | 'stack' | 'links'

/** The identity block at the top of a profile: avatar, name, headline, stack, links. */
export function ProfileHeader({
  user,
  isMe = false,
  onEdit,
}: {
  user: User
  /** Show the edit affordances — only ever true on your own profile. */
  isMe?: boolean
  onEdit?: (field?: ProfileEditField) => void
}) {
  const links = user.links
  const hasHeadlineLine = user.headline || user.location || isMe

  return (
    <section className="profile-head" aria-label="Profile">
      <Avatar user={user} size="xl" />
      <div className="profile-head__content stack gap-8">
        <div className="row gap-12 wrap baseline">
          <h1 className="page-title">{user.name}</h1>
          <span className="mono muted">@{user.handle}</span>
        </div>

        {hasHeadlineLine && (
          <p className="text">
            {user.headline ? (
              user.headline
            ) : isMe ? (
              <button type="button" className="profile-head__prompt" onClick={() => onEdit?.('headline')}>
                + Add a headline
              </button>
            ) : null}
            {user.location && (
              <span>
                {(user.headline || isMe) && ' · '}
                {user.location}
              </span>
            )}
          </p>
        )}

        {user.stack && user.stack.length > 0 ? (
          <div className="row gap-6 wrap">
            {user.stack.map((s) => (
              <span key={s} className="chip">
                {s}
              </span>
            ))}
          </div>
        ) : isMe ? (
          <button type="button" className="profile-head__prompt" onClick={() => onEdit?.('stack')}>
            + Add your stack
          </button>
        ) : null}

        {links && (links.github || links.website || links.linkedin) && (
          <div className="row gap-8" aria-label="Links">
            {links.github && (
              <a href={links.github} target="_blank" rel="noreferrer" className="icon-btn" aria-label="GitHub" title="GitHub">
                <Icon name="github" size={16} />
              </a>
            )}
            {links.website && (
              <a href={links.website} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Website" title="Website">
                <Icon name="globe" size={16} />
              </a>
            )}
            {links.linkedin && (
              <a href={links.linkedin} target="_blank" rel="noreferrer" className="icon-btn" aria-label="LinkedIn" title="LinkedIn">
                <Icon name="link" size={16} />
              </a>
            )}
          </div>
        )}
      </div>

      {isMe && (
        <button id="profile-edit-button" type="button" className="btn btn--sm profile-head__edit" onClick={() => onEdit?.()}>
          <Icon name="pencil" size={13} />
          Edit profile
        </button>
      )}
    </section>
  )
}
