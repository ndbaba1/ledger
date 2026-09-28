# Ledger — web

The Ledger frontend: React 19 + TypeScript + Vite. It runs entirely against an
in-memory mock API today, so every screen and flow works before the backend
exists.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + UI tests (Vitest, Testing Library)
npm run typecheck
npm run build      # static build in dist/
```

## What's here

| Route | Screen |
| --- | --- |
| `#/inbox` | Review inbox — drafts assembled from your work |
| `#/drafts/:slug` | Draft review — cited timeline, gaps to resolve, the case file of sources, approve & publish |
| `#/new` | New write-up — pick incident, investigation, decision or design |
| `#/write/:id` | Write-up editor — template fields, autosave, live preview, evidence, publish checklist; designs go Proposed → Shipped |
| `#/cases` | Open cases still collecting sources |
| `#/records` | Team records, newest first — incidents, investigations, decisions and system designs |
| `#/records/:id` | Published record — "drafted from" evidence (PR diffs, Slack quotes), sources, history, Q&A with fold-into-record |
| `#/records/:id/promote` | Promote to public — live redaction preview, evidence → verified badges, employer display |
| `#/search?q=` | Search by symptom, error, service; questions also get an "Ask Ledger" answer citing past records |
| `#/u/:handle` | Public profile with proof-of-work badges |
| `#/u/:handle/:slug` | Public post |

Layouts: sidebar on desktop, icon rail on tablets, top bar + bottom tab bar on
phones. Two-pane screens (draft review, promote) switch to a pane toggle below
1180px.

## Connecting the backend

The UI only talks to the `LedgerApi` interface in `src/api/client.ts`.
`src/api/mockApi.ts` implements it in memory from `src/api/fixtures.ts`.

To connect a real backend:

1. Write `createHttpApi(baseUrl)` implementing `LedgerApi` (one method per endpoint).
2. Swap it in at `src/main.tsx`.
3. Keep the types in `src/api/types.ts` as the API contract. Errors should
   reject with an `Error` whose `message` is safe to show; use `NotFoundError`
   for 404s.

Pure logic the backend should mirror lives in `src/lib/`: redaction
(`redact.ts`), building a public post from a record (`publicPost.ts`), and
link-to-source detection (`sources.ts`). All are unit tested.

Routing uses `HashRouter` so the static build works on any host. Switch to
`BrowserRouter` once a server with a catch-all route serves the app.

## Layout

```
src/
  api/          types, LedgerApi interface, mock implementation, fixtures
  app/          shell, public layout, session (current user, workspace)
  components/   shared UI: icons, avatars, tags, citations, source list, gap card
  lib/          pure helpers + data hooks
  screens/      one file per route
  test/         Vitest suites
  styles.css    design tokens and all styles
```

Sample data is illustrative except the agent-db-scan post, which reflects real work.
