AYUSH EPR FULL v7 — CENTRAL DATABASE + PRODUCTION HARDENING FOUNDATION

FIRST RUN
1. Install Docker Desktop using INSTALL_PREREQUISITES.bat.
2. Copy .env.example to .env (START does this automatically).
3. Edit .env and replace every CHANGE_ME value with long random secrets, including ADMIN_USERNAME / ADMIN_PASSWORD
   (the first Super Administrator, created on the first start only; delete ADMIN_PASSWORD from .env afterwards).
   The server refuses to start in production without a real PASSWORD_SALT, and with no admin on an empty database.
4. Run START_AYUSH_EPR.bat.
5. Open http://localhost:3000 (the Next.js app; the API container is not exposed to the host).

ARCHITECTURE
web/      Next.js (TypeScript + Tailwind) frontend - this is the UI, served on port 3000.
server/   Express API (unchanged backend) on port 4000, backed by PostgreSQL.
Next.js forwards /api/* to the API, so the browser only talks to port 3000.
public.html is the old single-file UI; it is no longer used by Docker and can be deleted.

RUN WITHOUT DOCKER (Mac/Linux, for development)
  npm run install:all      (first time only)
  npm run dev              (API on :4000 + Next.js dev server on :3000)
or ./START_AYUSH_EPR.sh for a production-style run. Stop any old server on port 3000 first.

ROLES AND PERMISSIONS
All access rules live in server/permissions.js (one list of permissions -> roles). The API enforces them on
every route, and the same list is sent to the web app at login, so menus, pages and dashboards always match.
To change who can do something, edit that file and run `npm --prefix server test`.
Roles: SUPER_ADMIN, MEDICAL_DIRECTOR, DOCTOR, AYURVEDA_PHYSICIAN, MODERN_MEDICAL_CONSULTANT, NURSE,
PANCHAKARMA_THERAPIST, YOGA_THERAPIST, PHYSIOTHERAPIST, DIETITIAN, PHARMACIST, RECEPTION, FINANCE, MANAGER, AUDITOR.
USER MANAGEMENT
Sign in as a Super Administrator and open Administration > Users to add staff, assign roles, reset passwords and
deactivate accounts (a deactivated user is signed out immediately; records and audit history are kept).
Passwords must be at least 12 characters; the form can generate one. Accounts flagged "Reset password" still use the
old password format (the seeded dev accounts) - reset them before real use. The last active Super Administrator
cannot be deactivated or demoted. Every change is written to the audit log.

DATABASE
PostgreSQL is bound to 127.0.0.1:5432, not the public network.
Documents are stored in the protected Docker volume ayush_documents, not browser storage.
Clinical records are stored in PostgreSQL.

BACKUP
Run BACKUP_AYUSH_EPR.bat regularly. Test RESTORE_AYUSH_EPR.bat on a separate test environment before relying on it.

SECURITY
Read SECURITY_CHECKLIST.md before any real patient use. HTTPS/TLS should be provided by a properly configured reverse proxy. Do not expose PostgreSQL directly to the internet.

DEVELOPMENT LOGIN (npm run dev / START_AYUSH_EPR.sh only, never in Docker/production)
On an empty database the API creates reception, doctor, pharmacist and admin, all with the password "ayush-dev-only".
In production (NODE_ENV=production, as in docker-compose) nothing is seeded and old unsalted passwords are refused.

TESTING
npm --prefix server test       permission matrix unit tests
npm --prefix server run smoke  end-to-end check of all 15 roles against a running API on a throwaway database (see the file header)
