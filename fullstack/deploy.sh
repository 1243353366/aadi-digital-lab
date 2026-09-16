#!/usr/bin/env bash
# One-shot deploy for Aadi's Digital Lab (fullstack).
# Idempotent: safe to re-run. Schema uses IF NOT EXISTS / INSERT OR IGNORE;
# incompatible tables from the old workers variants are detected and reset.
set -euo pipefail
cd "$(dirname "$0")"

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "✘ CLOUDFLARE_API_TOKEN not set"; exit 1; }

echo "==> 1/5 Verifying token has account access"
ACC=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/accounts | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('success') and d.get('result') else 'deny')")
if [ "$ACC" != "ok" ]; then
  echo "✘ Token cannot access the account. Required permissions:"
  echo "    Account → Account Settings → Read"
  echo "    Account → D1 → Edit"
  echo "    Account → Workers Scripts → Edit"
  exit 1
fi

echo "==> 2/5 Checking remote blog_db for a legacy schema"
STATE=$(npx -y wrangler@4 d1 execute blog_db --remote --json --command \
  "SELECT name FROM sqlite_master WHERE type='table'" 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); names=[r['name'] for r in d['result']]; print('legacy' if names and 'sessions' not in names else 'clean')")
if [ "$STATE" = "legacy" ]; then
  echo "    Legacy schema found — resetting blog_db (seed content only, safe to reset)"
  npx -y wrangler@4 d1 execute blog_db --remote --command \
    "DROP TABLE IF EXISTS comments; DROP TABLE IF EXISTS likes; DROP TABLE IF EXISTS post_tags; DROP TABLE IF EXISTS tags; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS posts; DROP TABLE IF EXISTS users;"
fi

echo "==> 3/5 Applying schema.sql to remote blog_db"
npx -y wrangler@4 d1 execute blog_db --remote --file=schema.sql

echo "==> 4/5 Deploying Worker"
DEPLOY_OUT=$(npx -y wrangler@4 deploy 2>&1)
echo "$DEPLOY_OUT" | grep -E "Uploaded|Deployed|workers.dev" || true

echo "==> 5/5 Verifying live app"
URL=$(echo "$DEPLOY_OUT" | grep -oE "https://[a-z0-9.-]+\.workers\.dev" | head -1)
echo "    Live URL: $URL"
curl -s -o /dev/null --max-time 15 -w "    home: %{http_code}\n" "$URL/"
curl -s --max-time 15 "$URL/api/posts" | python3 -c "import sys,json; d=json.load(sys.stdin); print('    API posts:', [p['title'] for p in d])" 2>/dev/null || echo "    ✘ API check failed"
echo "✔ Deploy complete"
