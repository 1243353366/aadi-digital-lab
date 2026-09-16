import { json } from "./_shared.js";

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);
  try {
    const { results } = await db.prepare(
      `SELECT t.name, COUNT(pt.post_id) AS count
       FROM tags t
       LEFT JOIN post_tags pt ON pt.tag_id = t.id
       GROUP BY t.id
       ORDER BY count DESC, t.name ASC`
    ).all();
    return json(results);
  } catch {
    return json({ error: "Query failed. Did you import schema.sql into the D1 database?" }, 500);
  }
}
