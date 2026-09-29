# Ledger

A place for verified engineering write-ups: sign in with GitHub, write up how
you solved something, attach the PRs and issues that prove it, and publish to
your public profile. The server verifies every PR/issue link against the
GitHub API before it counts.

## Layout

```
web/          React + TypeScript frontend (Vite)
api/          Rails API backend (PostgreSQL)
compose.yaml  db + api + web, for running the whole thing in Docker
```

`web/` talks to the backend only through the `LedgerApi` interface in
`web/src/api/client.ts`. `web/src/api/mockApi.ts` implements it in memory;
`web/src/api/httpApi.ts` implements the version-1 slice of it over the Rails
API and falls back to the mock for everything not built yet. Which one runs
is chosen in `web/src/main.tsx`: set `VITE_API=http` to talk to the real
backend, anything else (the default) keeps the app on the mock.

## Running it

### The whole stack, in Docker

```bash
cp .env.example .env        # then fill in the GitHub OAuth values below
docker compose up --build
```

Open http://localhost:8080. `db` (Postgres), `api` (Rails) and `web`
(the built frontend, served by nginx, which proxies `/api/` and `/auth/` to
`api`) all run in containers; `api` waits for `db` to be healthy, then runs
pending migrations before starting.

### Day-to-day development

Run the database and API in Docker, and the frontend with Vite's dev server
so you get hot reload:

```bash
docker compose up db api
cd web && VITE_API=http npm run dev   # http://localhost:5173, proxying /api and /auth to :3000
```

Without `VITE_API=http`, `npm run dev` runs entirely on the mock and needs
nothing else running — that's also what `npm test` and the preview build use.

GitHub's OAuth callback is fixed to one URL per OAuth App, so signing in for
real only works against whichever origin matches your app's callback and your
api container's `APP_URL` — see below. If you're developing at
`http://localhost:5173`, set `APP_URL=http://localhost:5173` in `.env` and
register that as the callback instead of `:8080`.

### Running the API or the frontend on their own

```bash
cd api && bin/rails db:prepare && bin/rails server   # needs a local Postgres; see api/config/database.yml
cd web && npm install && npm run dev
```

## Creating a GitHub OAuth App

1. Go to https://github.com/settings/developers → **New OAuth App**.
2. **Homepage URL**: `http://localhost:8080`
3. **Authorization callback URL**: `http://localhost:8080/auth/github/callback`
4. Copy the **Client ID**, generate a **Client secret**, and put both in `.env`
   as `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

Version 1 only verifies **public** repos — a PR or issue in a private repo is
stored as an unverified link rather than failing.

## What's live versus mock

Backed by the Rails API (`web/src/api/httpApi.ts`):

- Sign in with GitHub · sign out
- Explore (search, filter by type/topic)
- Profile pages, post pages, topic pages
- The write-up editor: create, autosave, evidence (verified live against
  GitHub), publish to your profile
- "I hit this too"

Still on the mock (`web/src/api/mockApi.ts`, unaffected by `VITE_API`):

- The team workspace (inbox, drafts, cases, records, team search/ask, signal
  matching, promotion to a team record, workspace settings/invites)
- Projects
- Public Q&A ("Ask the author")

A signed-out visitor can browse Explore, profiles, posts and topics freely;
anything that needs an account (asking a question, hitting a post, opening
the workspace) sends them to GitHub sign-in and back.

## Backend

```bash
cd api
bin/rails db:prepare
bundle exec rspec     # specs, including GitHub API calls stubbed with WebMock
bin/rails db:seed     # a handful of users and published posts, so Explore isn't empty
```

Evidence verification and the write-up → public post logic are ported
line-for-line from the frontend's mock (`web/src/lib/writeups.ts`,
`web/src/lib/publicPost.ts`) into `PostBuilder` and `GithubEvidenceVerifier`
— `spec/services/post_builder_spec.rb` checks the two produce the same
section headings against the same fixture.

## Frontend

See `web/README.md` for the screen list, project layout and mock data.
