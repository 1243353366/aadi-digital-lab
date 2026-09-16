/* /api/post/:slug/comments
   GET  — list comments for a post (oldest first).
   POST — add a comment ({ "author": "...", "body": "..." }). */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export async function onRequestGet(context) {
  const db = context.env.DB;

  if (!db) {
    return new Response(JSON.stringify([]), { headers: JSON_HEADERS });
  }

  try {
    const { results } = await db
      .prepare(
        `SELECT c.id, c.author, c.body, c.created_at
         FROM comments c
         JOIN posts p ON p.id = c.post_id
         WHERE p.slug = ?
         ORDER BY c.created_at ASC`
      )
      .bind(context.params.slug)
      .all();

    return new Response(JSON.stringify(results || []), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify([]), { headers: JSON_HEADERS });
  }
}

export async function onRequestPost(context) {
  const db = context.env.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: "D1 database not bound. Bind a D1 database named blog_db as DB in your Cloudflare Pages project." }),
      { status: 503, headers: JSON_HEADERS }
    );
  }

  let data;
  try {
    data = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Request body must be JSON." }), { status: 400, headers: JSON_HEADERS });
  }

  const author = typeof data.author === "string" ? data.author.trim() : "";
  const body = typeof data.body === "string" ? data.body.trim() : "";
  const slug = context.params.slug;

  if (author.length < 1 || author.length > 80) {
    return new Response(JSON.stringify({ error: "Author must be 1-80 characters." }), { status: 400, headers: JSON_HEADERS });
  }
  if (body.length < 1 || body.length > 2000) {
    return new Response(JSON.stringify({ error: "Comment must be 1-2000 characters." }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    const post = await db.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found." }), { status: 404, headers: JSON_HEADERS });
    }

    await db
      .prepare("INSERT INTO comments (post_id, author, body) VALUES (?, ?, ?)")
      .bind(post.id, author, body)
      .run();

    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Could not save the comment." }), { status: 500, headers: JSON_HEADERS });
  }
}
