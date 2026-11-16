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
npm --prefix server run test:integration
  Creates its own temporary PostgreSQL database and API on random localhost ports, tests patient ownership,
  audit rollback, numeric validation, notes, migrations and concurrent dispensing, then runs the 15-role smoke suite.
  It removes the test database afterwards and does not use .env or the existing development database.

DATABASE UPGRADES
schema.sql is the baseline for a new database. The API applies versioned SQL files from server/migrations/ on startup.
Back up before updates, and never modify an already-applied migration. See DEPLOYMENT.md.

PATIENT NUMBERS
New patients are numbered "running number / year they started", e.g. 4063/2026, 4064/2026 … The running number
keeps counting across years (only the year changes). A Super Administrator sets where it continues under
Patients > Patient numbers (it cannot be set to a number already in use). Existing patients keep their number.
In file names the slash becomes a dash (Saglasnost_4063-2026_…pdf); in API URLs send it encoded (4063%2F2026).

PATIENT INTAKE FORM (SAGLASNOST, TABLET)
Sidebar > Intake form (tablet) opens a full-screen page. Staff choose the patient (or "New patient"), then hand the
tablet over. The patient fills in the bilingual English / Montenegrin form step by step and signs with a finger.
On submit: the answers are saved on the patient record (shown at the top of the Doctor page), a reported allergy is
added to the allergy banner, the weight is saved as vitals, and the signed PDF is filed under Documents (type CONSENT).
A new patient is registered from the form. On an existing patient only empty details (DOB, phone, email, address)
are filled in. Nothing already on the record is overwritten. Leaving the form or the thank-you screen needs the
staff member's password. Questions: web/lib/intake-form.ts (screen) and server/intake.js (validation and PDF).
The PDF uses Noto Sans (server/fonts, SIL Open Font License) so č, ć, đ, š and ž print correctly.

INITIAL EXAM
Clinical > Initial exam follows the doctor's own note layout: diagnosis; symptoms, pulse notes and observation;
existing medicines (name as written + chemical / generic name + reason + prescribed by); diet; exercise.
"Fill from intake form" turns the patient's tablet answers into note lines (habits, sleep, bowels, therapies).
Every save is a new signed version (clinical record section INITIAL_EXAM); earlier versions stay listed below.

DOCUMENTS AND REPORTS
"Take photo" opens the tablet's rear camera; several photos (e.g. each page) can be saved at once. Large photos are
scaled to 2400 px before upload. Each report can have a title and the date printed on it. Images and PDFs show as
thumbnails and open full screen on the page (tap to zoom). Viewing is audited as VIEW_DOCUMENT.

PRESCRIPTIONS (CLINIC FORMAT, ENGLISH / MONTENEGRIN)
Each therapy line is form (elixir, powder, capsules, oil …) + formula (e.g. 3(1) + 14(1) + 15(3)) + dose + when,
optionally "mix with" and extra instructions. The printout writes the sentences in the chosen language
(web/lib/prescription-text.ts); text the doctor types is printed as written. Diagnosis and diet start from the
latest Initial exam. Letterhead, doctor block, the note after the first oral therapy and the standing advice are
edited under Prescription > Prescription settings (Super Admin), separately for English and Montenegrin.
The logo is web/public/letterhead-logo.png (cut from a screenshot for now: replace it with the clinic's PNG).
Internal notes are not printed. Pharmacy and dispensing read the same lines as before.

DHL SHIPPING DOCUMENTS
Pharmacy & catalogue > Herbal products holds each preparation: code (e.g. 15, Chandra, CNR-SO-M, or a whole
formula like 3(1) + 14(1) + 15(3)), type, ingredients, use, manufacturer, certificate and MSDS values that differ
from the standard text for its type. On Prescription > history, "DHL documents" asks for the therapy period and
the quantity of each product in the parcel (suggested from dose x doses a day x days), then makes ONE PDF:
product declaration, an MSDS per product and the product info sheets, filed under Documents (type SHIPPING).
A formula not in the catalogue combines its parts' ingredients; anything missing is named so it can be added.
The letterhead is the English one from Prescription settings. Code: server/shipping.js.

INVOICES (MONTENEGRIN LAYOUT, NOT FISCAL)
The EPR is NOT registered for fiscalization (EFI, Poreska uprava), so it issues a numbered pre-invoice
("Predračun", PR 1/2026, PR 2/2026 … restarting each year), printed in the clinic's Faktura layout and marked
"Nije fiskalni račun". Workflow: create the invoice in Billing > Print > enter it in the fiscal software >
"Fiscal codes" to record the fiscal number, IKOF and JIKR (searchable, printed at the bottom for reference).
Lines have unit (JM), discount % and PDV (Oslobođeno / 0 / 7 / 15 / 21 %). Bill the patient or a company (PIB, PDV).
Seller details (company name, PIB, bank account, payment term) are under Billing > Invoice settings (Super Admin);
each invoice keeps the seller details it was issued with. Amounts are in euro (NEXT_PUBLIC_CURRENCY to change).

DISPENSING
Choose batches and quantities for every medicine before confirming dispensing. Quantities are in each stock batch's unit;
they are entered by pharmacy staff, not inferred from a prescribed dose. Expired and insufficient stock are rejected.
