# Aadi Digital Lab — Live Blog

A complete blog running on **Cloudflare Workers + D1**.

- **Public visitors** see the blog at `/` — browse posts, search, like, comment
- **You (admin)** log in at `/admin` — create, edit, delete posts from a dashboard
- Visitors never see the admin panel

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Import schema into D1 (creates tables + seeds 2 posts, admin user, tags)
npm run db:remote-schema

# 3. Deploy
npm run deploy
```

Your blog is live at your `*.workers.dev` URL.

## What's in the box

| File | Purpose |
|------|---------|
| `src/index.js` | Worker: public frontend, admin panel, and API — all in one |
| `schema.sql` | D1 schema: users, posts, tags, post_tags, comments + seed data |
| `wrangler.toml` | Worker config with D1 binding (`DB` → `blog_db`) |

## Public Pages

| URL | Who sees it |
|-----|-------------|
| `/` | Everyone — blog homepage |
| `/admin` | You only — login page |
| `/admin/dashboard` | You only — post management (after login) |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/posts` | Public | List published posts |
| GET | `/api/posts/:slug` | Public | Single post + tags + comments |
| GET | `/api/search?q=` | Public | Search posts |
| POST | `/api/posts/:slug/like` | Public | Like a post |
| GET | `/api/posts/:slug/comments` | Public | List comments |
| POST | `/api/posts/:slug/comments` | Public | Add a comment |
| GET | `/api/tags` | Public | List all tags |
| POST | `/api/admin/login` | — | Admin login |
| GET | `/api/admin/posts/list` | Admin | All posts (incl. unpublished) |
| GET | `/api/admin/posts/:id` | Admin | Get post for editing |
| POST | `/api/admin/posts` | Admin | Create post |
| PUT | `/api/admin/posts/:id` | Admin | Update post |
| DELETE | `/api/admin/posts/:id` | Admin | Delete post |

## Admin Credentials

- Username: `admin`
- Password: the seeded random secret

> ⚠️ Change these before going public. Update the `users` table in D1.
