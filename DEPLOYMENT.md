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

## 5. Backups (daily)
`deploy/scripts/backup.sh` (cron) or `BACKUP_AYUSH_EPR.bat` (Task Scheduler). Saves the database and uploaded documents; copy `backups/` off the server.
Restore: `deploy/scripts/restore.sh <db.dump> <documents.tar>` — rehearse once on a test machine.

## 6. Health and logs
`curl http://localhost:3000/api/health` · `docker compose logs -f server`

## 7. Updating
`git pull` (or copy new files) then `docker compose up -d --build`. Schema changes are not automatic: take a backup first.

## Roles
Defined in `server/permissions.js`; run `npm --prefix server test` after changing them.

## Verified on real containers
Tested on Docker 29 (Colima on an Apple-silicon Mac) with a fresh `.env` from `setup-env.sh`:
- build and start from nothing; first admin created; default/dev passwords rejected; API and database not published to the host;
- full 15-role API test (932 checks) and a browser pass of every role against the running containers;
- backup, then removal of all volumes, then fresh start and `restore.sh`: patients, users, uploaded documents and the audit lock all came back, old users could sign in;
- HTTPS overlay with Caddy (HTTP redirects to HTTPS, HSTS, uploads up to 20 MB, larger ones refused cleanly);
- `docker compose down` + `up`, and a rebuild with `--build`, keep all data; the API container restarts by itself after a crash.

Not tested here: a public domain with a real Let's Encrypt certificate (needs your DNS), Windows hosts, and printing.

## Notes
- `DOMAIN` must be in `.env` for the HTTPS overlay (compose refuses to start the overlay without it).
- If ports 3000, 80 or 443 are already used on the server, change them in `docker-compose.yml` (or an override file) before starting.
- `restore.sh` needs the stack running (it restores into the running database). Stop staff from using the system while it runs.
