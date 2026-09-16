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
