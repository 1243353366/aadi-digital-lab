// Aadi Digital Lab — Live Blog (Frontend + Backend + Admin)
// Public visitors see the blog at /. Admin panel is hidden at /admin.
// All data lives in D1 (blog_db).

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const error = (msg, status = 400) => json({ error: msg }, status);
const html = (content, status = 200) =>
  new Response(content, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

async function verifyPassword(password, hash) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex === hash;
}

// ── HTML: Public Blog Frontend ──
function blogHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aadi Digital Lab — Blog</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6}
.container{max-width:800px;margin:0 auto;padding:2rem 1rem}
header{text-align:center;padding:2rem 0 3rem}
header h1{font-size:2.5rem;background:linear-gradient(135deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
header p{color:#94a3b8;margin-top:.5rem}
.post-card{background:#1e293b;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;transition:transform .2s,border-color .2s;border:1px solid #334155}
.post-card:hover{transform:translateY(-2px);border-color:#38bdf8}
.post-card h2 a{color:#f1f5f9;text-decoration:none}
.post-card h2 a:hover{color:#38bdf8}
.post-card .excerpt{color:#94a3b8;margin:.75rem 0}
.post-card .meta{font-size:.85rem;color:#64748b;display:flex;gap:1rem;align-items:center}
.tags{display:flex;gap:.5rem;flex-wrap:wrap}
.tag{background:#334155;padding:.2rem .6rem;border-radius:6px;font-size:.75rem;color:#94a3b8}
.like-btn{background:none;border:1px solid #475569;color:#e2e8f0;padding:.3rem .8rem;border-radius:6px;cursor:pointer;font-size:.85rem}
.like-btn:hover{border-color:#f43f5e;color:#f43f5e}
.search-box{display:flex;gap:.5rem;margin-bottom:2rem}
.search-box input{flex:1;padding:.6rem;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0}
.search-box button{padding:.6rem 1.2rem;border-radius:8px;border:none;background:#38bdf8;color:#0f172a;font-weight:600;cursor:pointer}
.post-detail{background:#1e293b;border-radius:12px;padding:2rem;border:1px solid #334155}
.post-detail h1{margin-bottom:.5rem}
.post-detail .content{margin:1.5rem 0;white-space:pre-wrap;color:#cbd5e1}
.comment{background:#334155;border-radius:8px;padding:1rem;margin-bottom:.75rem}
.comment .author{font-weight:600;color:#38bdf8}
.comment-form input,.comment-form textarea{width:100%;padding:.6rem;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;margin-bottom:.5rem}
.comment-form button{padding:.6rem 1.2rem;border-radius:8px;border:none;background:#818cf8;color:#0f172a;font-weight:600;cursor:pointer}
.back-link{color:#38bdf8;text-decoration:none;display:inline-block;margin-bottom:1rem}
.admin-link{position:fixed;bottom:1rem;right:1rem;font-size:.75rem;color:#475569;text-decoration:none}
</style>
</head>
<body>
<div class="container">
<header>
<h1>Aadi Digital Lab</h1>
<p>Thoughts, tutorials, and experiments</p>
</header>
<div id="app"></div>
<a class="admin-link" href="/admin">·</a>
</div>
<script>
const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentSlug = null;

async function loadPosts() {
  const res = await fetch('/api/posts');
  const data = await res.json();
  document.getElementById('app').innerHTML =
    '<div class="search-box"><input id="searchInput" placeholder="Search posts..." onkeyup="if(event.key===\\'Enter\\')search()"><button onclick="search()">Search</button></div>' +
    (data.posts.length ? data.posts.map(p =>
      '<div class="post-card"><h2><a href="#/'+p.slug+'" onclick="event.preventDefault();openPost(\\''+p.slug+'\\')">'+esc(p.title)+'</a></h2>'+
      '<div class="excerpt">'+esc(p.excerpt||'')+'</div>'+
      '<div class="meta"><span>📅 '+new Date(p.created_at).toLocaleDateString()+'</span>'+
      '<button class="like-btn" onclick="likePost(\\''+p.slug+'\\',this)">❤ '+p.likes+'</button>'+
      '<span>👁 '+p.views+'</span></div></div>'
    ).join('') : '<p>No posts yet.</p>');
}

async function search() {
  const q = document.getElementById('searchInput').value;
  if (!q) return loadPosts();
  const res = await fetch('/api/search?q='+encodeURIComponent(q));
  const data = await res.json();
  document.getElementById('app').innerHTML =
    '<a class="back-link" href="#" onclick="event.preventDefault();loadPosts()">← Back to all posts</a>' +
    (data.results.length ? data.results.map(p =>
      '<div class="post-card"><h2><a href="#/'+p.slug+'" onclick="event.preventDefault();openPost(\\''+p.slug+'\\')">'+esc(p.title)+'</a></h2><div class="excerpt">'+esc(p.excerpt||'')+'</div></div>'
    ).join('') : '<p>No results for "'+esc(q)+'".</p>');
}

async function openPost(slug) {
  currentSlug = slug;
  const res = await fetch('/api/posts/'+slug);
  const p = await res.json();
  if (p.error) { document.getElementById('app').innerHTML = '<p>'+p.error+'</p>'; return; }
  document.getElementById('app').innerHTML =
    '<a class="back-link" href="#" onclick="event.preventDefault();loadPosts()">← Back to all posts</a>' +
    '<div class="post-detail"><h1>'+esc(p.title)+'</h1>'+
    '<div class="meta" style="margin:.5rem 0"><span>📅 '+new Date(p.created_at).toLocaleDateString()+'</span>'+
    '<button class="like-btn" onclick="likePost(\\''+p.slug+'\\',this)">❤ '+p.likes+'</button>'+
    '<span>👁 '+p.views+'</span></div>'+
    (p.tags&&p.tags.length?'<div class="tags" style="margin:.75rem 0">'+p.tags.map(t=>'<span class="tag">'+esc(t.name)+'</span>').join('')+'</div>':'')+
    '<div class="content">'+p.content+'</div>'+
    '<h3 style="margin:1.5rem 0 .75rem">Comments</h3>'+
    '<div id="comments">'+(p.comments&&p.comments.length?p.comments.map(c=>
      '<div class="comment"><div class="author">'+esc(c.author_name)+'</div><div>'+esc(c.content)+'</div></div>'
    ).join(''):'<p style="color:#64748b">No comments yet.</p>')+'</div>'+
    '<div class="comment-form" style="margin-top:1rem">'+
    '<input id="cName" placeholder="Your name">'+
    '<textarea id="cBody" rows="3" placeholder="Your comment"></textarea>'+
    '<button onclick="addComment()">Post Comment</button></div></div>';
}

async function likePost(slug, btn) {
  const res = await fetch('/api/posts/'+slug+'/like', { method: 'POST' });
  const data = await res.json();
  if (data.likes !== undefined) btn.innerHTML = '❤ '+data.likes;
}

async function addComment() {
  const name = document.getElementById('cName').value.trim();
  const body = document.getElementById('cBody').value.trim();
  if (!name || !body) return alert('Name and comment are required');
  const res = await fetch('/api/posts/'+currentSlug+'/comments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author_name: name, content: body })
  });
  if (res.ok) { document.getElementById('cName').value=''; document.getElementById('cBody').value=''; openPost(currentSlug); }
}

loadPosts();
</script>
</body></html>`;
}

// ── HTML: Admin Login Page ──
function adminLoginHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Login — Aadi Digital Lab</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh}
.login-box{background:#1e293b;border-radius:12px;padding:2rem;width:350px;border:1px solid #334155}
.login-box h1{font-size:1.5rem;text-align:center;margin-bottom:1.5rem;color:#38bdf8}
.login-box input{width:100%;padding:.7rem;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;margin-bottom:.75rem}
.login-box button{width:100%;padding:.7rem;border-radius:8px;border:none;background:#38bdf8;color:#0f172a;font-weight:600;cursor:pointer}
.login-box button:hover{background:#7dd3fc}
.error{color:#f43f5e;text-align:center;margin-top:.75rem;display:none}
</style>
</head>
<body>
<div class="login-box">
<h1>🔐 Admin Login</h1>
<input id="username" placeholder="Username" value="admin">
<input id="password" type="password" placeholder="Password">
<button onclick="doLogin()">Login</button>
<div class="error" id="err">Invalid credentials</div>
</div>
<script>
async function doLogin() {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  });
  if (res.ok) {
    const data = await res.json();
    sessionStorage.setItem('admin', JSON.stringify(data));
    location.href = '/admin/dashboard';
  } else {
    document.getElementById('err').style.display = 'block';
  }
}
</script>
</body></html>`;
}

// ── HTML: Admin Dashboard ──
function adminDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard — Aadi Digital Lab</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0}
.container{max-width:900px;margin:0 auto;padding:2rem 1rem}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem}
header h1{color:#38bdf8}
.btn{padding:.5rem 1rem;border-radius:8px;border:none;cursor:pointer;font-weight:600}
.btn-primary{background:#38bdf8;color:#0f172a}
.btn-danger{background:#f43f5e;color:#fff}
.btn-edit{background:#818cf8;color:#0f172a}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:.75rem;border-bottom:1px solid #334155}
th{color:#94a3b8;font-size:.85rem}
.post-row{background:#1e293b}
.modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);display:flex;justify-content:center;align-items:center}
.modal-content{background:#1e293b;border-radius:12px;padding:2rem;width:600px;max-height:80vh;overflow-y:auto;border:1px solid #334155}
.modal-content input,.modal-content textarea{width:100%;padding:.6rem;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;margin-bottom:.75rem}
.modal-content textarea{min-height:150px;resize:vertical}
.modal-actions{display:flex;gap:.5rem;justify-content:flex-end}
</style>
</head>
<body>
<div class="container">
<header><h1>Admin Dashboard</h1><div><a href="/" style="color:#94a3b8;text-decoration:none;margin-right:1rem">View Blog</a><button class="btn btn-danger" onclick="logout()">Logout</button></div></header>
<button class="btn btn-primary" onclick="showEditor()" style="margin-bottom:1.5rem">+ New Post</button>
<table>
<thead><tr><th>ID</th><th>Title</th><th>Published</th><th>Likes</th><th>Views</th><th>Actions</th></tr></thead>
<tbody id="postList"></tbody>
</table>
</div>
<div id="editorModal" style="display:none"></div>
<script>
async function loadDashboard() {
  const admin = JSON.parse(sessionStorage.getItem('admin')||'{}');
  if (!admin.username) return location.href = '/admin';
  const res = await fetch('/api/admin/posts/list');
  const data = await res.json();
  document.getElementById('postList').innerHTML = (data.posts||[]).map(p =>
    '<tr class="post-row"><td>'+p.id+'</td><td>'+p.title+'</td><td>'+(p.published?'✅':'❌')+'</td><td>'+p.likes+'</td><td>'+p.views+'</td>'+
    '<td><button class="btn btn-edit" onclick="editPost('+p.id+')">Edit</button> <button class="btn btn-danger" onclick="deletePost('+p.id+')">Delete</button></td></tr>'
  ).join('');
}

function showEditor(post) {
  post = post || {};
  document.getElementById('editorModal').style.display = 'flex';
  document.getElementById('editorModal').innerHTML =
    '<div class="modal-content"><h2>'+(post.id?'Edit Post':'New Post')+'</h2>'+
    '<input id="eTitle" placeholder="Title" value="'+(post.title||'')+'">'+
    '<input id="eSlug" placeholder="Slug (url-friendly)" value="'+(post.slug||'')+'">'+
    '<input id="eExcerpt" placeholder="Short excerpt" value="'+(post.excerpt||'')+'">'+
    '<textarea id="eContent" placeholder="Full post content">'+(post.content||'')+'</textarea>'+
    '<label><input type="checkbox" id="ePublished" '+(post.published!==0?'checked':'')+'> Published</label>'+
    '<div class="modal-actions" style="margin-top:1rem">'+
    '<button class="btn" style="background:#475569;color:#fff" onclick="closeEditor()">Cancel</button>'+
    '<button class="btn btn-primary" onclick="savePost('+(post.id||'null')+')">Save</button></div></div>';
}

function closeEditor() { document.getElementById('editorModal').style.display='none'; }

async function savePost(id) {
  const body = {
    title: document.getElementById('eTitle').value,
    slug: document.getElementById('eSlug').value,
    excerpt: document.getElementById('eExcerpt').value,
    content: document.getElementById('eContent').value,
    published: document.getElementById('ePublished').checked ? 1 : 0
  };
  if (!body.title || !body.slug || !body.content) return alert('Title, slug, and content are required');
  const url = id ? '/api/admin/posts/'+id : '/api/admin/posts';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { closeEditor(); loadDashboard(); }
  else { const e = await res.json(); alert(e.error||'Failed'); }
}

async function editPost(id) {
  const res = await fetch('/api/admin/posts/'+id);
  const post = await res.json();
  showEditor(post);
}

async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  const res = await fetch('/api/admin/posts/'+id, { method: 'DELETE' });
  if (res.ok) loadDashboard();
}

function logout() { sessionStorage.removeItem('admin'); location.href = '/'; }
loadDashboard();
</script>
</body></html>`;
}

// ── Main Worker ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const db = env.DB;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization' } });
    }

    // ── Frontend Pages ──
    if (path === '/') return html(blogHTML());
    if (path === '/admin') return html(adminLoginHTML());
    if (path === '/admin/dashboard') return html(adminDashboardHTML());

    // ── Public API: List Posts ──
    if (path === '/api/posts' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page')||'1');
      const limit = Math.min(parseInt(url.searchParams.get('limit')||'10'),50);
      const offset = (page-1)*limit;
      const posts = await db.prepare('SELECT id,title,slug,excerpt,likes,views,published,created_at FROM posts WHERE published=1 ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit,offset).all();
      const total = await db.prepare('SELECT COUNT(*) as count FROM posts WHERE published=1').first();
      return json({ posts: posts.results, total: total.count, page, limit });
    }

    // ── Public API: Single Post ──
    const postMatch = path.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch && method === 'GET') {
      const slug = postMatch[1];
      const post = await db.prepare('SELECT * FROM posts WHERE slug=? AND published=1').bind(slug).first();
      if (!post) return error('Post not found',404);
      await db.prepare('UPDATE posts SET views=views+1 WHERE id=?').bind(post.id).run();
      const tags = await db.prepare('SELECT t.name,t.slug FROM tags t JOIN post_tags pt ON t.id=pt.tag_id WHERE pt.post_id=?').bind(post.id).all();
      const comments = await db.prepare('SELECT id,author_name,content,created_at FROM comments WHERE post_id=? AND approved=1 ORDER BY created_at ASC').bind(post.id).all();
      return json({ ...post, tags: tags.results, comments: comments.results });
    }

    // ── Public API: Search ──
    if (path === '/api/search' && method === 'GET') {
      const q = url.searchParams.get('q');
      if (!q) return error('Query parameter "q" is required');
      const results = await db.prepare('SELECT id,title,slug,excerpt,created_at FROM posts WHERE published=1 AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC').bind('%'+q+'%','%'+q+'%').all();
      return json({ query: q, results: results.results });
    }

    // ── Public API: Like ──
    const likeMatch = path.match(/^\/api\/posts\/([^/]+)\/like$/);
    if (likeMatch && method === 'POST') {
      const slug = likeMatch[1];
      const post = await db.prepare('SELECT id FROM posts WHERE slug=? AND published=1').bind(slug).first();
      if (!post) return error('Post not found',404);
      await db.prepare('UPDATE posts SET likes=likes+1 WHERE id=?').bind(post.id).run();
      const updated = await db.prepare('SELECT likes FROM posts WHERE id=?').bind(post.id).first();
      return json({ slug, likes: updated.likes });
    }

    // ── Public API: Comments ──
    const commentsMatch = path.match(/^\/api\/posts\/([^/]+)\/comments$/);
    if (commentsMatch) {
      const slug = commentsMatch[1];
      const post = await db.prepare('SELECT id FROM posts WHERE slug=? AND published=1').bind(slug).first();
      if (!post) return error('Post not found',404);
      if (method === 'GET') {
        const comments = await db.prepare('SELECT id,author_name,content,created_at FROM comments WHERE post_id=? AND approved=1 ORDER BY created_at ASC').bind(post.id).all();
        return json({ comments: comments.results });
      }
      if (method === 'POST') {
        let body; try { body = await request.json(); } catch { return error('Invalid JSON'); }
        const { author_name, author_email, content: c } = body;
        if (!author_name || !c) return error('author_name and content are required');
        const result = await db.prepare('INSERT INTO comments (post_id,author_name,author_email,content) VALUES (?,?,?,?)').bind(post.id,author_name,author_email||null,c).run();
        return json({ id: result.meta.last_row_id, message: 'Comment added' },201);
      }
    }

    // ── Public API: Tags ──
    if (path === '/api/tags' && method === 'GET') {
      const tags = await db.prepare('SELECT t.*,COUNT(pt.post_id) as post_count FROM tags t LEFT JOIN post_tags pt ON t.id=pt.tag_id GROUP BY t.id ORDER BY t.name').all();
      return json({ tags: tags.results });
    }

    // ── Admin API: Login ──
    if (path === '/api/admin/login' && method === 'POST') {
      let body; try { body = await request.json(); } catch { return error('Invalid JSON'); }
      const { username, password } = body;
      if (!username || !password) return error('username and password are required');
      const user = await db.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
      if (!user) return error('Invalid credentials',401);
      if (!(await verifyPassword(password, user.password_hash))) return error('Invalid credentials',401);
      return json({ username: user.username, role: user.role, message: 'Login successful' });
    }

    // ── Admin API: List All Posts (incl. unpublished) ──
    if (path === '/api/admin/posts/list' && method === 'GET') {
      const posts = await db.prepare('SELECT id,title,slug,published,likes,views,created_at FROM posts ORDER BY created_at DESC').all();
      return json({ posts: posts.results });
    }

    // ── Admin API: Get Single Post (for editing) ──
    const adminPostMatch = path.match(/^\/api\/admin\/posts\/(\d+)$/);
    if (adminPostMatch && method === 'GET') {
      const id = parseInt(adminPostMatch[1]);
      const post = await db.prepare('SELECT * FROM posts WHERE id=?').bind(id).first();
      if (!post) return error('Post not found',404);
      return json(post);
    }

    // ── Admin API: Create Post ──
    if (path === '/api/admin/posts' && method === 'POST') {
      let body; try { body = await request.json(); } catch { return error('Invalid JSON'); }
      const { title, slug, content, excerpt, published } = body;
      if (!title || !slug || !content) return error('title, slug, and content are required');
      const result = await db.prepare('INSERT INTO posts (title,slug,content,excerpt,author_id,published) VALUES (?,?,?,?,?,?)').bind(title,slug,content,excerpt||null,1,published??1).run();
      return json({ id: result.meta.last_row_id, message: 'Post created' },201);
    }

    // ── Admin API: Update Post ──
    if (adminPostMatch && method === 'PUT') {
      const id = parseInt(adminPostMatch[1]);
      let body; try { body = await request.json(); } catch { return error('Invalid JSON'); }
      const { title, content, excerpt, published } = body;
      const result = await db.prepare("UPDATE posts SET title=?,content=?,excerpt=?,published=?,updated_at=datetime('now') WHERE id=?").bind(title,content,excerpt||null,published??1,id).run();
      if (result.meta.changes===0) return error('Post not found',404);
      return json({ message: 'Post updated' });
    }

    // ── Admin API: Delete Post ──
    if (adminPostMatch && method === 'DELETE') {
      const id = parseInt(adminPostMatch[1]);
      const result = await db.prepare('DELETE FROM posts WHERE id=?').bind(id).run();
      if (result.meta.changes===0) return error('Post not found',404);
      return json({ message: 'Post deleted' });
    }

    if (path === '/api') return json({ name:'Aadi Digital Lab Blog API', status:'live' });
    return error('Not found',404);
  },
};