-- ============================================================
-- Aadi's Digital Lab — schema v2 (full app)
-- Cloudflare D1 (SQLite). Safe to re-import on an existing DB:
-- all creates are IF NOT EXISTS, seeds are INSERT OR IGNORE.
-- ============================================================

-- ---------- users & sessions ----------
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'author',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------- content ----------
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id)
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    visitor_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, visitor_id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
);

-- ---------- seeds ----------
-- Default admin (change the password in Settings after first login)
INSERT OR IGNORE INTO users (username, password_hash, salt, role)
VALUES ('aadi', 'adf9a3156ed1a2a47485949ad947eea8fcfd7909180a08e8864eed9ac1bd4e63', 'cfe5f11d38fe88e71ad9b8c2bcc9e83c', 'admin');

INSERT OR IGNORE INTO posts (title, slug, content) VALUES
('Hello from the Lab', 'hello-from-the-lab',
 'Welcome to Aadi''s Digital Lab — the public notebook for research, OSINT, and systems thinking.

This site is a real app now: it runs on Cloudflare Pages with a D1 SQLite backend. Posts, comments, tags, search, and likes all live in the database; the admin dashboard at /admin manages everything.

The Lab tagline is the working method: Research, OSINT, AI, and Systems Thinking. Expect field notes, tool writeups, and experiments — documented well enough to reproduce.');

INSERT OR IGNORE INTO posts (title, slug, content) VALUES
('The OSINT checklist I actually use', 'the-osint-checklist-i-actually-use',
 'Most OSINT failures are process failures, not tool failures. Before any collection starts, three questions get answered in writing: what decision does this research support, what would change that decision, and what sources would be good enough.

Then, and only then, tooling. Pinned queries, archived copies of everything, provenance recorded at capture time — not reconstructed later.

This post is the seed entry for the research tag. The full checklist writeup is coming.');

INSERT OR IGNORE INTO tags (name) VALUES ('lab'), ('osint'), ('research'), ('ai'), ('systems');
INSERT OR IGNORE INTO post_tags (post_id, tag_id)
  SELECT p.id, t.id FROM posts p, tags t
  WHERE p.slug = 'hello-from-the-lab' AND t.name IN ('lab', 'systems');
INSERT OR IGNORE INTO post_tags (post_id, tag_id)
  SELECT p.id, t.id FROM posts p, tags t
  WHERE p.slug = 'the-osint-checklist-i-actually-use' AND t.name IN ('osint', 'research');
