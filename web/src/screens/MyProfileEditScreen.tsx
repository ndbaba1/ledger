import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../api/ApiContext'
import { PublicLayout } from '../app/PublicLayout'
import { useMe, useSetMe } from '../app/session'
import { ListEditor } from '../components/ListEditor'
import { ProfileHeader } from '../components/ProfileHeader'
import { FieldError } from '../components/States'
import { useMutation } from '../lib/useAsync'

/** Edit your own name, headline, location, stack and links, with a live preview. */
export function MyProfileEditScreen() {
  const api = useApi()
  const navigate = useNavigate()
  const me = useMe()!
  const setMe = useSetMe()

  const [name, setName] = useState(me.name)
  const [headline, setHeadline] = useState(me.headline ?? '')
  const [location, setLocation] = useState(me.location ?? '')
  const [stack, setStack] = useState(me.stack ?? [])
  const [website, setWebsite] = useState(me.links?.website ?? '')
  const [linkedin, setLinkedin] = useState(me.links?.linkedin ?? '')

  const save = useMutation(() =>
    api.updateMe({
      name: name.trim(),
      headline: headline.trim(),
      location: location.trim(),
      stack: stack.map((s) => s.trim()).filter(Boolean),
      links: { website: website.trim(), linkedin: linkedin.trim() },
    }),
  )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const updated = await save.run()
    if (updated) {
      setMe(updated)
      navigate(`/u/${updated.handle}`)
    }
  }

  const cleanStack = stack.map((s) => s.trim()).filter(Boolean)
  const preview = {
    ...me,
    name: name.trim() || me.name,
    headline: headline.trim() || undefined,
    location: location.trim() || undefined,
    stack: cleanStack,
    links: { ...me.links, website: website.trim() || undefined, linkedin: linkedin.trim() || undefined },
  }

  return (
    <PublicLayout>
      <div className="page page--split">
        <div className="row gap-12 wrap page-toolbar">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to={`/u/${me.handle}`}>@{me.handle}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">edit profile</span>
          </nav>
        </div>

        <div className="split split--write">
          <section className="split__main" aria-label="Edit profile">
            <form className="stack gap-16" onSubmit={submit}>
              <label className="stack gap-4" htmlFor="profile-name">
                <span className="small muted">Name</span>
                <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </label>
              <label className="stack gap-4" htmlFor="profile-headline">
                <span className="small muted">Headline</span>
                <input
                  id="profile-headline"
                  className="input"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Senior backend engineer · building something"
                  maxLength={160}
                />
              </label>
              <label className="stack gap-4" htmlFor="profile-location">
                <span className="small muted">Location</span>
                <input id="profile-location" className="input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} />
              </label>
              <div className="stack gap-4">
                <span className="small muted" id="profile-stack-label">
                  Stack
                </span>
                <ListEditor id="profile-stack" items={stack} onChange={setStack} placeholder="go" itemName="tag" labelledBy="profile-stack-label" />
                <span className="small muted">{cleanStack.length}/12 tags</span>
              </div>
              <label className="stack gap-4" htmlFor="profile-website">
                <span className="small muted">Website</span>
                <input
                  id="profile-website"
                  className="input"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="stack gap-4" htmlFor="profile-linkedin">
                <span className="small muted">LinkedIn</span>
                <input
                  id="profile-linkedin"
                  className="input"
                  type="url"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/…"
                />
              </label>
              <FieldError message={save.error} />
              <div className="row gap-8">
                <button type="submit" className="btn btn--primary" disabled={save.pending}>
                  {save.pending ? 'Saving…' : 'Save changes'}
                </button>
                <Link to={`/u/${me.handle}`} className="btn btn--ghost">
                  Cancel
                </Link>
              </div>
            </form>
          </section>
          <aside className="split__side" aria-label="Preview">
            <h2 className="eyebrow">Preview</h2>
            <div className="card">
              <ProfileHeader user={preview} />
            </div>
          </aside>
        </div>
      </div>
    </PublicLayout>
  )
}
