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

Public repos are verified this way alone. For a private repo, sign-in stays on
this OAuth app — Ledger instead checks whether its separate GitHub App (below)
is installed there.

## Creating the GitHub App (private repos)

Sign-in never touches this app; it exists only so Ledger can read a PR or
issue in a repo someone has explicitly installed it on.

1. Go to https://github.com/settings/apps → **New GitHub App**.
2. **Homepage URL**: `http://localhost:8080`.
3. **Setup URL**: `http://localhost:8080/api/v1/github/app/setup` (nginx
   proxies `/api/` to the `api` container, same as the OAuth callback above —
   use `:3000` instead if you're running the API on its own), and check
   **Redirect on update** so re-installing (adding repos) comes back here too.
4. **Webhook**: uncheck **Active** — Ledger looks up installations on demand
   (`GithubApp#installation_for`), so no webhook is needed, in development or
   anywhere else.
5. **Repository permissions**: `Pull requests` → Read-only, `Issues` →
   Read-only, `Metadata` → Read-only (added automatically).
6. **Where can this GitHub App be installed?**: Any account, so anyone can
   install it on their own repos.
7. Create the app, then **Generate a private key** — it downloads a `.pem`
   file. Base64-encode it onto one line and put the pieces in `.env`:
   ```bash
   base64 -i your-app-name.private-key.pem
   ```
   - `GITHUB_APP_ID` — the **App ID** on the app's settings page.
   - `GITHUB_APP_SLUG` — the app's URL slug (`github.com/apps/<slug>`).
   - `GITHUB_APP_PRIVATE_KEY_BASE64` — the base64 output above.

Without these three, development and test fall back to a fixed, throwaway app
id and key (see `config/initializers/github_app.rb`) so the app still boots —
private-repo verification just won't reach real installations until you set
real ones. Never log, commit, or otherwise let `GITHUB_APP_PRIVATE_KEY_BASE64`
leave `.env`.

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

## Deploying

Ledger deploys to [Render](https://render.com) as a single Docker web service
plus a managed Postgres database, defined in `render.yaml` at the repo root (a
[Blueprint](https://render.com/docs/blueprint-spec)). It's invite-only for
now — no public sign-up flow, no custom domain.

### First deploy

1. Push this repo to GitHub and connect it in the Render dashboard: **New** →
   **Blueprint**, pick the repo. Render reads `render.yaml` and proposes the
   `ledger` web service and the `ledger-db` Postgres database.
2. Apply the blueprint. The first deploy will fail health checks — it's
   missing the secrets below, which `render.yaml` deliberately leaves unset
   (`sync: false`) rather than committing them to the repo.
3. On the `ledger` service's **Environment** tab in the Render dashboard, set:

   | Variable | Where it comes from |
   | --- | --- |
   | `SECRET_KEY_BASE` | `openssl rand -hex 64` |
   | `APP_URL` | The service's `onrender.com` URL, e.g. `https://ledger-xxxx.onrender.com` (no trailing slash) |
   | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | The **production** GitHub OAuth App — see below |
   | `GITHUB_APP_ID` / `GITHUB_APP_SLUG` / `GITHUB_APP_PRIVATE_KEY_BASE64` | The **production** GitHub App — see below |
   | `GITHUB_APP_WEBHOOK_SECRET` | Optional; only needed if you ever turn the app's webhook on |
   | `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY` / `_DETERMINISTIC_KEY` / `_KEY_DERIVATION_SALT` | `bin/rails db:encryption:init`, run locally — it just prints three values, no database needed. Required: `github_token` is encrypted at rest, and sign-in writes it on every login. |
   | `SENTRY_DSN` | Optional; from a Sentry project, if you want error reporting |

   `DATABASE_URL`, `RAILS_ENV`, `RAILS_LOG_TO_STDOUT` and
   `RAILS_SERVE_STATIC_FILES` are already set by `render.yaml`.
4. Trigger a manual deploy once the secrets are in place. Render runs
   `bin/rails db:prepare` (the blueprint's pre-deploy command) before every
   deploy, so the schema is always current.

### Creating the production GitHub OAuth App

Same steps as [the development one](#creating-a-github-oauth-app), against
your `onrender.com` URL instead of `localhost:8080`:

1. https://github.com/settings/developers → **New OAuth App**.
2. **Homepage URL**: your service's URL, e.g. `https://ledger-xxxx.onrender.com`.
3. **Authorization callback URL**: `https://ledger-xxxx.onrender.com/auth/github/callback`.
4. Put the client ID and secret in `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
   on Render.

### Creating the production GitHub App

Same steps as [development](#creating-the-github-app-private-repos), against
your `onrender.com` URL:

1. https://github.com/settings/apps → **New GitHub App**.
2. **Homepage URL**: `https://ledger-xxxx.onrender.com`.
3. **Setup URL**: `https://ledger-xxxx.onrender.com/api/v1/github/app/setup`,
   with **Redirect on update** checked.
4. **Webhook**: uncheck **Active** — same reasoning as development, no
   webhook is needed.
5. **Repository permissions**: `Pull requests` and `Issues`, both read-only.
6. Generate a private key, base64-encode it
   (`base64 -i your-app.private-key.pem`), and set `GITHUB_APP_ID`,
   `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY_BASE64` on Render. Unlike
   development, production refuses to boot if this key is missing or
   invalid, rather than silently falling back to a throwaway one.

### Rails console on Render

On the `ledger` service page, open the **Shell** tab and run
`bin/rails console`. (Or install the [Render CLI](https://render.com/docs/cli)
and run `render ssh`, then the same command.)

### What's different from local Docker

- One image serves both frontend and API: `api/Dockerfile` builds `web/` (in
  live mode — no mock data bundled) and copies it into Rails' `public/`;
  Rails serves those static files directly, falling back to `index.html` for
  anything not handled by `/api` or `/auth`.
- Render terminates TLS in front of the app; Rails is configured to trust
  that and enforce HTTPS itself (`config.assume_ssl`, `config.force_ssl`),
  except for the `/up` health check.
- Rate limiting (Rack::Attack) and the GitHub App's installation-lookup cache
  use an in-process memory store — fine for the single instance this runs as
  today, but it resets on every deploy/restart and wouldn't be shared if this
  ever scales to more than one instance.
- `db/seeds.rb` does nothing in production; a real deploy starts with no
  sample data. Run `bin/rails ledger:demo` on a throwaway/staging deploy if
  you want it anyway.
