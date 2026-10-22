#!/usr/bin/env bash
# Database + uploaded documents backup into ./backups (run daily from cron; copy the files off this machine).
set -e
cd "$(dirname "$0")/../.."
TS=$(date +%Y%m%d_%H%M%S); mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/ayush_epr_$TS.dump"
docker compose exec -T server tar -C /app/storage -cf - . > "backups/ayush_documents_$TS.tar"
find backups -type f -mtime +30 -delete
echo "Backup written: backups/ayush_epr_$TS.dump and backups/ayush_documents_$TS.tar"
