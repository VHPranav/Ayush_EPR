#!/usr/bin/env bash
# Run on an isolated recovery host with the matching application checkout and .env already provisioned.
# Usage: restore-encrypted.sh /absolute/backup.ayushbak /absolute/backup.key
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
BACKUP=${1:?Usage: restore-encrypted.sh /absolute/backup.ayushbak /absolute/backup.key}
KEY=${2:?Backup key path required}
for file in "$BACKUP" "$KEY"; do
  case "$file" in /*) ;; *) echo 'Use absolute paths' >&2; exit 1;; esac
  [ -r "$file" ] || { echo 'Input missing' >&2; exit 1; }
done
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/ayush-restore.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
node deploy/scripts/backup-crypto.mjs decrypt "$BACKUP" "$STAGE/bundle.tar" "$KEY"
tar -C "$STAGE" -xf "$STAGE/bundle.tar"
node -e 'const fs=require("fs"),crypto=require("crypto"),p=process.argv[1];const m=JSON.parse(fs.readFileSync(p+"/manifest.json"));if(m.format!==1)throw Error("Unknown format");for(const f of ["database.dump","documents.tar","environment.env","schema.sql"]){if(crypto.createHash("sha256").update(fs.readFileSync(p+"/"+f)).digest("hex")!==m.files[f])throw Error("Backup integrity failure: "+f)}' "$STAGE"
echo 'Backup authenticated and checksums verified.'
echo 'This REPLACES the target database and documents. Use an isolated recovery host.'
echo 'The target .env must contain the backed-up PASSWORD_SALT and matching database credentials.'
node -e 'const fs=require("fs");const salt=p=>fs.readFileSync(p,"utf8").split(/\r?\n/).find(l=>l.startsWith("PASSWORD_SALT="));if(!salt(".env")||salt(".env")!==salt(process.argv[1]))throw Error("PASSWORD_SALT differs. Provision the recovery .env securely before restoring.")' "$STAGE/environment.env"
read -r -p 'Type RESTORE to replace this installation: ' answer
[ "$answer" = RESTORE ] || exit 0
docker compose stop web server
# Validate archive before touching the target; restore database in one transaction.
docker compose exec -T db pg_restore --list < "$STAGE/database.dump" >/dev/null
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error --single-transaction' < "$STAGE/database.dump"
# No old document files remain. The authenticated archive was produced by backup.sh.
docker compose run --rm --no-deps -T --entrypoint sh server -c 'find /app/storage -mindepth 1 -maxdepth 1 -exec rm -rf {} \; && tar -C /app/storage -xf -' < "$STAGE/documents.tar"
docker compose start server web
echo 'Restore complete. Verify health, migrations, sample charts, downloads, roles, and audit before accepting traffic.'
# On any failure services stay stopped: investigate and rerun the complete restore.
