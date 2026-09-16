# Aadi's Digital Lab

> Research, OSINT, AI, and Systems Thinking.

A production-ready, zero-build static website with a real backend: a Cloudflare
D1 (SQLite) database powering a blog through Cloudflare Pages Functions.

**Live URL (after deploy):** `https://aadi-digital-lab.pages.dev`

## Stack

- Pure HTML + CSS + JS — no build step, no dependencies, no framework
- Dark-mode-first responsive design with a theme toggle (persisted)
- Cloudflare Pages Functions (`/functions`) — serverless API
- Cloudflare D1 (SQLite) — posts and comments
- MIT licensed

## Project structure

```
aadi-digital-lab/
├─ index.html                  # Landing page (hero, about, research, AI, contact)
├─ blog.html                   # Blog index — renders posts from /api/posts
├─ post.html                   # Single post + comments (?slug=...)
├─ favicon.svg
├─ robots.txt
├─ _headers                    # Security headers for Cloudflare Pages
├─ css/
│  └─ styles.css               # Full stylesheet, dark + light themes
├─ js/
│  ├─ main.js                  # Theme toggle, mobile nav, scroll reveal
│  ├─ blog.js                  # Fetch + render post list
│  └─ post.js                  # Fetch post, render + post comments
├─ functions/                  # Cloudflare Pages Functions (serverless API)
│  └─ api/
│     ├─ posts.js              # GET /api/posts
│     └─ post/
│        └─ [slug]/
│           ├─ index.js        # GET /api/post/:slug
│           └─ comments.js     # GET/POST /api/post/:slug/comments
├─ schema.sql                  # D1 tables + seed posts (import once)
└─ wrangler.toml               # Pages project + D1 binding config
```

## API

| Method | Route                        | Description                       |
|--------|------------------------------|-----------------------------------|
| GET    | `/api/posts`                 | All posts, newest first           |
| GET    | `/api/post/:slug`            | One post by slug                  |
| GET    | `/api/post/:slug/comments`   | Comments for a post               |
| POST   | `/api/post/:slug/comments`   | Add a comment `{author, body}`    |

## Deploy to Cloudflare Pages (free subdomain)

1. Push this repo to GitHub (`main` branch).
2. Go to https://pages.cloudflare.com/ → sign in → **Create a project → Connect to Git**.
3. Authorize GitHub, select the `aadi-digital-lab` repository.
4. Build settings:
   - Framework preset: **None**
   - Build command: **(leave empty)**
   - Build output directory: **/** (root)
5. **Save and Deploy.** Cloudflare assigns the free subdomain:
   `https://aadi-digital-lab.pages.dev` (rename the project if needed to get that exact subdomain).

## Connect the D1 database (blog backend)

1. Dashboard → **Workers & Pages → D1** → *Create database* → name it `blog_db`.
2. Open `blog_db` → **Console** → paste the contents of `schema.sql` → **Execute**.
   (Or run `npx wrangler d1 execute blog_db --file=./schema.sql --remote`.)
3. Copy the database ID into `wrangler.toml` (or, easier: Pages project →
   **Settings → Functions → D1 database bindings** → add binding `DB` → select `blog_db`).
4. Redeploy (push any commit, or press *Retry deployment*). Visit `/blog.html` —
   the two seed posts appear; every future `git push` auto-deploys.

## Local development

```bash
npx wrangler pages dev .        # serves the site + functions locally
```

Visit http://localhost:8788 — functions run locally; D1 requires a local
binding (`npx wrangler pages dev . --d1 DB=blog_db` after `wrangler d1 create blog_db`).

## Adding a blog post

Dashboard → D1 → `blog_db` → Console:

```sql
INSERT INTO posts (title, slug, content)
VALUES ('My new post', 'my-new-post', 'First paragraph.

Second paragraph.');
```

Or POST to `/api/post/:slug/comments` from the post page to add comments.

## License

MIT — see [LICENSE](LICENSE).

---

## App v2 — full platform update (2026-09)

The blog is now a real app: authentication, admin dashboard, tags,
search, likes, and comments — still pure HTML/CSS/JS with zero build step.

### New database tables (`schema.sql`)
`users` · `sessions` · `likes` · `tags` · `post_tags` (plus existing
`posts` / `comments`). Re-importing `schema.sql` on an existing database
is safe: all creates are `IF NOT EXISTS`, seeds are `INSERT OR IGNORE`.

### API surface
| Method | Route | Auth |
|---|---|---|
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | public |
| GET | `/api/auth/me` | session |
| POST | `/api/auth/password` | session |
| GET | `/api/posts?q=…&tag=…` | public |
| GET | `/api/post/:slug` | public |
| GET/POST | `/api/post/:slug/comments` | public |
| GET/POST | `/api/post/:slug/like` | public |
| GET | `/api/tags` | public |
| POST | `/api/posts/create` | admin |
| POST | `/api/posts/update` | admin |
| POST | `/api/posts/delete` | admin |

### Pages
- `/` — marketing site
- `/blog.html` — searchable, tag-filtered post list
- `/post.html?slug=…` — post with tags, like button, comments
- `/login.html` — sign-in (seeded user: `aadi`, password shipped with the
  schema — **change it in Settings after first login**)
- `/admin/` — dashboard SPA (`#/posts`, `#/new`, `#/edit/:slug`,
  `#/settings`) with hash routing, toasts, and loading/error states

### Auth design
PBKDF2-SHA256 (100k iterations) password hashing via Web Crypto; sessions
are 32-byte random tokens, stored hashed (SHA-256) in D1, delivered as
`HttpOnly; Secure; SameSite=Lax` cookies with a 7-day TTL. All admin
writes are gated server-side.

### CI
`.github/workflows/ci.yml` builds the Pages Functions with Wrangler,
syntax-checks the frontend modules with esbuild, and lints `schema.sql`
against real SQLite on every push.

## Console page (`console.html`)

Live GitHub telemetry for the Lab, no dependencies: repository stat cards,
a 52-week SVG commit-activity chart, language mix bars, recent public
activity, and a repository card grid — all from GitHub's public API
(unauthenticated, rate-limited, with explicit paused/rate-limit states per
section). Charts are hand-rolled SVG using the site's CSS variables, so
they follow the dark/light theme automatically.
