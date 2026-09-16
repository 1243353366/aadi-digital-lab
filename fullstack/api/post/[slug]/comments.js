import { json, getUserFromRequest } from "../../_shared.js";

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);
  const slug = context.params.slug;
  try {
    const { results } = await db.prepare(
      `SELECT c.id, c.author, c.body, c.created_at
       FROM comments c JOIN posts p ON p.id = c.post_id
       WHERE p.slug = ? ORDER BY c.created_at ASC`
    ).bind(slug).all();
    return json(results);
  } catch {
    return json({ error: "Query failed. Did you import schema.sql into the D1 database?" }, 500);
  }
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const author = String(body.author || "").trim();
  const comment = String(body.body || "").trim();
  if (author.length < 1 || author.length > 80) return json({ error: "Name must be 1-80 characters" }, 400);
  if (comment.length < 1 || comment.length > 2000) return json({ error: "Comment must be 1-2000 characters" }, 400);

  try {
    const post = await db.prepare("SELECT id FROM posts WHERE slug = ?").bind(context.params.slug).first();
    if (!post) return json({ error: "Post not found" }, 404);
    await db.prepare("INSERT INTO comments (post_id, author, body) VALUES (?, ?, ?)")
      .bind(post.id, author, comment).run();
    return json({ ok: true }, 201);
  } catch {
    return json({ error: "Failed to save comment" }, 500);
  }
}
