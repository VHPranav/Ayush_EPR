#!/usr/bin/env bash
# Usage: deploy/scripts/restore.sh backups/ayush_epr_X.dump [backups/ayush_documents_X.tar]
set -e
cd "$(dirname "$0")/../.."
[ -f "$1" ] || { echo "Usage: $0 <db.dump> [documents.tar]"; exit 1; }
read -rp "This REPLACES the current database. Type YES to continue: " a; [ "$a" = YES ] || exit 0
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error' < "$1"
[ -n "$2" ] && docker compose exec -T server tar -C /app/storage -xf - < "$2"
echo "Restore complete."
