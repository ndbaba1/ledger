import type { User } from '../api/types'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export function Avatar({ user, size = 'sm' }: { user: Pick<User, 'initials' | 'avatarHue' | 'name'>; size?: Size }) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{
        background: `hsl(${user.avatarHue} 32% 26%)`,
        color: `hsl(${user.avatarHue} 85% 90%)`,
      }}
      title={user.name}
    >
      {user.initials}
    </span>
  )
}

export function AvatarStack({ users, size = 'xs' }: { users: User[]; size?: Size }) {
  return (
    <span className="avatar-stack" aria-label={users.map((u) => u.name).join(', ')}>
      {users.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
    </span>
  )
}
