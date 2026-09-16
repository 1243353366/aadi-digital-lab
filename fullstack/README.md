# Aadi's Digital Lab — full-stack (merged)

One Worker, one D1, one app: the entire frontend (home, blog, post view, search,
tags, likes, comments, login, admin dashboard, lab console) served as static
assets, plus the complete JSON API in the same deployable.

- Frontend: `public/` (served by Workers Assets; 404 page included)
- Backend: `api/` + `src/index.js` (PBKDF2 auth, session cookies, admin CRUD)
- Database: `blog_db` (D1) — import `schema.sql`

## Deploy

```bash
npx wrangler d1 execute blog_db --file=schema.sql --remote   # first time only
npx wrangler deploy
```

## Admin

Username `aadi`. Password is the shared random secret for this project —
stored only as a PBKDF2 hash here. Rotate it from Settings (`/admin`) after
first login, or via `/api/auth/password`.
