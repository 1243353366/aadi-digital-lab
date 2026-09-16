import { json, requireAdmin } from "../_shared.js";

export function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function parseTags(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const name = String(item).trim().toLowerCase().replace(/[^a-z0-9 -]/g, "").slice(0, 30);
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out.slice(0, 10);
}

export async function saveTags(db, postId, tagNames) {
  for (const name of tagNames) {
    await db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(name).run();
    const tag = await db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE").bind(name).first();
    await db.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)").bind(postId, tag.id).run();
  }
}

export async function replaceTags(db, postId, tagNames) {
  await db.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(postId).run();
  await saveTags(db, postId, tagNames);
}

export async function validatePostBody(body) {
  const title = String(body.title || "").trim();
  let slug = slugify(body.slug || title);
  const content = String(body.content || "");
  if (title.length < 1 || title.length > 200) return { error: "Title must be 1-200 characters" };
  if (!slug) return { error: "Slug could not be generated from the title" };
  if (content.length < 1 || content.length > 50000) return { error: "Content must be 1-50000 characters" };
  return { title, slug, content, tags: parseTags(body.tags) };
}

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

  const v = await validatePostBody(body);
  if (v.error) return json({ error: v.error }, 400);

  try {
    const clash = await db.prepare("SELECT id FROM posts WHERE slug = ?").bind(v.slug).first();
    if (clash) return json({ error: `Slug "${v.slug}" is already taken` }, 409);

    const result = await db.prepare(
      "INSERT INTO posts (title, slug, content) VALUES (?, ?, ?)"
    ).bind(v.title, v.slug, v.content).run();

    const postId = result.meta.last_row_id;
    await saveTags(db, postId, v.tags);
    return json({ id: postId, slug: v.slug }, 201);
  } catch (err) {
    return json({ error: "Failed to create post" }, 500);
  }
}
