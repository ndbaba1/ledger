const RETURN_TO_KEY = 'ledger:returnTo'

/**
 * Signs in with GitHub. This has to be a real page navigation (a form POST,
 * not fetch) since the OAuth round trip ends in a redirect back from GitHub.
 * `returnTo` (an in-app path) is stashed so the app can hop back to it once
 * the visitor is signed in — the server only ever redirects to the app root.
 */
export async function signInWithGithub(returnTo?: string): Promise<void> {
  if (returnTo) sessionStorage.setItem(RETURN_TO_KEY, returnTo)

  // Fire-and-forget from the caller's point of view (a click handler, or an
  // effect that can't do much with a failure beyond leaving the visitor on
  // the page) — never leave an unhandled rejection behind.
  try {
    const res = await fetch('/api/v1/csrf_token', { credentials: 'same-origin' })
    const { csrfToken } = (await res.json()) as { csrfToken: string }

    const form = document.createElement('form')
    form.method = 'post'
    form.action = '/auth/github'
    form.style.display = 'none'
    const token = document.createElement('input')
    token.name = 'authenticity_token'
    token.value = csrfToken
    form.appendChild(token)
    document.body.appendChild(form)
    form.submit()
  } catch (e) {
    console.error('Could not start GitHub sign-in.', e)
  }
}

/** Consumes the stashed return-to path, if any, after a sign-in round trip. */
export function takeReturnTo(): string | null {
  const path = sessionStorage.getItem(RETURN_TO_KEY)
  if (path) sessionStorage.removeItem(RETURN_TO_KEY)
  return path
}

export async function signOut(): Promise<void> {
  await fetch('/api/v1/session', { method: 'DELETE', credentials: 'same-origin' })
}
