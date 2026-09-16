# Aadi Digital Lab — Blog API

A live blog API running on **Cloudflare Workers** with a **D1** (SQLite) database.

## Setup

### 1. Create the D1 database

```bash
npx wrangler d1 create blog_db
```

Copy the `database_id` into `wrangler.toml` (already configured).

### 2. Import the schema

```bash
npx wrangler d1 execute blog_db --file=schema.sql
```

This creates the `posts`, `comments`, `tags`, `post_tags`, and `users` tables and seeds:
- An admin user (`admin` / the seeded random secret)
- Two tags (`Welcome`, `Tutorial`)
- Two starter posts

### 3. Deploy

```bash
npx wrangler deploy
```

Your blog API is now live.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/posts` | List published posts (paginated: `?page=1&limit=10`) |
| GET | `/api/posts/:slug` | Get a single post with tags & comments |
| GET | `/api/search?q=...` | Search posts by title or content |
| POST | `/api/posts/:slug/like` | Like a post |
| GET | `/api/posts/:slug/comments` | List approved comments |
| POST | `/api/posts/:slug/comments` | Add a comment `{ author_name, author_email, content }` |
| POST | `/api/admin/login` | Admin login `{ username, password }` |
| GET | `/api/tags` | List all tags with post counts |
| POST | `/api/admin/posts` | Create a post (admin) |
| PUT | `/api/admin/posts/:id` | Update a post (admin) |
| DELETE | `/api/admin/posts/:id` | Delete a post (admin) |

## Admin Credentials

- Username: `admin`
- Password: randomly generated, shared privately, stored only as a SHA-256 hash.

Rotate the password (replace with `sha256("<new-password>")`):

```sql
UPDATE users SET password_hash = '<sha256-hex>' WHERE username = 'admin';
```
