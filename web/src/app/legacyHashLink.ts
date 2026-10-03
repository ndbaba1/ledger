/**
 * Old links (shared on LinkedIn/Reddit before the BrowserRouter switch) look
 * like https://englog.dev/#/u/handle/slug — or, with the hash router's own
 * secondary fragment, .../#/u/handle/slug#ask. Rewrite the visible URL to
 * the same path without the "#/" prefix, so the links keep working:
 * BrowserRouter never reads location.hash for routing, so without this the
 * app would just land on "/" and ignore everything after the "#".
 *
 * Must run before the router's history object is created (see App.tsx) —
 * history.replaceState re-parses the URL, so a trailing "#ask" inside the
 * old hash path becomes a real location.hash afterwards, same as it would
 * for a freshly-typed /u/handle/slug#ask URL.
 */
export function rewriteLegacyHashLink(): void {
  const { hash } = window.location
  if (!hash.startsWith('#/')) return
  window.history.replaceState(null, '', hash.slice(1))
}
