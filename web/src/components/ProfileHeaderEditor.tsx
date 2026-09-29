import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useBlocker } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import type { User } from '../api/types'
import { useMutation } from '../lib/useAsync'
import { Avatar } from './Avatar'
import { FieldError } from './States'
import { Icon } from './Icon'
import { TagInput } from './TagInput'
import type { ProfileEditField } from './ProfileHeader'

const STACK_SUGGESTIONS = ['go', 'ruby', 'rails', 'python', 'typescript', 'postgres', 'redis', 'kafka', 'kubernetes', 'aws', 'react', 'rust']

const HEADLINE_MAX = 160
const NAME_MAX = 100
const LOCATION_MAX = 100

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i])
}

/**
 * `useBlocker` needs a data router; this app uses a plain HashRouter /
 * MemoryRouter, so it throws. Fall back to relying on beforeunload alone.
 */
function useOptionalBlocker(shouldBlock: boolean) {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useBlocker(shouldBlock)
  } catch {
    return undefined
  }
}

/** In-place editor for your own profile header — same layout as ProfileHeader. */
export function ProfileHeaderEditor({
  user,
  focus = 'name',
  onSaved,
  onCancel,
}: {
  user: User
  focus?: ProfileEditField
  onSaved: (user: User) => void
  onCancel: () => void
}) {
  const api = useApi()
  const [name, setName] = useState(user.name)
  const [headline, setHeadline] = useState(user.headline ?? '')
  const [location, setLocation] = useState(user.location ?? '')
  const [stack, setStack] = useState(user.stack ?? [])
  const [website, setWebsite] = useState(user.links?.website ?? '')
  const [linkedin, setLinkedin] = useState(user.links?.linkedin ?? '')

  const nameRef = useRef<HTMLInputElement>(null)
  const headlineRef = useRef<HTMLInputElement>(null)
  const websiteRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focus === 'headline') headlineRef.current?.focus()
    else if (focus === 'stack') document.getElementById('profile-editor-stack')?.focus()
    else if (focus === 'links') websiteRef.current?.focus()
    else nameRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cleanStack = stack.map((s) => s.trim()).filter(Boolean)
  const dirty =
    name.trim() !== user.name ||
    headline.trim() !== (user.headline ?? '') ||
    location.trim() !== (user.location ?? '') ||
    !sameTags(cleanStack, user.stack ?? []) ||
    website.trim() !== (user.links?.website ?? '') ||
    linkedin.trim() !== (user.links?.linkedin ?? '')

  const save = useMutation(() =>
    api.updateMe({
      name: name.trim(),
      headline: headline.trim(),
      location: location.trim(),
      stack: cleanStack,
      links: { website: website.trim(), linkedin: linkedin.trim() },
    }),
  )

  const errorFor = (keyword: string) => (save.error?.toLowerCase().includes(keyword) ? save.error : undefined)
  const nameError = errorFor('name')
  const headlineError = errorFor('headline')
  const locationError = errorFor('location')
  const stackError = errorFor('stack')
  const generalError = save.error && !nameError && !headlineError && !locationError && !stackError ? save.error : undefined

  const handleSave = async () => {
    const updated = await save.run()
    if (updated) onSaved(updated)
  }

  const handleCancel = () => {
    onCancel()
  }

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const blocker = useOptionalBlocker(dirty && !save.pending)
  useEffect(() => {
    if (!blocker || blocker.state !== 'blocked') return
    if (window.confirm('Discard your changes?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  const githubHandle = user.links?.github?.replace(/^https?:\/\//, '') ?? `github.com/${user.handle}`

  return (
    <section className="profile-head" aria-label="Edit profile" onKeyDown={onKeyDown}>
      <div className="stack gap-8">
        <Avatar user={user} size="xl" />
        <span className="small muted">Photo comes from GitHub</span>
      </div>

      <div className="profile-head__content stack gap-16">
        {generalError && <FieldError message={generalError} />}

        <div className="profile-editor__field">
          <label className="profile-editor__label" htmlFor="profile-editor-name">
            Name
          </label>
          <input
            ref={nameRef}
            id="profile-editor-name"
            className="input page-title"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError message={nameError} />
        </div>

        <div className="profile-editor__field">
          <div className="profile-editor__top">
            <label className="profile-editor__label" htmlFor="profile-editor-headline">
              Headline
            </label>
            {headline.length >= HEADLINE_MAX * 0.8 && (
              <span className="profile-editor__count">
                {headline.length}/{HEADLINE_MAX}
              </span>
            )}
          </div>
          <input
            ref={headlineRef}
            id="profile-editor-headline"
            className="input"
            value={headline}
            maxLength={HEADLINE_MAX}
            placeholder="Senior backend engineer · building something"
            onChange={(e) => setHeadline(e.target.value)}
          />
          <p className="profile-editor__hint">Your role and what you work on</p>
          <FieldError message={headlineError} />
        </div>

        <div className="profile-editor__field">
          <label className="profile-editor__label" htmlFor="profile-editor-location">
            Location
          </label>
          <input
            id="profile-editor-location"
            className="input"
            value={location}
            maxLength={LOCATION_MAX}
            onChange={(e) => setLocation(e.target.value)}
          />
          <FieldError message={locationError} />
        </div>

        <div className="profile-editor__field">
          <span className="profile-editor__label" id="profile-editor-stack-label">
            Stack
          </span>
          <TagInput
            id="profile-editor-stack"
            tags={stack}
            onChange={setStack}
            max={12}
            suggestions={STACK_SUGGESTIONS}
            describedBy="profile-editor-stack-hint"
          />
          <p className="profile-editor__hint" id="profile-editor-stack-hint">
            Press Enter or comma after each one.
          </p>
          <FieldError message={stackError} />
        </div>

        <div className="profile-editor__field">
          <span className="profile-editor__label">Links</span>
          <div className="profile-editor__locked">
            <Icon name="lock" size={14} />
            <span>{githubHandle}</span>
            <span className="profile-editor__locked-note">from sign-in</span>
          </div>
          <label className="sr-only" htmlFor="profile-editor-website">
            Website
          </label>
          <input
            ref={websiteRef}
            id="profile-editor-website"
            className="input"
            type="url"
            placeholder="Website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <label className="sr-only" htmlFor="profile-editor-linkedin">
            LinkedIn
          </label>
          <input
            id="profile-editor-linkedin"
            className="input"
            type="url"
            placeholder="LinkedIn"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
          />
        </div>

        <div className="row gap-8 profile-editor__actions">
          <button type="button" className="btn btn--primary" disabled={!dirty || save.pending} onClick={handleSave}>
            {save.pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  )
}
