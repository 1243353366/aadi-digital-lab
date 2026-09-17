import { json, requireAdmin, audit } from "../_shared.js";
import { slugify, replaceTags, validatePostBody } from "./create.js";

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

  const existing = await db.prepare("SELECT id, slug FROM posts WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "Post not found" }, 404);

  const v = await validatePostBody(body);
  if (v.error) return json({ error: v.error }, 400);

  let slug = slugify(body.slug || v.title) || existing.slug;
  if (slug !== existing.slug) {
    const clash = await db.prepare("SELECT id FROM posts WHERE slug = ? AND id != ?").bind(slug, id).first();
    if (clash) return json({ error: `Slug "${slug}" is already taken` }, 409);
  }

  try {
    await db.prepare(
      "UPDATE posts SET title = ?, slug = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(v.title, slug, v.content, id).run();
    await replaceTags(db, id, v.tags);
    await audit(db, user.username, "update_post", slug);
    return json({ id, slug }, 200);
  } catch {
    return json({ error: "Failed to update post" }, 500);
  }
}
