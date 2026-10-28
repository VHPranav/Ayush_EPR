# Production readiness — 28 October 2026

**Release decision: suitable for synthetic-data UAT after deployment verification. Live-patient approval remains pending.**

## Implemented in this update

- Hides the current chart during a patient switch; stale selections, restores and refreshes cannot replace the current chart. Patient-scoped pages remount on a switch. Changed patient forms prompt before switching/closing or leaving the browser. The warning is conservative and can still appear after a save; unsaved drafts are not stored permanently.
- Record management: reasoned demographic corrections with concurrent-edit detection; allergy/problem status changes with original values retained; signed amendments of clinical-record payloads with version/history and author restrictions; cancellation of undispensed prescriptions with concurrent-dispensing protection.
- Saved clinical records and correction history reject SQL updates, deletes and truncation. Audit log also rejects truncation. A privileged database administrator can still disable triggers; production credentials and independent backups remain essential.
- Visits can be started/closed. New assessments, prescriptions, outcomes, investigations, exams, referrals, care plans and the discharge module attach to the open visit. Cross-patient and explicitly closed visit links are rejected. Amendments retain their original visit. Clinical history remains visible.
- Chart and patient-module reads now emit audit events before data is returned. Upload content signatures are checked independently of browser MIME declarations; supported new uploads are PDF, PNG, JPEG, GIF, WebP, UTF-8 TXT and CSV. Office/archive formats are disabled.
- Health checks include database and document-storage access. HTTPS Compose overlay accounts for both Caddy and Next.js proxies.
- Encrypted coherent backup bundle, authenticated recovery, read-only production probe, and deployment instructions. Backup scheduling includes a brief clinic-approved maintenance window.

## Engineering evidence

- Isolated PostgreSQL/API regression suite, including migrations and concurrency, plus all 15 roles.
- Permission unit tests; patient request race tests; backup encryption round trip, tamper/wrong-key rejection.
- Frontend lint, TypeScript, production and demo builds.
- Local browser checks use disposable synthetic patients; no existing clinic database is migrated by these checks.
- Docker is unavailable here. Full container backup/restore and public HTTPS checks are still required; encryption tests do not substitute for restoring the database and documents.

## Required acceptance checks and owners

| Gate | Owner / dependency | Evidence to retain |
| --- | --- | --- |
| Clinical fields, units, allergy warnings, ordering and discharge | Named clinic clinical lead | Signed UAT results for each discipline and real printer output |
| Correction policy | Clinical lead | Who can amend others' work, how to correct discharge/outcome/investigation entries, and sign-off on authenticated author attestation |
| Visit policy | Clinical lead | Whether all entries require a visit; handling backdated entries, reopened visits, admissions and multiple-provider care |
| Hosting / HTTPS / firewall | Hosting operator, domain and credentials | Target-host install/restart/update tests, real certificate, private DB/API exposure |
| Backup and recovery | Hosting operator + clinic owner | Scheduled off-server copy, key recovery, full restore on a separate host, measured recovery time/data loss, alert delivery |
| Access / independent security review | Security owner | Named individual accounts, role sign-off, database least privilege, vulnerability review and penetration-test findings resolved |
| Upload handling | Security/clinical owners | Malware scanning/content-disarm decision and safe document-opening procedure; signature checks alone do not detect malware |
| Privacy and retention | Clinic + qualified local adviser | Operating and hosting jurisdictions, access/retention/export/deletion policy, incident response and patient notices |
| Operations and support | Clinic owner | Named support/on-call staff, trained staff, approved downtime procedure and supervised pilot plan |

## Product limitations requiring decisions before expanding scope

- Record amendments currently cover `clinical_records` (assessments, notes, vitals). Other module rows, including saved discharges/results/outcomes, do not yet have dedicated amendment/retraction forms. Use synthetic data until the clinic approves and the required workflows are implemented. Existing records are never silently rewritten.
- Visit association currently covers the modules listed above. Unlinked historical records remain unchanged; therapy logs and administration records remain linked through prescription lines where selected. Mandatory visit enforcement, admissions/bed management, reopening/backdating and visit-specific views require agreed clinical workflow.
- A dispensed prescription cannot be cancelled through this new control. Medication discontinuation, returns and stock reversals need a separate clinician/pharmacist workflow.
- Billing is invoice tracking, not a complete payment/refund ledger. Define the system of record before using it for financial settlement.
- This is one clinic. Multi-organisation isolation and tenancy are not implemented.
- Historical mirrored notes are retained. Reconcile duplicates and physical stock before migration; do not infer historical doses or stock movements.
- Access audit coverage is improved but needs review for list pages, exports and every role under the clinic's audit requirements. MFA, idle-lock policy and privileged-access controls require the security owner's acceptance.

## Synthetic-data UAT script

1. Register two clearly labelled test patients with distinct names/UHIDs/allergies. Open Alpha, enter an unsaved note and prescription. Switch to Beta; cancel first, then confirm. Verify Alpha's draft never appears on Beta. Repeat with a slow connection and rapid switches/close/reopen.
2. Start an OPD visit. Save an assessment and order; verify their visit IDs in the test database. Attempt another open visit: it must be refused. Close the visit, then attempt a save from an older tab: a closed explicit link must be refused.
3. Correct a demographic field with a reason. Verify the patient bar and history. Attempt the same change from a stale tab: it must conflict. Mark a test allergy entered in error; confirm the warning clears but history retains its original details. Reactivate with a reason.
4. Amend a note/assessment. Verify original content, author, time, reason and incremented version. Attempt two amendments of the same version: the second must conflict. Verify nurse/therapist cannot amend another author's record without prescribing privileges.
5. Cancel an undispensed test prescription. Verify it stays in history and leaves the pharmacy queue. Attempt to dispense it. Verify cancelled lines cannot be used for new administrations or therapy records.
6. Upload a valid small PDF/image/text document and download it. Try a renamed HTML/executable as PDF and an Office archive; reject them. Verify audit and file cleanup. Test maximum size on the deployed reverse proxy.
7. Exercise every staff role through registration, assessment, ordering, dispensing, sessions, discharge, printing and follow-up. Record blockers, expected results, tester and date.
8. On the recovery host, restore the encrypted bundle, compare representative charts and document hashes, check logins/audit/migrations, then test restart/update/rollback. Disconnect the database and simulate full storage in the isolated host; verify alerts reach the designated operator.

## Downtime procedure to approve

Stop electronic writes when patient identity, availability or record integrity is uncertain. Use the clinic-approved paper
chart/order process with patient identifiers, author and time. Keep a controlled reconciliation log. After recovery, a
responsible clinician reviews and reconciles entries against existing orders to avoid duplicate treatment or dispensing.
Record the incident, affected interval, recovery point and responsible approver before resuming care.

## Release sign-off (not yet completed)

Clinical lead: ______  Date: ______  UAT report: ______
Hosting/security owner: ______  Restore rehearsal: ______  Alert test: ______
Privacy/operations owner: ______  Training and support: ______
Pilot scope and go/no-go approver: ______
