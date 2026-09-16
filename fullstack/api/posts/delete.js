import { json, requireAdmin } from "../_shared.js";

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);

  const { user, error: authError } = await requireAdmin(context);
  if (authError) return authError;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: "Valid post id required" }, 400);

  const post = await db.prepare("SELECT id FROM posts WHERE id = ?").bind(id).first();
  if (!post) return json({ error: "Post not found" }, 404);

  try {
    await db.batch([
      db.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(id),
      db.prepare("DELETE FROM comments WHERE post_id = ?").bind(id),
      db.prepare("DELETE FROM likes WHERE post_id = ?").bind(id),
      db.prepare("DELETE FROM posts WHERE id = ?").bind(id),
    ]);
    return json({ ok: true });
  } catch {
    return json({ error: "Failed to delete post" }, 500);
  }
}
