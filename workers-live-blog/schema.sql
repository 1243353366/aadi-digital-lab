-- Blog schema for D1
-- Run this in the D1 console or via: npx wrangler d1 execute blog_db --file=schema.sql

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_id INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  likes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

-- Post-Tag association table
CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT,
  content TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag_id ON post_tags(tag_id);

-- Seed admin user (random password shared privately; stored as SHA-256)
INSERT INTO users (username, password_hash, role) VALUES ('admin', 'c4ec784e78fd33f476e51137f9aa48ef178a9853768293dd7c71edb9b337958a', 'admin');

-- Seed tags
INSERT INTO tags (name, slug) VALUES ('Welcome', 'welcome');
INSERT INTO tags (name, slug) VALUES ('Tutorial', 'tutorial');

-- Seed starter posts
INSERT INTO posts (title, slug, content, excerpt, author_id, published) VALUES (
  'Welcome to the Blog',
  'welcome-to-the-blog',
  'Welcome to our brand-new blog! This is the first post, seeded automatically when the database was created. Stay tuned for more content.',
  'Welcome to our brand-new blog! This is the first post.',
  1,
  1
);

INSERT INTO posts (title, slug, content, excerpt, author_id, published) VALUES (
  'Getting Started with Cloudflare Workers and D1',
  'getting-started-with-cloudflare-workers-and-d1',
  'Cloudflare D1 is a serverless SQLite database that runs at the edge. In this post, we will explore how to build a blog API using Workers and D1, covering posts, comments, tags, and more.',
  'Learn how to build a blog API using Cloudflare Workers and D1.',
  1,
  1
);

-- Associate tags with posts
INSERT INTO post_tags (post_id, tag_id) VALUES (1, 1);
INSERT INTO post_tags (post_id, tag_id) VALUES (2, 1);
INSERT INTO post_tags (post_id, tag_id) VALUES (2, 2);
