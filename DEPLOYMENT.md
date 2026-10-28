# AYUSH EPR — Client deployment guide

## 1. Install (once)
Docker Desktop / Docker Engine on the server. Copy this folder to it.

## 2. Configure
- Mac/Linux: `deploy/scripts/setup-env.sh` (creates `.env` with random secrets and prints the first admin password).
- Windows: copy `.env.example` to `.env`, replace every `CHANGE_ME` with long random values (`START_AYUSH_EPR.bat` checks this).
- Keep a private copy of `.env`. Losing `PASSWORD_SALT` locks everyone out.

## 3. Start
`docker compose up -d --build` (or `START_AYUSH_EPR.bat`). Open http://localhost:3000, sign in as the admin from `.env`,
then delete `ADMIN_PASSWORD` from `.env`. Create staff under **Administration > Users**.

## 4. HTTPS (required for real patient data)
Point a DNS name at the server, set `DOMAIN=` in `.env`, and start with the overlay:
`docker compose -f docker-compose.yml -f deploy/caddy/docker-compose.https.yml up -d --build`
Certificates are automatic. (Or use your own reverse proxy to 127.0.0.1:3000; keep `TRUST_PROXY` at the number of proxies in front of the API plus the web app.) Open ports 80/443 only.

## 5. Encrypted backups (daily)
Install Node.js 22+ on the backup host. Provision a separate, private key directory, then run:

```sh
node deploy/scripts/backup-crypto.mjs keygen /secure/offline-backup.key
deploy/scripts/backup.sh /secure/offline-backup.key
```

Keep the key in a separate approved vault and rehearse its retrieval. Losing it prevents recovery.
The job briefly stops web/API writers, captures a consistent database + documents snapshot, includes `.env` and migration
history inside the encrypted bundle, and restarts the app. It uses authenticated AES-256-GCM encryption and restrictive
file permissions. Schedule a clinic-approved maintenance window. Configure the scheduler to alert on a nonzero exit code.
Copy `.ayushbak` files to approved encrypted off-server storage; a local copy alone is insufficient. Retention is explicit;
the script does not automatically delete recovery points. The old Windows `.bat` backup is plaintext and is for synthetic
UAT data only; use the encrypted workflow from WSL/Linux or an approved equivalent for live data.

On an isolated recovery host with the matching checkout, Docker stack and provisioned `.env`:

```sh
deploy/scripts/restore-encrypted.sh /recovery/backup.ayushbak /secure/offline-backup.key
```

The script authenticates the backup and validates checksums before stopping writers. It requires the backed-up password
salt, restores the database in one transaction, replaces documents, and restarts the app. On restore failure, writers
stay stopped for investigation. Database and filesystem restoration are not a single atomic operation; rerun the complete
restore after resolving failure. Verify charts, document contents, logins, audit history and migration status before traffic.
Old `restore.sh` supports legacy plaintext archives only; never run it while staff are writing records.

## 6. Health and logs
`curl http://localhost:3000/api/health` · `docker compose logs -f server`
The container `/healthz` check now requires database connectivity and readable/writable document storage.

Run from the project root after DNS/HTTPS are configured:

```sh
node deploy/scripts/check-production.mjs https://epr.example.com /path/to/backups
```

This read-only probe checks HTTPS, public health, key response headers, configuration basics and backup freshness. It returns
nonzero on failure for your scheduler/monitor. It does not configure alerts or prove restore success. Configure disk-space,
certificate-expiry, database-failure and off-server backup monitoring in the hosting system and test alert delivery.

## 7. Updating
Take a database and documents backup first, then `git pull` (or copy new files) and `docker compose up -d --build`.
The API applies pending SQL files in `server/migrations/` before accepting requests. Each migration runs in a transaction;
applied filenames and checksums are stored in `schema_migrations`. Startup stops if a migration fails, or an applied file
has been changed or removed. Never edit an applied migration: add a new numbered file. `schema.sql` is the single baseline
for fresh installations; existing installations receive changes through migrations.

The dispensing update adds a batch/quantity ledger. It does not invent stock movements for prescriptions already marked
dispensed. Reconcile existing physical stock before recording new dispensing. Staff must choose the actual batches and
quantities handed over; dispensing, stock deductions, the ledger and the audit event commit together.

New notes are stored once in `clinical_records`. Historical `clinical_notes` entries are preserved; old mirrored duplicates
are not automatically deleted or merged because they have no reliable source-record link.

After restoring an older backup, restart the API (`docker compose restart server`) so pending migrations run before staff resume work.

## Roles
Defined in `server/permissions.js`; run `npm --prefix server test` after changing them.

## Verification status of this update
The current source changes are checked with isolated PostgreSQL/API regressions, role checks, frontend static checks,
builds and local browser exercises. The new backup encryption format has round-trip, wrong-key and tamper tests.
Docker is unavailable in the current development environment: the updated Compose stack and new backup/restore scripts
still require a complete target-host rehearsal. Previous container tests recorded for an earlier revision do not certify
this release. Public DNS/certificates, Windows deployment, real printers and clinic workflow acceptance remain unverified.
See `PRODUCTION_READINESS.md` for the release gates and UAT script.

## Notes
- `DOMAIN` must be in `.env` for the HTTPS overlay (compose refuses to start the overlay without it).
- If ports 3000, 80 or 443 are already used on the server, change them in `docker-compose.yml` (or an override file) before starting.
- `restore.sh` needs the stack running (it restores into the running database). Stop staff from using the system while it runs.
