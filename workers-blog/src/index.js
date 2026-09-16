// Blog API Worker — backed by Cloudflare D1
// Routes: /api/posts, /api/posts/:slug, /api/search, /api/posts/:slug/like,
//        /api/posts/:slug/comments, /api/admin/login

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

const error = (message, status = 400) => json({ error: message }, status);

async function verifyPassword(password, hash) {
  // Uses the Web Crypto SubtleCrypto API available in Workers
  // For bcrypt hashes seeded in schema.sql, we do a simple comparison fallback
  // In production, use a proper bcrypt library or store SHA-256 hashes
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex === hash;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const db = env.DB;

    // ─── GET /api/posts ──────────────────────────────────────────
    if (path === '/api/posts' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
      const offset = (page - 1) * limit;

      const posts = await db
        .prepare('SELECT id, title, slug, excerpt, likes, views, published, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .bind(limit, offset)
        .all();

      const total = await db.prepare('SELECT COUNT(*) as count FROM posts WHERE published = 1').first();

      return json({ posts: posts.results, total: total.count, page, limit });
    }

    // ─── GET /api/posts/:slug ───────────────────────────────────
    const postMatch = path.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch && method === 'GET') {
      const slug = postMatch[1];
      const post = await db
        .prepare('SELECT * FROM posts WHERE slug = ? AND published = 1')
        .bind(slug)
        .first();

      if (!post) return error('Post not found', 404);

      // Increment views
      await db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').bind(post.id).run();

      // Fetch tags
      const tags = await db
        .prepare('SELECT t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?')
        .bind(post.id)
        .all();

      // Fetch approved comments
      const comments = await db
        .prepare('SELECT id, author_name, content, created_at FROM comments WHERE post_id = ? AND approved = 1 ORDER BY created_at ASC')
        .bind(post.id)
        .all();

      return json({ ...post, tags: tags.results, comments: comments.results });
    }

    // ─── GET /api/search?q=... ──────────────────────────────────
    if (path === '/api/search' && method === 'GET') {
      const q = url.searchParams.get('q');
      if (!q) return error('Query parameter "q" is required');

      const results = await db
        .prepare('SELECT id, title, slug, excerpt, created_at FROM posts WHERE published = 1 AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC')
        .bind(`%${q}%`, `%${q}%`)
        .all();

      return json({ query: q, results: results.results });
    }

    // ─── POST /api/posts/:slug/like ─────────────────────────────
    const likeMatch = path.match(/^\/api\/posts\/([^/]+)\/like$/);
    if (likeMatch && method === 'POST') {
      const slug = likeMatch[1];
      const post = await db.prepare('SELECT id FROM posts WHERE slug = ? AND published = 1').bind(slug).first();
      if (!post) return error('Post not found', 404);

      await db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').bind(post.id).run();
      const updated = await db.prepare('SELECT likes FROM posts WHERE id = ?').bind(post.id).first();

      return json({ slug, likes: updated.likes });
    }

    // ─── GET/POST /api/posts/:slug/comments ────────────────────
    const commentsMatch = path.match(/^\/api\/posts\/([^/]+)\/comments$/);
    if (commentsMatch) {
      const slug = commentsMatch[1];
      const post = await db.prepare('SELECT id FROM posts WHERE slug = ? AND published = 1').bind(slug).first();
      if (!post) return error('Post not found', 404);

      if (method === 'GET') {
        const comments = await db
          .prepare('SELECT id, author_name, content, created_at FROM comments WHERE post_id = ? AND approved = 1 ORDER BY created_at ASC')
          .bind(post.id)
          .all();
        return json({ comments: comments.results });
      }

      if (method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return error('Invalid JSON body');
        }

        const { author_name, author_email, content: commentContent } = body;
        if (!author_name || !commentContent) return error('author_name and content are required');

        const result = await db
          .prepare('INSERT INTO comments (post_id, author_name, author_email, content) VALUES (?, ?, ?, ?)')
          .bind(post.id, author_name, author_email || null, commentContent)
          .run();

        return json({ id: result.meta.last_row_id, message: 'Comment added' }, 201);
      }
    }

    // ─── POST /api/admin/login ──────────────────────────────────
    if (path === '/api/admin/login' && method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return error('Invalid JSON body');
      }

      const { username, password } = body;
      if (!username || !password) return error('username and password are required');

      const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
      if (!user) return error('Invalid credentials', 401);

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) return error('Invalid credentials', 401);

      return json({ username: user.username, role: user.role, message: 'Login successful' });
    }

    // ─── Admin: POST /api/admin/posts (create) ─────────────────
    if (path === '/api/admin/posts' && method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return error('Invalid JSON body');
      }

      const { title, slug, content, excerpt, author_id, published } = body;
      if (!title || !slug || !content) return error('title, slug, and content are required');

      const result = await db
        .prepare('INSERT INTO posts (title, slug, content, excerpt, author_id, published) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(title, slug, content, excerpt || null, author_id || 1, published ?? 1)
        .run();

      return json({ id: result.meta.last_row_id, message: 'Post created' }, 201);
    }

    // ─── Admin: PUT /api/admin/posts/:id (update) ──────────────
    const adminPostMatch = path.match(/^\/api\/admin\/posts\/(\d+)$/);
    if (adminPostMatch && method === 'PUT') {
      const id = parseInt(adminPostMatch[1]);
      let body;
      try {
        body = await request.json();
      } catch {
        return error('Invalid JSON body');
      }

      const { title, content, excerpt, published } = body;
      const result = await db
        .prepare('UPDATE posts SET title = ?, content = ?, excerpt = ?, published = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(title, content, excerpt || null, published ?? 1, id)
        .run();

      if (result.meta.changes === 0) return error('Post not found', 404);
      return json({ message: 'Post updated' });
    }

    // ─── Admin: DELETE /api/admin/posts/:id ────────────────────
    if (adminPostMatch && method === 'DELETE') {
      const id = parseInt(adminPostMatch[1]);
      const result = await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
      if (result.meta.changes === 0) return error('Post not found', 404);
      return json({ message: 'Post deleted' });
    }

    // ─── GET /api/tags ──────────────────────────────────────────
    if (path === '/api/tags' && method === 'GET') {
      const tags = await db.prepare('SELECT t.*, COUNT(pt.post_id) as post_count FROM tags t LEFT JOIN post_tags pt ON t.id = pt.tag_id GROUP BY t.id ORDER BY t.name').all();
      return json({ tags: tags.results });
    }

    // ─── Root / health check ────────────────────────────────────
    if (path === '/' || path === '/api') {
      return json({ name: 'Aadi Digital Lab Blog API', status: 'live', endpoints: [
        'GET /api/posts',
        'GET /api/posts/:slug',
        'GET /api/search?q=...',
        'POST /api/posts/:slug/like',
        'GET /api/posts/:slug/comments',
        'POST /api/posts/:slug/comments',
        'POST /api/admin/login',
        'GET /api/tags',
      ]});
    }

    return error('Not found', 404);
  },
};
