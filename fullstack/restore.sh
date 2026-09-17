#!/usr/bin/env bash
# Restore D1 content tables from backups/*.json produced by backup.sh.
# Usage: ./restore.sh            -> restores the LOCAL dev database
#        ./restore.sh --remote   -> restores production (destructive: replaces content!)
set -euo pipefail
cd "$(dirname "$0")"
REMOTE=""
[ "${1:-}" = "--remote" ] && REMOTE="--remote"
[ -d backups ] || { echo "No backups/ directory found. Run ./backup.sh first."; exit 1; }
python3 - "$REMOTE" <<'PY'
import json, subprocess, sys, tempfile, os
remote = sys.argv[1]
SQLFILE = "/tmp/adl-restore.sql"
def esc(v):
    return str(v).replace("'", "''")
def run(sql):
    open(SQLFILE, "w").write(sql)
    cmd = ["npx", "-y", "wrangler@4", "d1", "execute", "blog_db"] + (["--remote"] if remote else []) + ["--file", SQLFILE]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit("wrangler failed: " + r.stderr[-400:])
# Delete children before parents (FK constraints); insert parents before children.
# Original ids are preserved so post_tags/comments/likes references stay valid.
TABLES_DELETE_ORDER = ["comments", "post_tags", "likes", "tags", "posts"]
TABLES_INSERT_ORDER = ["posts", "tags", "post_tags", "comments", "likes"]
run("; ".join(f"DELETE FROM {t}" for t in TABLES_DELETE_ORDER) + ";")
for t in TABLES_INSERT_ORDER:
    data = json.load(open(f"backups/{t}.json"))
    rows = data[0]["results"] if isinstance(data, list) else data["result"]
    stmts = []
    for row in rows:
        cols = ", ".join(row.keys())
        vals = ", ".join("'" + esc(v) + "'" for v in row.values())
        stmts.append(f"INSERT INTO {t} ({cols}) VALUES ({vals});")
    if stmts: run("\n".join(stmts))
    print(f"restored {t}: {len(rows)} rows")
print("RESTORE COMPLETE" + (" (PRODUCTION)" if remote else " (local)"))
PY
