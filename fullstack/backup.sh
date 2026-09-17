#!/usr/bin/env bash
# Versioned D1 backup -> GitHub (off-site history = rollback + ransomware recovery).
# Content tables only; the admin credential is re-seeded separately (never committed).
set -euo pipefail
cd "$(dirname "$0")"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "CLOUDFLARE_API_TOKEN not set"; exit 1; }
export CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-$(curl -s   -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/accounts |   python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")}
mkdir -p backups
for t in posts comments tags post_tags likes; do
  npx -y wrangler@4 d1 execute blog_db --remote --json --command "SELECT * FROM $t" 2>/dev/null |     python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=1, sort_keys=True))" > "backups/${t}.json"
  [ -s "backups/${t}.json" ] || { echo "backup of $t failed"; exit 1; }
done
echo "{"backed_up_at": "$(date -u +%FT%TZ)"}" > backups/.last-backup.json
echo "Backup written to backups/ ($(date -u))"
