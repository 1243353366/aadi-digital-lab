# Aadi's Digital Lab

> Research, OSINT, AI, and Systems Thinking.

A production-ready blog + research dashboard. One self-contained Cloudflare
Worker serves the static frontend and the API, with a D1 (SQLite) database,
admin dashboard, and GitHub-powered console telemetry. Zero build step, zero
npm dependencies.

**Live:** https://aadi-digital-lab-fullstack.aadishankar1999.workers.dev

## Compass Director + Agent

The repository now includes Project Compass in `compass/`, mounted in the lab at `/compass/`. Director mode coordinates the same planning agent, checks traceability and purpose scope, and proposes work packages, resource warnings, and a risk register. Agent-only mode runs that same agent independently. These are original, transparent planning components—not an fMRI decoder or autonomous execution tools.

The lab's `/api/compass/*` planning endpoints require an authenticated **admin session** in addition to company-purpose authorization, conditional high-risk approval, one-time tokens, replay/idempotency protection, and account/IP rate limits. Company assessments are not sent to the public Corpora/reasoning tools or saved in the blog database. See [Compass integration](COMPASS-INTEGRATION.md) for hosting and security details.

Existing lab code remains MIT-licensed. `compass/` and its copied frontend under `fullstack/public/compass/` retain the separate proprietary internal-use license in `compass/LICENSE`; the merge does not relicense those files as MIT.

## Structure

The original lab application lives in `fullstack/`, with the standalone Compass module in `compass/`:

- `public/` - static site (pure HTML/CSS/JS, dark-mode-first)
- `src/index.js` - Worker entry: routes every `/api/*` request
- `api/` - backend modules (posts, comments, likes, auth, admin CRUD)
- `schema.sql` - D1 schema + seed content
- `deploy.sh` - one-shot deploy (schema apply + Worker deploy + verify)
- `backup.sh` / `restore.sh` - off-site D1 backup to this repo (versioned
  history = rollback / ransomware recovery). `restore.sh --remote` is
  destructive (replaces production content).

From the repository root, `npm ci --prefix compass && npm run verify` runs the Compass and gateway tests. `npm run sync:compass` regenerates the mounted Compass frontend. `npm run start:compass` runs the standalone Node application for a separate host.

## Security

Strict CSP (no inline JS), security headers on all responses, D1-backed rate
limits (login 8 / comments 5 / likes 30 per 15 min per IP), 32KB API body cap,
PBKDF2 auth with server-side sessions, audit log of admin mutations, stored
XSS escaped everywhere.

## CI

GitHub Actions boots the whole app in a sandbox on every push: seeds a local
D1, serves the Worker with `wrangler dev`, and smoke-tests search, tags,
comments, likes, the auth gate, and security headers.

## Deploy

```bash
cd fullstack && ./deploy.sh
```
