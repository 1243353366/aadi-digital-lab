import { json } from "../../_shared.js";

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);

  const slug = context.params.slug;
  try {
    const post = await db.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first();
    if (!post) return json({ error: "Not found" }, 404);
    const { results: tags } = await db.prepare(
      `SELECT t.name FROM tags t
       JOIN post_tags pt ON pt.tag_id = t.id
       WHERE pt.post_id = ?`
    ).bind(post.id).all();
    return json({ ...post, tags: tags.map((t) => t.name) });
  } catch {
    return json({ error: "Query failed. Did you import schema.sql into the D1 database?" }, 500);
  }
}
