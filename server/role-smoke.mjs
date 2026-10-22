import { ALL_ROLES, PERMISSIONS, permissionsFor } from './permissions.js';
// End-to-end role check against a RUNNING API on a THROWAWAY database (it creates users, patients and records).
//   BASE_URL=http://127.0.0.1:4000 SMOKE_ADMIN_USER=admin SMOKE_ADMIN_PASSWORD=... npm --prefix server run smoke
// Needs an empty database whose first Super Administrator is that admin, and it locks out the login rate limiter at the end.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4000';
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL:', m); } };
async function call(tok, method, path, body, raw) {
  if (body && body.name === '__uniq__') body = { name: 'T' + Math.random() };
  const r = await fetch(BASE + path, { method, headers: { ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: raw ? body : body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
const login = async (u, p) => call(null, 'POST', '/api/auth/login', { username: u, password: p });

// --- admin
const adm = await login(process.env.SMOKE_ADMIN_USER || 'admin', process.env.SMOKE_ADMIN_PASSWORD || 'ayush-dev-only'); ok(adm.s === 200, 'admin login ' + adm.s);
const A = adm.j.token;
ok(adm.j.user.permissions.length === Object.keys(PERMISSIONS).length, 'admin has all perms');

// --- create one user per role
const PW = 'Str0ng-Test-Passw0rd!';
const tok = {};
for (const role of ALL_ROLES) {
  const username = 'rt.' + role.toLowerCase().replace(/_/g, '-');
  let r = await call(A, 'POST', '/api/users', { username, displayName: role + ' Tester', password: PW, roles: [role] });
  ok(r.s === 201, `create user ${role}: ${r.s} ${JSON.stringify(r.j)}`);
  const l = await login(username, PW); ok(l.s === 200, `login ${role}`);
  tok[role] = l.j?.token;
  ok(JSON.stringify([...l.j.user.permissions].sort()) === JSON.stringify(permissionsFor([role]).sort()), `perms in login match for ${role}`);
}

// --- seed data as proper roles
const pat = await call(tok.RECEPTION, 'POST', '/api/patients', { name: 'Test Patient', dob: '1980-05-01', sex: 'F', phone: '555-0100' });
ok(pat.s === 201, 'reception registers patient ' + pat.s); const PID = pat.j.patient_id, UHID = pat.j.uhid;
ok(/^AY-\d{4}-\d{5}$/.test(UHID), 'uhid format ' + UHID);
const stock = await call(tok.PHARMACIST, 'POST', '/api/pharmacy/stock', { medicineName: 'Ashwagandha', quantity: 10, reorderLevel: 5 }); ok(stock.s === 201, 'stock create');
const tm = await call(tok.DOCTOR, 'POST', '/api/treatment-master', { name: 'Abhyanga', category: 'Panchakarma' }); ok(tm.s === 201, 'treatment create ' + tm.s);
const doc = await call(tok.DOCTOR, 'POST', `/api/patients/${PID}/prescriptions`, { treatments: [{ name: 'Abhyanga' }], medicines: [{ name: 'Ashwagandha' }] }); ok(doc.s === 201, 'rx create ' + doc.s);

const P = PID, SID = stock.j.stock_id, TID = tm.j.treatment_id;
// [perm, method, path, body] - every protected endpoint with a valid body
const routes = [
  ['patients.view', 'GET', '/api/patients'],
  ['patients.view', 'GET', `/api/patients/${P}`],
  ['patients.register', 'POST', '/api/patients', { name: 'Perm Check' }],
  ['clinical.read', 'GET', `/api/patients/${P}/timeline`],
  ['clinical.read', 'GET', `/api/patients/${P}/problems`],
  ['chart.write', 'POST', `/api/patients/${P}/problems`, { problem: 'Fever' }],
  ['allergies.read', 'GET', `/api/patients/${P}/allergies`],
  ['allergies.write', 'POST', `/api/patients/${P}/allergies`, { allergen: 'Dust' }],
  ['medrec.read', 'GET', `/api/patients/${P}/medication-reconciliation`],
  ['chart.write', 'POST', `/api/patients/${P}/medication-reconciliation`, { medicineName: 'X' }],
  ['clinical.read', 'GET', `/api/patients/${P}/outcomes`],
  ['outcomes.write', 'POST', `/api/patients/${P}/outcomes`, { domain: 'Pain', score: 3 }],
  ['clinical.read', 'GET', `/api/patients/${P}/investigations`],
  ['chart.write', 'POST', `/api/patients/${P}/investigations`, { testName: 'CBC' }],
  ['clinical.read', 'GET', `/api/patients/${P}/exams`],
  ['chart.write', 'POST', `/api/patients/${P}/exams`, { findings: { a: 1 } }],
  ['clinical.read', 'GET', '/api/exam-templates'],
  ['templates.write', 'POST', '/api/exam-templates', { name: '__uniq__' }],
  ['clinical.read', 'GET', `/api/patients/${P}/referrals`],
  ['chart.write', 'POST', `/api/patients/${P}/referrals`, { referredTo: 'Dr X' }],
  ['clinical.read', 'GET', `/api/patients/${P}/care-plans`],
  ['chart.write', 'POST', `/api/patients/${P}/care-plans`, { planType:'INTEGRATED', reviewDate:'', status:'ACTIVE', goals: 'Reduce pain', interventions:'', monitoring:'weekly' }],
  ['clinical.read', 'GET', `/api/patients/${P}/treatment-sessions`],
  ['sessions.write', 'POST', `/api/patients/${P}/treatment-sessions`, { procedureNotes: 'ok' }],
  ['clinical.read', 'GET', `/api/patients/${P}/administrations`],
  ['chart.write', 'POST', `/api/patients/${P}/administrations`, { dose: '1' }],
  ['clinical.write', 'POST', `/api/patients/${P}/clinical-records`, { section: 'NOTE', payload: { type: 'SOAP', text: 'hello' } }],
  ['prescriptions.write', 'POST', `/api/patients/${P}/prescriptions`, { medicines: [{ name: 'M' }] }],
  ['discharge.write', 'POST', `/api/patients/${P}/letters`, { type: 'REFERRAL', recipient: 'X', subject: 'S', body: 'B' }],
  ['discharge.write', 'POST', `/api/patients/${P}/discharge-summaries`, { attendingProvider: 'Dr', status: 'IMPROVED', reason: 'r' }],
  ['clinical.read', 'GET', `/api/patients/${P}/discharge`],
  ['discharge.write', 'POST', `/api/patients/${P}/discharge`, { admissionSummary: 'x', diagnoses: 'Sciatica', procedures:'', medicines:'', treatmentCourse:'', conditionAtDischarge:'', followupPlan:'2 weeks', warnings:'' }],
  ['appointments.write', 'POST', `/api/patients/${P}/appointments`, { appointmentAt: new Date(Date.now() + 5 * 864e5).toISOString(), type: 'FOLLOWUP' }],
  ['appointments.read', 'GET', '/api/reception/followups'],
  ['billing.read', 'GET', `/api/patients/${P}/billing`],
  ['billing.write', 'POST', `/api/patients/${P}/billing`, { items: [{ description: 'Consult', quantity: 1, unitPrice: 50 }] }],
  ['documents.read', 'GET', `/api/patients/${P}/documents`],
  ['contacts.read', 'GET', `/api/patients/${P}/contacts`],
  ['contacts.write', 'POST', `/api/patients/${P}/contacts`, { subject: 'call' }],
  ['pharmacy.read', 'GET', '/api/pharmacy/stock'],
  ['pharmacy.write', 'POST', '/api/pharmacy/stock', { medicineName: 'Triphala', quantity: 3 }],
  ['pharmacy.write', 'PUT', `/api/pharmacy/stock/${SID}`, { medicineName: 'Ashwagandha', quantity: 9 }],
  ['treatments.read', 'GET', '/api/treatment-master'],
  ['treatments.write', 'POST', '/api/treatment-master', { name: '__uniq__' }],
  ['treatments.write', 'PUT', `/api/treatment-master/${TID}`, { name: 'Abhyanga', category: 'X' }],
  ['audit.read', 'GET', '/api/audit'],
  ['users.manage', 'GET', '/api/users'],
];
// permissions covered: every key except treatments.delete/prescriptions.read/documents.write (checked separately)
const covered = new Set(routes.map(r => r[0]));
for (const role of ALL_ROLES) {
  let bad = 0;
  for (const [perm, m, path, body] of routes) {
    const r = await call(tok[role], m, path, body);
    const allowed = permissionsFor([role]).includes(perm);
    const good = allowed ? (r.s >= 200 && r.s < 300) : r.s === 403;
    if (!good) { bad++; ok(false, `${role} ${m} ${path.replace(P, ':pid')} expected ${allowed ? '2xx' : '403'} got ${r.s} ${JSON.stringify(r.j)}`); }
    else checks++;
  }
  console.log(`${role.padEnd(26)} ${bad ? 'FAIL x' + bad : 'ok'}  (${permissionsFor([role]).length} perms)`);
}
// patient detail redaction per role
for (const role of ALL_ROLES.filter(r => permissionsFor([r]).includes('patients.view'))) {
  const d = (await call(tok[role], 'GET', `/api/patients/${P}`)).j; const p = permissionsFor([role]);
  ok((d.prescriptions.length > 0) === p.includes('prescriptions.read'), `${role} prescriptions redaction`);
  ok((d.clinicalRecords.length > 0) === p.includes('clinical.read'), `${role} clinical redaction`);
  ok(p.includes('appointments.read') === (d.appointments.length > 0), `${role} appointments redaction`);
}
// reads of prescriptions.read / documents / uhid lookup
ok((await call(tok.DOCTOR, 'GET', `/api/patients/${UHID}`)).s === 200, 'uhid lookup');
ok((await call(tok.DOCTOR, 'GET', `/api/patients/${UHID}/timeline`)).s === 404, 'uhid on sub route 404');
// documents upload/download
const fd = () => { const f = new FormData(); f.append('file', new Blob(['hello pdf'], { type: 'application/pdf' }), 'report.pdf'); f.append('documentType', 'LAB'); return f; };
for (const role of ALL_ROLES) {
  const r = await fetch(`${BASE}/api/patients/${P}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok[role] }, body: fd() });
  const allowed = permissionsFor([role]).includes('documents.write');
  ok(allowed ? r.status === 201 : r.status === 403, `${role} upload expected ${allowed ? 201 : 403} got ${r.status}`);
}
const list = await call(tok.RECEPTION, 'GET', `/api/patients/${P}/documents`); ok(list.j.length >= 1, 'doc list');
const dl = await fetch(`${BASE}/api/documents/${list.j[0].id}/download`, { headers: { Authorization: 'Bearer ' + tok.NURSE } });
ok(dl.status === 200 && (await dl.text()) === 'hello pdf', 'download content');
ok((await fetch(`${BASE}/api/documents/${list.j[0].id}/download`, { headers: { Authorization: 'Bearer ' + tok.FINANCE } })).status === 403, 'finance download 403');
const bad = new FormData(); bad.append('file', new Blob(['x']), 'evil.html');
ok((await fetch(`${BASE}/api/patients/${P}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok.DOCTOR }, body: bad })).status === 400, 'html upload rejected');
// pharmacy delete / treatment delete
ok((await call(tok.PHARMACIST, 'DELETE', `/api/pharmacy/stock/${SID}`)).s === 200, 'pharmacist delete stock');
ok((await call(tok.PHARMACIST, 'DELETE', `/api/pharmacy/stock/${SID}`)).s === 404, 'second delete 404');
ok((await call(tok.DOCTOR, 'DELETE', `/api/treatment-master/${TID}`)).s === 403, 'doctor cannot delete treatment');
ok((await call(A, 'DELETE', `/api/treatment-master/${TID}`)).s === 200, 'admin deletes treatment');
// edge cases
const nolog = await call(null, 'GET', '/api/patients'); ok(nolog.s === 401, 'unauth 401');
ok((await call('garbage', 'GET', '/api/patients')).s === 401, 'bad token 401');
ok((await call(A, 'GET', '/api/patients/not-a-uuid')).s === 404, 'bad id 404');
ok((await call(A, 'GET', '/api/patients/00000000-0000-0000-0000-000000000000')).s === 404, 'missing patient 404');
ok((await call(A, 'POST', '/api/patients/00000000-0000-0000-0000-000000000000/allergies', { allergen: 'x' })).s === 404, 'allergy on missing patient 404');
ok((await call(A, 'POST', `/api/patients/${P}/allergies`, {})).s === 400, 'allergy missing allergen 400');
ok((await call(A, 'POST', '/api/patients', { name: '  ' })).s === 400, 'blank name 400');
ok((await call(A, 'POST', `/api/patients/${P}/billing`, { items: [{ description: 'x', quantity: -1, unitPrice: 5 }] })).s === 400, 'negative billing 400');
ok((await call(A, 'POST', `/api/patients/${P}/prescriptions`, {})).s === 400, 'empty rx 400');
ok((await call(A, 'POST', `/api/patients/${P}/appointments`, {})).s === 400, 'appointment without date 400');
ok((await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status === 400, 'malformed json 400');
ok((await call(A, 'GET', '/api/nope')).s === 404, 'unknown route 404');
ok((await fetch(BASE + '/.env')).status === 404 && (await fetch(BASE + '/schema.sql')).status === 404 && (await fetch(BASE + '/DEV_CREDENTIALS.local.txt')).status === 404, 'repo files not served');
ok((await call(A, 'GET', '/api/patients?q=%25')).s === 200, 'wildcard search ok');
// user management rules
const me = adm.j.user.id;
const saId = (await call(A, 'GET', '/api/users')).j.find(u => u.username === 'rt.super-admin').user_id;
ok((await call(A, 'PUT', `/api/users/${saId}`, { active: false })).s === 200, 'deactivate 2nd admin');
ok((await call(A, 'PUT', `/api/users/${me}`, { active: false })).s === 400, 'cannot deactivate self');
ok((await call(A, 'PUT', `/api/users/${me}`, { roles: ['DOCTOR'] })).s === 400, 'cannot demote last admin');
ok((await call(A, 'POST', '/api/users', { username: 'rt.doctor', displayName: 'dup', password: PW, roles: ['DOCTOR'] })).s === 409, 'dup username 409');
ok((await call(A, 'POST', '/api/users', { username: 'x', displayName: 'a', password: PW, roles: ['DOCTOR'] })).s === 400, 'short username 400');
ok((await call(A, 'POST', '/api/users', { username: 'okname', displayName: 'a', password: 'short', roles: ['DOCTOR'] })).s === 400, 'short password 400');
ok((await call(A, 'POST', '/api/users', { username: 'okname', displayName: 'a', password: PW, roles: ['HACKER'] })).s === 400, 'bad role 400');
// deactivate -> immediate sign out; reset password
const nurseId = (await call(A, 'GET', '/api/users')).j.find(u => u.username === 'rt.nurse').user_id;
ok((await call(tok.NURSE, 'GET', '/api/me')).s === 200, 'nurse me');
ok((await call(A, 'PUT', `/api/users/${nurseId}`, { active: false })).s === 200, 'deactivate nurse');
ok((await call(tok.NURSE, 'GET', '/api/me')).s === 401, 'deactivated nurse signed out');
ok((await login('rt.nurse', PW)).s === 401, 'deactivated cannot login');
ok((await call(A, 'PUT', `/api/users/${nurseId}`, { active: true })).s === 200, 'reactivate');
ok((await call(A, 'POST', `/api/users/${nurseId}/reset-password`, { newPassword: 'Another-Passw0rd!!' })).s === 200, 'reset pw');
ok((await login('rt.nurse', PW)).s === 401, 'old pw fails'); const nl = await login('rt.nurse', 'Another-Passw0rd!!'); ok(nl.s === 200, 'new pw works');
// change password
ok((await call(nl.j.token, 'POST', '/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'Yet-Another-Pass1!' })).s === 401, 'wrong current pw');
ok((await call(nl.j.token, 'POST', '/api/auth/change-password', { currentPassword: 'Another-Passw0rd!!', newPassword: 'short' })).s === 400, 'short new pw');
ok((await call(nl.j.token, 'POST', '/api/auth/change-password', { currentPassword: 'Another-Passw0rd!!', newPassword: 'Yet-Another-Pass1!' })).s === 200, 'change pw');
// logout
ok((await call(tok.DOCTOR, 'POST', '/api/auth/logout', {})).s === 200, 'logout'); ok((await call(tok.DOCTOR, 'GET', '/api/me')).s === 401, 'token dead after logout');
// audit trail content
const au = (await call(tok.AUDITOR, 'GET', '/api/audit')).j; const acts = new Set(au.map(a => a.action));
for (const a of ['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'CREATE_USER', 'CREATE_PATIENT', 'ISSUE_PRESCRIPTION', 'UPLOAD_DOCUMENT', 'DOWNLOAD_DOCUMENT', 'CREATE_INVOICE', 'DELETE_STOCK', 'DEACTIVATE_USER', 'RESET_PASSWORD', 'PASSWORD_CHANGED', 'LOGOUT']) ok(acts.has(a), 'audit has ' + a);
// --- UI-support endpoints
const full = (await call(tok.PHARMACIST, 'GET', `/api/patients/${P}`)).j;
await call(tok.RECEPTION, 'POST', `/api/patients/${P}/allergies`, { allergen: 'Penicillin', severity: 'HIGH' });
const pharm = (await call(tok.PHARMACIST, 'GET', `/api/patients/${P}`)).j;
ok(pharm.allergies?.some(a => a.allergen === 'Penicillin'), 'pharmacist sees allergies on the patient');
ok(pharm.prescriptions[0]?.medicines?.length > 0, 'pharmacist sees prescription medicines');
ok(pharm.prescriptions.some(r => r.treatments?.length > 0), 'prescription treatments included');
ok((await call(tok.FINANCE, 'GET', `/api/patients/${P}`)).j.allergies.length === 0, 'finance gets no allergies');
const apptAt = new Date(Date.now() + 2 * 864e5).toISOString();
ok((await call(tok.RECEPTION, 'POST', `/api/patients/${P}/appointments`, { appointmentAt: new Date(Date.now() - 864e5).toISOString() })).s === 400, 'past appointment rejected');
ok((await call(tok.RECEPTION, 'POST', `/api/patients/${P}/appointments`, { appointmentAt: 'nonsense' })).s === 400, 'invalid appointment date rejected');
const ap = await call(tok.RECEPTION, 'POST', `/api/patients/${P}/appointments`, { appointmentAt: apptAt, type: 'REVIEW' });
ok(ap.s === 201, 'future appointment ok');
const fu = (await call(tok.RECEPTION, 'GET', '/api/reception/followups?days=30')).j;
ok(fu.some(x => x.appointment_id === ap.j.appointment_id && x.patient_id === P), 'followups carry ids');
ok((await call(tok.DIETITIAN, 'PUT', `/api/appointments/${ap.j.appointment_id}`, { status: 'COMPLETED' })).s === 403, 'dietitian cannot change appointment status');
ok((await call(tok.RECEPTION, 'PUT', `/api/appointments/${ap.j.appointment_id}`, { status: 'BOGUS' })).s === 400, 'bad appointment status');
ok((await call(tok.RECEPTION, 'PUT', `/api/appointments/${ap.j.appointment_id}`, { status: 'CANCELLED' })).s === 200, 'reception cancels appointment');
ok(!(await call(tok.RECEPTION, 'GET', '/api/reception/followups?days=30')).j.some(x => x.appointment_id === ap.j.appointment_id), 'cancelled appointment leaves the list');
const inv = await call(tok.RECEPTION, 'POST', `/api/patients/${P}/billing`, { items: [{ description: 'Consult', quantity: 2, unitPrice: 10 }], discount: 5, tax: 2 });
ok(inv.s === 201 && Number(inv.j.total) === 17, 'invoice total with discount and tax: ' + inv.j.total);
ok((await call(tok.DIETITIAN, 'PUT', `/api/billing/${inv.j.id}`, { status: 'PAID' })).s === 403, 'dietitian cannot mark paid');
ok((await call(tok.FINANCE, 'PUT', `/api/billing/${inv.j.id}`, { status: 'PAID' })).s === 200, 'finance marks paid');
ok((await call(tok.FINANCE, 'PUT', `/api/billing/${inv.j.id}`, { status: 'X' })).s === 400, 'bad invoice status');
const bill = (await call(tok.FINANCE, 'GET', `/api/patients/${P}/billing`)).j;
ok(bill.accounts.find(a => a.id === inv.j.id)?.status === 'PAID' && bill.items.some(i => i.account_id === inv.j.id), 'billing returns status and items');
const prov = await call(tok.RECEPTION, 'GET', '/api/providers'); ok(prov.s === 200 && prov.j.length >= 3, 'providers list');
ok((await call(tok.FINANCE, 'GET', '/api/providers')).s === 403, 'finance cannot list providers');
const st = await call(tok.MANAGER, 'GET', '/api/stats/patients'); ok(st.s === 200 && st.j.total >= 1 && Array.isArray(st.j.months), 'patient stats');
ok((await call(tok.AUDITOR, 'GET', '/api/stats/patients')).s === 403, 'auditor has no patient stats');
const aud = (await call(tok.AUDITOR, 'GET', '/api/audit')).j; ok(aud.some(a => a.username === 'rt.reception'), 'audit rows carry the username');
// rate limiting (last: it locks the account)
let code; for (let i = 0; i < 12; i++) code = (await login('rt.finance', 'wrong-password')).s;
ok(code === 429, 'login throttled after repeated failures, got ' + code);
console.log(`\n${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
