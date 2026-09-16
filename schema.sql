-- Aadi's Digital Lab — Cloudflare D1 schema
-- Import once: Dashboard → Workers & Pages → D1 → blog_db → Console → paste & run,
-- or: npx wrangler d1 execute blog_db --file=./schema.sql --remote

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
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);

-- ---- Seed content (remove if you want an empty blog) ----
INSERT OR IGNORE INTO posts (title, slug, content) VALUES (
    'Hello from the Lab',
    'hello-from-the-lab',
    'Welcome to Aadi''s Digital Lab — a working notebook for research, open-source intelligence, AI experiments, and systems thinking.

Everything here is built to be checked: methods are documented, sources are named, and conclusions carry confidence levels. If a result can''t be reproduced, it doesn''t ship.

The blog itself is a small experiment too: a static site with a real Cloudflare D1 SQLite database behind a Pages Functions API. Posts live in D1, the frontend renders them client-side, and the whole stack costs nothing to run.

Upcoming notes: a walkthrough of my OSINT collection workflow, and benchmarks of retrieval pipelines over a 5,000-page document corpus.'
);

INSERT OR IGNORE INTO posts (title, slug, content) VALUES (
    'How I structure an OSINT investigation',
    'how-i-structure-an-osint-investigation',
    'Every investigation in the Lab starts the same way: a single question, written down, with a definition of what "answered" looks like. It ends with a writeup where every claim traces to a source.

The loop has four steps. Collection: an explicit plan of what data sources to sweep, logged with timestamps and URLs. Validation: each source gets a reliability grade, and each claim gets a confidence level. Analysis: structured techniques — ACH for competing hypotheses, timelines for events — so the reasoning, not just the conclusion, is visible. Publication: the notebook goes up as a post, dead ends included.

The unglamorous parts matter most: archived copies of everything, hash-verified files, and version-controlled notes so any finding can be re-run months later.'
);
