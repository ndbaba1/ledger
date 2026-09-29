import type { User } from '../api/types'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

/** The identity block at the top of a profile: avatar, name, headline, stack, links. */
export function ProfileHeader({ user }: { user: User }) {
  const links = user.links
  return (
    <section className="profile-head" aria-label="Profile">
      <Avatar user={user} size="xl" />
      <div className="stack gap-8">
        <div className="row gap-12 wrap baseline">
          <h1 className="page-title">{user.name}</h1>
          <span className="mono muted">@{user.handle}</span>
        </div>
        {(user.headline || user.location) && <p className="text">{[user.headline, user.location].filter(Boolean).join(' · ')}</p>}
        {user.stack && user.stack.length > 0 && (
          <div className="row gap-6 wrap">
            {user.stack.map((s) => (
              <span key={s} className="chip">
                {s}
              </span>
            ))}
          </div>
        )}
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
    </section>
  )
}
