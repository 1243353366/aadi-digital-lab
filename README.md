# Aadi's Digital Lab

> Research, OSINT, AI, and Systems Thinking.

A production-ready blog + research dashboard. One self-contained Cloudflare
Worker serves the static frontend and the API, with a D1 (SQLite) database,
admin dashboard, and GitHub-powered console telemetry. Zero build step, zero
npm dependencies.

**Live:** https://aadi-digital-lab-fullstack.aadishankar1999.workers.dev

## Structure

Everything lives in `fullstack/`:

- `public/` - static site (pure HTML/CSS/JS, dark-mode-first)
- `src/index.js` - Worker entry: routes every `/api/*` request
- `api/` - backend modules (posts, comments, likes, auth, admin CRUD)
- `schema.sql` - D1 schema + seed content
- `deploy.sh` - one-shot deploy (schema apply + Worker deploy + verify)
- `backup.sh` / `restore.sh` - off-site D1 backup to this repo (versioned
  history = rollback / ransomware recovery). `restore.sh --remote` is
  destructive (replaces production content).

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
