/* GET /api/post/:slug — fetch a single blog post by its slug. */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export async function onRequestGet(context) {
  const db = context.env.DB;
  const slug = context.params.slug;

  if (!db) {
    return new Response(
      JSON.stringify({ error: "D1 database not bound. Bind a D1 database named blog_db as DB in your Cloudflare Pages project." }),
      { status: 503, headers: JSON_HEADERS }
    );
  }

  try {
    const post = await db
      .prepare("SELECT id, title, slug, content, created_at, updated_at FROM posts WHERE slug = ?")
      .bind(slug)
      .first();

    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found." }), { status: 404, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify(post), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to load the post." }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
