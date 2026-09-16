import { json } from "./_shared.js";

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound. Bind a D1 database as DB in your Pages project." }, 503);

  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const tag = (url.searchParams.get("tag") || "").trim();

  let rows;
  try {
    if (tag) {
      ({ results: rows } = await db.prepare(
        `SELECT p.id, p.title, p.slug, p.content, p.created_at, p.updated_at
         FROM posts p
         JOIN post_tags pt ON pt.post_id = p.id
         JOIN tags t ON t.id = pt.tag_id
         WHERE t.name = ? COLLATE NOCASE
         GROUP BY p.id
         ORDER BY p.created_at DESC`
      ).bind(tag).all());
    } else if (q) {
      const like = `%${q.replace(/[%_\\]/g, "")}%`;
      ({ results: rows } = await db.prepare(
        `SELECT id, title, slug, content, created_at, updated_at
         FROM posts
         WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\'
         ORDER BY created_at DESC`
      ).bind(like, like).all());
    } else {
      ({ results: rows } = await db.prepare(
        `SELECT id, title, slug, content, created_at, updated_at
         FROM posts ORDER BY created_at DESC`
      ).all());
    }
  } catch (err) {
    return json({ error: "Query failed. Did you import schema.sql into the D1 database?" }, 500);
  }

  return json(rows);
}
