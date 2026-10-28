#!/usr/bin/env bash
# Usage: backup.sh /absolute/path/to/offline-backup.key [output-directory]
# Requires Docker Compose and Node.js 22+. Briefly stops app writers for a coherent snapshot.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
KEY=${1:?Usage: backup.sh /absolute/path/to/backup.key [output-directory]}
case "$KEY" in /*) ;; *) echo 'Key path must be absolute' >&2; exit 1;; esac
[ -r "$KEY" ] && [ -f .env ] || { echo 'Key or .env is missing' >&2; exit 1; }
command -v node >/dev/null
command -v docker >/dev/null
OUT=${2:-backups}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
STAGE=$(mktemp -d "$OUT/.backup-stage.XXXXXX")
STOPPED=0
cleanup() {
  result=$?
  trap - EXIT
  if [ "$STOPPED" = 1 ]; then docker compose start server web || result=1; fi
  rm -rf "$STAGE"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Only restart services that were known running; a stopped installation is not backed up silently.
RUNNING=$(docker compose ps --status running --services)
for service in db server web; do
  case "
$RUNNING
" in *"
$service
"*) ;; *) echo "Required service is not running: $service" >&2; exit 1;; esac
done
STOPPED=1
docker compose stop web server
# Database and documents cannot change while the API is stopped.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$STAGE/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar server -C /app/storage -cf - . > "$STAGE/documents.tar"
cp .env "$STAGE/environment.env"
cp schema.sql "$STAGE/schema.sql"
cp -R server/migrations "$STAGE/migrations"
node -e 'const fs=require("fs"); const crypto=require("crypto"); const p=process.argv[1]; const files=["database.dump","documents.tar","environment.env","schema.sql"]; fs.writeFileSync(p+"/manifest.json",JSON.stringify({format:1,createdAt:new Date().toISOString(),files:Object.fromEntries(files.map(f=>[f,crypto.createHash("sha256").update(fs.readFileSync(p+"/"+f)).digest("hex")]))},null,2))' "$STAGE"
docker compose start server web
STOPPED=0
tar -C "$STAGE" -cf "$STAGE/bundle.tar" database.dump documents.tar environment.env schema.sql migrations manifest.json
DEST="$OUT/ayush_$(date -u +%Y%m%dT%H%M%SZ).ayushbak"
node deploy/scripts/backup-crypto.mjs encrypt "$STAGE/bundle.tar" "$DEST" "$KEY"
echo "Encrypted backup complete: $DEST"
echo 'Copy it to the approved off-server location and verify a recovery copy. Keep the key separately.'
# Retention is a clinic policy. Never delete the only known recovery point automatically.
