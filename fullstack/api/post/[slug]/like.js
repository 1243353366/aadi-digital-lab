import { json, rateLimit } from "../../_shared.js";

// GET /api/post/:slug/like → { count }
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);
  try {
    const row = await db.prepare(
      `SELECT COUNT(*) AS count FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.slug = ?`
    ).bind(context.params.slug).first();
    return json({ count: row ? row.count : 0 });
  } catch {
    return json({ error: "Query failed." }, 500);
  }
}

// POST /api/post/:slug/like { visitor } → { count, liked }  (toggles)
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const visitor = String(body.visitor || "").trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(visitor)) return json({ error: "Invalid visitor id" }, 400);

  // Flood control: max 30 like toggles per IP per 15 minutes.
  if (!(await rateLimit(db, context.request, "like", 30))) {
    return json({ error: "Too many requests. Slow down a little." }, 429);
  }

  try {
    const post = await db.prepare("SELECT id FROM posts WHERE slug = ?").bind(context.params.slug).first();
    if (!post) return json({ error: "Post not found" }, 404);

    const existing = await db
      .prepare("SELECT id FROM likes WHERE post_id = ? AND visitor_id = ?")
      .bind(post.id, visitor).first();

    if (existing) {
      await db.prepare("DELETE FROM likes WHERE id = ?").bind(existing.id).run();
    } else {
      await db.prepare("INSERT INTO likes (post_id, visitor_id) VALUES (?, ?)").bind(post.id, visitor).run();
    }

    const row = await db.prepare("SELECT COUNT(*) AS count FROM likes WHERE post_id = ?").bind(post.id).first();
    return json({ count: row.count, liked: !existing });
  } catch {
    return json({ error: "Failed to toggle like" }, 500);
  }
}
