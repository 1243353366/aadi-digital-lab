-- Additive migration: reasoning layer + hardened evaluation suite.
-- Safe to re-run: IF NOT EXISTS guards everywhere; no existing table touched.

CREATE TABLE IF NOT EXISTS reasoning_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT,
  confidence TEXT,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  evidence_titles TEXT,
  provenance TEXT,
  contradictions TEXT,
  validation_status TEXT,
  agent_mode INTEGER NOT NULL DEFAULT 1,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  category TEXT NOT NULL,
  passed INTEGER NOT NULL,
  detail TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
