/* GET /api/posts — list all blog posts (newest first). */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export async function onRequestGet(context) {
  const db = context.env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: "D1 database not bound. Bind a D1 database named blog_db as DB in your Cloudflare Pages project." }),
      { status: 503, headers: JSON_HEADERS }
    );
  }

  try {
    const { results } = await db
      .prepare("SELECT id, title, slug, content, created_at, updated_at FROM posts ORDER BY created_at DESC")
      .all();

    return new Response(JSON.stringify(results), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to load posts. Did you import schema.sql into the D1 database?" }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
