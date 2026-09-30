/**
 * VITE_API=http is "live" mode: only real, backend-backed features exist.
 * Anything else (the default) is mock mode, where every screen works.
 */
export const isLive = import.meta.env.VITE_API === 'http'

export const features = {
  /** The team workspace: inbox, drafts, cases, records, search, settings. */
  workspace: !isLive,
  /** Bodies of work grouped from several records, on profiles and posts. */
  projects: !isLive,
  /** "Ask the author" on a post. Has a real backend in both mock and live mode. */
  publicQA: true,
}
