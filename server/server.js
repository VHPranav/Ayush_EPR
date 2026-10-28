import express from 'express';
import helmet from 'helmet';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { closeDatabase, getDatabasePool } from './db.js';
import { ALL_ROLES, permissionsFor, requirePerm } from './permissions.js';
import { bootstrapAccounts } from './bootstrap.js';
import { patientLinks } from './patient-links.js';
import { transactional } from './transaction.js';
import { registerChartSafety, visitForWrite, checkPrescriptionLine } from './chart-safety.js';
import { validateUpload } from './uploads.js';
import { dispensePrescription } from './dispensing.js';
import { hasText, finiteNumber, missing, nonNegative, prescriptionError, requiredText } from './validation.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const PASSWORD_SALT = process.env.PASSWORD_SALT || '';
if (IS_PROD && (PASSWORD_SALT.length < 16 || PASSWORD_SALT.includes('CHANGE_ME'))) {
  console.error('Refusing to start: set PASSWORD_SALT to a long random value (16+ characters) in .env.');
  process.exit(1);
}
// Number of reverse proxies in front of the API (the Next.js server counts as one), so req.ip is the real client.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
app.disable('x-powered-by');
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 20);
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'storage');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, STORAGE_DIR),
  filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
});
const ALLOWED_UPLOADS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.csv']);
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_UPLOADS.has(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(Object.assign(new Error('That file type is not allowed'), { status: 400 })),
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '4mb' }));
// API responses carry patient data: never let a browser or proxy cache them.
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UHID_RE = /^AY-\d{4}-\d{5,}$/;
// Every :id in a route is a UUID (a patient may also be looked up by UHID); reject anything else before it reaches SQL.
app.param('id', (req, res, next, id) => {
  if (UUID_RE.test(id) || (UHID_RE.test(id) && req.method === 'GET' && req.route?.path === '/api/patients/:id')) return next();
  res.status(404).json({ error: 'Not found' });
});

app.param('recordId', (req, res, next, id) => UUID_RE.test(id) ? next() : res.status(404).json({ error: 'Not found' }));

const pool = await getDatabasePool();
await pool.query('INSERT INTO roles(name) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING', [ALL_ROLES]);

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const scryptHash = s => crypto.scryptSync(s, PASSWORD_SALT || 'CHANGE_ME_SALT', 32).toString('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
// Accounts still on the old unsalted SHA-256 format are refused in production (reset their password first).
const passwordMatches = (password, stored) =>
  stored?.startsWith('scrypt$')
    ? safeEqual(stored.slice(7), scryptHash(password))
    : !IS_PROD && !!stored && safeEqual(sha256(password), stored);
const securePassword = s => 'scrypt$' + scryptHash(s);
await bootstrapAccounts(pool, { isProd: IS_PROD, hash: securePassword, minPassword: 12 });
const token = () => crypto.randomBytes(32).toString('hex');

const audit = async (c, optsOrAction, ...rest) => {
  let userId = null, sessionId = null, action, tableName = null, recordId = null, req = null, details = null;
  let client = pool;

  if (typeof optsOrAction === 'string') {
    req = c;
    client = req.db || pool;
    action = optsOrAction;
    tableName = rest[0] || null;
    recordId = rest[1] || null;
    details = rest[2] ? { patientId: rest[2], ...(rest[3] || {}) } : null;
    userId = req?.auth?.user_id || null;
    sessionId = req?.auth?.session_id || null;
  } else {
    if (c && typeof c.query === 'function') client = c;
    const opts = optsOrAction || {};
    userId = opts.userId || null;
    sessionId = opts.sessionId || null;
    action = opts.action;
    tableName = opts.tableName || null;
    recordId = opts.recordId || null;
    req = opts.req || null;
    details = opts.details || null;
  }

  const jsonDetails = details !== null && details !== undefined
    ? (typeof details === 'object' ? JSON.stringify(details) : JSON.stringify({ detail: String(details) }))
    : null;

  await client.query(
    'INSERT INTO audit_log(user_id,session_id,action,table_name,record_id,ip_address,user_agent,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [userId, sessionId, action, tableName, recordId, req?.ip || null, req?.get?.('user-agent') || null, jsonDetails]
  );
};

app.get('/api/health', async (_req, res) => {
  try {
    const r = await pool.query('SELECT now() AS server_time');
    res.json({ ok: true, database: 'connected', serverTime: r.rows[0].server_time });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

async function auth(req, res, next) {
  const raw = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!raw) return res.status(401).json({ error: 'Authentication required' });
  const { rows } = await pool.query(
    `SELECT s.session_id,s.user_id,u.username,u.display_name,array_agg(r.name) roles
     FROM sessions s
     JOIN users u ON u.user_id=s.user_id
     LEFT JOIN user_roles ur ON ur.user_id=u.user_id
     LEFT JOIN roles r ON r.role_id=ur.role_id
     WHERE s.token_hash=$1 AND s.logout_at IS NULL AND s.expires_at>now() AND u.active
     GROUP BY s.session_id,u.user_id`,
    [sha256(raw)]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Session expired or invalid' });
  const roles = rows[0].roles.filter(Boolean);
  req.auth = { ...rows[0], roles, permissions: permissionsFor(roles) };
  next();
}

// Failed-login throttle: 10 failures per account+IP and 40 per IP in 15 minutes, in memory (resets on restart).
const FAIL_WINDOW_MS = 15 * 60e3;
const failures = new Map();
const failKeys = (req, username) => [`u:${req.ip}:${username.toLowerCase()}`, `i:${req.ip}`];
const failLimits = [10, 40];
function throttled(keys) {
  const now = Date.now();
  return keys.some((k, i) => (failures.get(k) || []).filter(t => now - t < FAIL_WINDOW_MS).length >= failLimits[i]);
}
function recordFailure(keys) {
  const now = Date.now();
  for (const k of keys) failures.set(k, [...(failures.get(k) || []).filter(t => now - t < FAIL_WINDOW_MS), now]);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of failures) if (!v.some(t => now - t < FAIL_WINDOW_MS)) failures.delete(k);
}, 5 * 60e3).unref();

app.post('/api/auth/login', transactional(pool, async (req, res, c) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) return res.status(400).json({ error: 'Username and password required' });
  const keys = failKeys(req, username);
  if (throttled(keys)) return res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in 15 minutes.' });
  const { rows } = await c.query(
    `SELECT u.*,array_remove(array_agg(r.name),NULL) roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id=u.user_id
     LEFT JOIN roles r ON r.role_id=ur.role_id
     WHERE lower(u.username)=lower($1)
     GROUP BY u.user_id`,
    [username]
  );
  const u = rows[0];
  const ok = u && u.active && passwordMatches(password, u.password_hash);
  await audit(c, { userId: ok ? u.user_id : null, action: ok ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE', tableName: 'users', recordId: u?.user_id || null, req, details: { username } });
  if (!ok || !u.active) { recordFailure(keys); req.commitOnError = true; return res.status(401).json({ error: 'Invalid credentials' }); }
  failures.delete(keys[0]);

  const raw = token();
  const exp = new Date(Date.now() + SESSION_HOURS * 3600e3);
  const s = await c.query(
    'INSERT INTO sessions(user_id,token_hash,expires_at,ip_address,user_agent) VALUES($1,$2,$3,$4,$5) RETURNING session_id',
    [u.user_id, sha256(raw), exp, req.ip, req.get('user-agent')]
  );
  await audit(c, { userId: u.user_id, sessionId: s.rows[0].session_id, action: 'SESSION_CREATED', tableName: 'sessions', recordId: s.rows[0].session_id, req });
  res.json({ token: raw, expiresAt: exp, user: { id: u.user_id, username: u.username, name: u.display_name, roles: u.roles, permissions: permissionsFor(u.roles) } });
}));

app.post('/api/auth/logout', auth, transactional(pool, async (req, res, c) => {
  await c.query('UPDATE sessions SET logout_at=now() WHERE session_id=$1', [req.auth.session_id]);
  await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'LOGOUT', tableName: 'sessions', recordId: req.auth.session_id, req });
  res.json({ ok: true });
}));

app.get('/api/me', auth, (req, res) => res.json({ id: req.auth.user_id, username: req.auth.username, name: req.auth.display_name, roles: req.auth.roles, permissions: req.auth.permissions }));

app.post('/api/auth/change-password', auth, transactional(pool, async (req, res, c) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 12)
    return res.status(400).json({ error: 'New password must be at least 12 characters' });
  const r = await c.query('SELECT password_hash FROM users WHERE user_id=$1', [req.auth.user_id]);
  if (!r.rows[0] || !passwordMatches(currentPassword, r.rows[0].password_hash))
    return res.status(401).json({ error: 'Current password is incorrect' });
  await c.query('UPDATE users SET password_hash=$1 WHERE user_id=$2', [securePassword(newPassword), req.auth.user_id]);
  await c.query('UPDATE sessions SET logout_at=now() WHERE user_id=$1 AND logout_at IS NULL AND session_id<>$2', [req.auth.user_id, req.auth.session_id]);
  await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'PASSWORD_CHANGED', tableName: 'users', recordId: req.auth.user_id, req });
  res.json({ ok: true });
}));

// ---- User management (Super Admin) ----
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i;
const MIN_PASSWORD = 12;
const validRoles = r => Array.isArray(r) && r.length > 0 && r.every(x => ALL_ROLES.includes(x));

const USER_SELECT = `
  SELECT u.user_id, u.username, u.display_name, u.active, u.created_at,
         COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), '{}') AS roles,
         (SELECT max(s.created_at) FROM sessions s WHERE s.user_id = u.user_id) AS last_login,
         (u.password_hash NOT LIKE 'scrypt$%') AS legacy_password
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.user_id
  LEFT JOIN roles r ON r.role_id = ur.role_id`;

async function setUserRoles(c, userId, roles) {
  await c.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
  await c.query('INSERT INTO user_roles(user_id, role_id) SELECT $1, role_id FROM roles WHERE name = ANY($2::text[])', [userId, roles]);
}

// Active Super Admins other than `excludeId`: there must always be at least one, or nobody can manage users.
async function otherActiveAdmins(c, excludeId) {
  const { rows } = await c.query(
    `SELECT count(*)::int AS n FROM users u JOIN user_roles ur ON ur.user_id=u.user_id JOIN roles r ON r.role_id=ur.role_id
     WHERE r.name='SUPER_ADMIN' AND u.active AND u.user_id <> $1`, [excludeId]);
  return rows[0].n;
}

app.get('/api/users', auth, requirePerm('users.manage'), async (_req, res) => {
  const { rows } = await pool.query(`${USER_SELECT} GROUP BY u.user_id ORDER BY lower(u.username)`);
  res.json(rows);
});

app.post('/api/users', auth, requirePerm('users.manage'), async (req, res) => {
  const { username, displayName, password, roles } = req.body || {};
  if (!USERNAME_RE.test(username || '')) return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore' });
  if (!displayName?.trim()) return res.status(400).json({ error: 'Full name is required' });
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  if (!validRoles(roles)) return res.status(400).json({ error: 'Choose at least one valid role' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const u = await c.query('INSERT INTO users(username, display_name, password_hash) VALUES($1,$2,$3) RETURNING user_id', [username.toLowerCase(), displayName.trim(), securePassword(password)]);
    await setUserRoles(c, u.rows[0].user_id, roles);
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'CREATE_USER', tableName: 'users', recordId: u.rows[0].user_id, req, details: { username: username.toLowerCase(), roles } });
    await c.query('COMMIT');
    const { rows } = await pool.query(`${USER_SELECT} WHERE u.user_id=$1 GROUP BY u.user_id`, [u.rows[0].user_id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(e.code === '23505' ? 409 : 400).json({ error: e.code === '23505' ? 'That username is already taken' : 'User could not be created' });
  } finally {
    c.release();
  }
});

app.put('/api/users/:id', auth, requirePerm('users.manage'), async (req, res) => {
  const { displayName, roles, active } = req.body || {};
  const id = req.params.id;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const cur = await c.query(`${USER_SELECT} WHERE u.user_id::text=$1 GROUP BY u.user_id`, [id]);
    const user = cur.rows[0];
    if (!user) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'User not found' }); }
    if (displayName !== undefined && !String(displayName).trim()) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'Full name is required' }); }
    if (roles !== undefined && !validRoles(roles)) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'Choose at least one valid role' }); }
    if (active !== undefined && typeof active !== 'boolean') { await c.query('ROLLBACK'); return res.status(400).json({ error: 'active must be true or false' }); }

    const self = user.user_id === req.auth.user_id;
    const losesAdmin = user.roles.includes('SUPER_ADMIN') && (active === false || (roles && !roles.includes('SUPER_ADMIN')));
    if (self && active === false) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'You cannot deactivate your own account' }); }
    if (losesAdmin && (await otherActiveAdmins(c, user.user_id)) === 0) {
      await c.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one active Super Administrator must remain' });
    }

    if (displayName !== undefined) await c.query('UPDATE users SET display_name=$1 WHERE user_id=$2', [String(displayName).trim(), user.user_id]);
    if (active !== undefined) await c.query('UPDATE users SET active=$1 WHERE user_id=$2', [active, user.user_id]);
    if (roles !== undefined) await setUserRoles(c, user.user_id, roles);
    // A deactivated user is signed out everywhere immediately.
    if (active === false) await c.query('UPDATE sessions SET logout_at=now() WHERE user_id=$1 AND logout_at IS NULL', [user.user_id]);

    const action = active === false ? 'DEACTIVATE_USER' : active === true && !user.active ? 'ACTIVATE_USER' : 'UPDATE_USER';
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action, tableName: 'users', recordId: user.user_id, req, details: { username: user.username, roles: roles ?? undefined, active } });
    await c.query('COMMIT');
    const { rows } = await pool.query(`${USER_SELECT} WHERE u.user_id=$1 GROUP BY u.user_id`, [user.user_id]);
    res.json(rows[0]);
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(400).json({ error: 'User could not be updated' });
  } finally {
    c.release();
  }
});

app.post('/api/users/:id/reset-password', auth, requirePerm('users.manage'), transactional(pool, async (req, res, c) => {
  const { newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  const u = await c.query('SELECT user_id, username FROM users WHERE user_id::text=$1', [req.params.id]);
  if (!u.rows[0]) return res.status(404).json({ error: 'User not found' });
  const target = u.rows[0];
  await c.query('UPDATE users SET password_hash=$1 WHERE user_id=$2', [securePassword(newPassword), target.user_id]);
  // Sign the user out everywhere (an admin resetting their own password keeps their current session).
  await c.query('UPDATE sessions SET logout_at=now() WHERE user_id=$1 AND logout_at IS NULL AND session_id <> $2', [target.user_id, target.user_id === req.auth.user_id ? req.auth.session_id : '00000000-0000-0000-0000-000000000000']);
  await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'RESET_PASSWORD', tableName: 'users', recordId: target.user_id, req, details: { username: target.username } });
  res.json({ ok: true });
}));

registerChartSafety({ app, pool, auth, audit });

app.post('/api/patients', auth, requirePerm('patients.register'), async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const b = req.body || {};
    if (typeof b.name !== 'string' || !b.name.trim()) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'Patient name is required' }); }
    const { rows } = await c.query(
      `INSERT INTO patients(name,dob,sex,phone,email,nationality,blood_group,insurance,emergency_contact,referral,primary_physician,address,registration_user)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [b.name.trim(), b.dob || null, b.sex || null, b.phone || null, b.email || null, b.nationality || null, b.blood || null, b.insurance || null, b.emergency || null, b.referral || null, b.physician || null, b.address || null, req.auth.user_id]
    );
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'CREATE_PATIENT', tableName: 'patients', recordId: rows[0].patient_id, req, details: { uhid: rows[0].uhid } });
    await c.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Patient registration failed:', e.message);
    res.status(400).json({ error: e.code === '23505' ? 'Patient identifier conflict; please retry.' : 'Patient registration failed' });
  } finally {
    c.release();
  }
});

app.get('/api/patients', auth, requirePerm('patients.view'), async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const { rows } = await pool.query(
    `SELECT patient_id,uhid,name,dob,sex,phone,registered_at FROM patients
     WHERE archived_at IS NULL AND ($1='' OR uhid ILIKE $2 OR name ILIKE $2 OR phone ILIKE $2)
     ORDER BY registered_at DESC LIMIT 100`,
    [q, `%${q.replace(/[\\%_]/g, '\\$&')}%`]
  );
  res.json(rows);
});

app.get('/api/patients/:id', auth, requirePerm('patients.view'), async (req, res) => {
  const p = await pool.query('SELECT * FROM patients WHERE patient_id::text=$1 OR uhid=$1', [req.params.id]);
  if (!p.rows[0]) return res.status(404).json({ error: 'Patient not found' });
  const id = p.rows[0].patient_id;
  const [cr, rx, lt, ds, ap] = await Promise.all([
    pool.query('SELECT cr.*, u.display_name AS author_name FROM clinical_records cr LEFT JOIN users u ON u.user_id=cr.authored_by WHERE cr.patient_id=$1 ORDER BY cr.created_at DESC', [id]),
    pool.query('SELECT * FROM prescriptions WHERE patient_id=$1 ORDER BY prescribed_at DESC', [id]),
    pool.query('SELECT * FROM letters WHERE patient_id=$1 ORDER BY created_at DESC', [id]),
    pool.query('SELECT * FROM discharge_summaries WHERE patient_id=$1 ORDER BY created_at DESC', [id]),
    pool.query('SELECT * FROM appointments WHERE patient_id=$1 ORDER BY appointment_at DESC', [id])
  ]);
  const can = perm => req.auth.permissions.includes(perm);
  // Prescription lines and allergies travel with the patient so every screen (and the allergy banner) can show them.
  let prescriptions = [];
  if (can('prescriptions.read') && rx.rows.length) {
    const ids = rx.rows.map(r => r.prescription_id);
    const [meds, trs] = await Promise.all([
      pool.query('SELECT * FROM prescription_medicines WHERE prescription_id = ANY($1) ORDER BY sort_order', [ids]),
      pool.query('SELECT * FROM prescription_treatments WHERE prescription_id = ANY($1) ORDER BY sort_order', [ids]),
    ]);
    prescriptions = rx.rows.map(r => ({
      ...r,
      medicines: meds.rows.filter(m => m.prescription_id === r.prescription_id),
      treatments: trs.rows.filter(t => t.prescription_id === r.prescription_id),
    }));
  }
  const allergies = can('allergies.read') ? (await pool.query("SELECT id,allergen,reaction,severity FROM allergies WHERE patient_id=$1 AND COALESCE(status,'ACTIVE')='ACTIVE' ORDER BY created_at DESC", [id])).rows : [];
  await audit(req, 'VIEW_PATIENT', 'patients', id, id);
  const encounters = can('clinical.read') ? (await pool.query('SELECT * FROM encounters WHERE patient_id=$1 ORDER BY started_at DESC', [id])).rows : [];
  res.json({
    ...p.rows[0],
    encounters,
    id: p.rows[0].patient_id,
    allergies,
    clinicalRecords: can('clinical.read') ? cr.rows : [],
    prescriptions,
    letters: can('clinical.read') ? lt.rows : [],
    discharges: can('clinical.read') ? ds.rows : [],
    appointments: can('appointments.read') ? ap.rows : []
  });
});

app.post('/api/patients/:id/clinical-records', auth, requirePerm('clinical.write'), patientLinks(pool, 'encounterId', 'amendedFrom'), transactional(pool, async (req, res, c) => {
  const { section, payload, encounterId = null, amendedFrom = null } = req.body || {};
  if (!hasText(section) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return res.status(400).json({ error: 'section and payload required' });
  if (section === 'NOTE' && !hasText(payload.text)) return res.status(400).json({ error: 'Note text is required' });
  let version = 1, visit = null;
  if (amendedFrom) {
    if (!hasText(req.body.amendmentReason) || req.body.amendmentReason.trim().length < 5) return res.status(400).json({ error: 'An amendment reason of at least 5 characters is required' });
    const original = (await c.query('SELECT * FROM clinical_records WHERE record_id=$1 AND patient_id=$2 FOR UPDATE', [amendedFrom, req.params.id])).rows[0];
    if (original && original.authored_by !== req.auth.user_id && !req.auth.permissions.includes('prescriptions.write')) return res.status(403).json({ error: 'Only the original author or a prescribing clinician may amend this record' });
    if (!original || original.section !== section) return res.status(400).json({ error: 'Amendment must use the original record section' });
    if ((await c.query('SELECT 1 FROM clinical_records WHERE amended_from=$1', [amendedFrom])).rowCount) return res.status(409).json({ error: 'This record has already been amended. Reload and amend its latest version.' });
    version = original.version + 1;
    visit = original.encounter_id;
  } else {
    visit = await visitForWrite(c, req.params.id, encounterId);
  }
  const { rows } = await c.query(
    'INSERT INTO clinical_records(patient_id,encounter_id,section,payload,authored_by,amended_from,version,amendment_reason,signed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) RETURNING *',
    [req.params.id, visit, section, J(payload), req.auth.user_id, amendedFrom, version, amendedFrom ? req.body.amendmentReason.trim() : null]
  );
  await audit(req, amendedFrom ? 'AMEND_CLINICAL_RECORD' : 'CREATE_CLINICAL_RECORD', 'clinical_records', rows[0].record_id, req.params.id,
    { amendedFrom, version, reason: rows[0].amendment_reason });
  res.status(201).json(rows[0]);
}));

const nonNeg = nonNegative;
// jsonb parameters must be sent as JSON text: node-pg would turn a JS array into a Postgres array literal and a bare string is not JSON.
const J = v => JSON.stringify(v ?? null);
const needText = (res, v, label) => hasText(v) ? false : (res.status(400).json({ error: `${label} is required` }), true);

app.post('/api/pharmacy/stock', auth, requirePerm('pharmacy.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  if (needText(res, b.medicineName, 'Medicine name')) return;
  if (![b.quantity, b.reorderLevel, b.purchasePrice, b.salePrice].every(nonNeg)) return res.status(400).json({ error: 'Quantity, reorder level and prices cannot be negative' });
  const { rows } = await c.query(
    `INSERT INTO pharmacy_stock(medicine_id,medicine_name,form,strength,batch_no,expiry_date,quantity,unit,reorder_level,supplier,purchase_price,location,sale_price)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [b.medicineId || null, b.medicineName, b.form || null, b.strength || null, b.batchNo || null, b.expiryDate || null, b.quantity || 0, b.unit || null, b.reorderLevel || 0, b.supplier || null, missing(b.purchasePrice) ? null : Number(b.purchasePrice), b.location || null, missing(b.salePrice) ? null : Number(b.salePrice)]
  );
  await audit(req, 'CREATE_STOCK', 'pharmacy_stock', rows[0].stock_id);
  res.status(201).json(rows[0]);
}));

app.put('/api/pharmacy/stock/:id', auth, requirePerm('pharmacy.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  if (needText(res, b.medicineName, 'Medicine name')) return;
  if (![b.quantity, b.reorderLevel, b.purchasePrice, b.salePrice].every(nonNeg)) return res.status(400).json({ error: 'Quantity, reorder level and prices cannot be negative' });
  const { rows } = await c.query(
    `UPDATE pharmacy_stock SET medicine_name=$1,form=$2,strength=$3,batch_no=$4,expiry_date=$5,quantity=$6,unit=$7,reorder_level=$8,supplier=$9,purchase_price=$10,location=$11,sale_price=$12,updated_at=now() WHERE stock_id=$13 RETURNING *`,
    [b.medicineName, b.form || null, b.strength || null, b.batchNo || null, b.expiryDate || null, b.quantity || 0, b.unit || null, b.reorderLevel || 0, b.supplier || null, missing(b.purchasePrice) ? null : Number(b.purchasePrice), b.location || null, missing(b.salePrice) ? null : Number(b.salePrice), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Stock item not found' });
  await audit(req, 'UPDATE_STOCK', 'pharmacy_stock', rows[0].stock_id);
  res.json(rows[0]);
}));

app.delete('/api/pharmacy/stock/:id', auth, requirePerm('pharmacy.write'), transactional(pool, async (req, res, c) => {
  const r = await c.query('UPDATE pharmacy_stock SET active=false,updated_at=now() WHERE stock_id=$1 AND active', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Stock item not found' });
  await audit(req, 'DELETE_STOCK', 'pharmacy_stock', req.params.id);
  res.json({ ok: true });
}));

// Prescriptions waiting to be dispensed, oldest first, with each patient's active allergies for the safety check.
app.get('/api/pharmacy/queue', auth, requirePerm('pharmacy.write'), async (_req, res) => {
  const rx = await pool.query(
    `SELECT r.prescription_id, r.prescription_no, r.prescribed_at, r.notes, p.patient_id, p.name, p.uhid,
            COALESCE((SELECT json_agg(a.allergen) FROM allergies a WHERE a.patient_id=p.patient_id AND COALESCE(a.status,'ACTIVE')='ACTIVE'), '[]'::json) AS allergies
     FROM prescriptions r JOIN patients p ON p.patient_id=r.patient_id
     WHERE r.status='ISSUED' ORDER BY r.prescribed_at ASC LIMIT 100`);
  if (!rx.rows.length) return res.json([]);
  const ids = rx.rows.map(r => r.prescription_id);
  const meds = await pool.query('SELECT * FROM prescription_medicines WHERE prescription_id = ANY($1) ORDER BY sort_order', [ids]);
  res.json(rx.rows.map(r => ({ ...r, medicines: meds.rows.filter(m => m.prescription_id === r.prescription_id) })));
});

app.post('/api/prescriptions/:id/dispense', auth, requirePerm('pharmacy.write'), transactional(pool, async (req, res, c) => {
  const result = await dispensePrescription(c, req.params.id, req.body?.items ?? [], req.auth.user_id);
  await audit(req, 'DISPENSE_PRESCRIPTION', 'prescriptions', result.prescription_id, result.patient_id,
    { prescriptionNo: result.prescription_no, items: req.body?.items ?? [] });
  res.json(result);
}));

app.get('/api/pharmacy/stock', auth, requirePerm('pharmacy.read'), async (_req, res) => {
  const { rows } = await pool.query('SELECT *, (quantity<=reorder_level) AS low_stock, (expiry_date IS NOT NULL AND expiry_date<CURRENT_DATE) AS expired FROM pharmacy_stock WHERE active ORDER BY medicine_name');
  res.json(rows);
});

app.post('/api/treatment-master', auth, requirePerm('treatments.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  if (needText(res, b.name, 'Treatment name')) return;
  if (!nonNeg(b.rate)) return res.status(400).json({ error: 'Rate cannot be negative' });
  const { rows } = await c.query(
    'INSERT INTO treatment_master(name,category,default_frequency,default_duration,practitioner,instructions,precautions,rate) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [b.name, b.category || null, b.frequency || null, b.duration || null, b.practitioner || null, b.instructions || null, b.precautions || null, missing(b.rate) ? null : Number(b.rate)]
  );
  await audit(req, 'CREATE_TREATMENT', 'treatment_master', rows[0].treatment_id);
  res.status(201).json(rows[0]);
}));

app.put('/api/treatment-master/:id', auth, requirePerm('treatments.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  if (needText(res, b.name, 'Treatment name')) return;
  if (!nonNeg(b.rate)) return res.status(400).json({ error: 'Rate cannot be negative' });
  const { rows } = await c.query(
    'UPDATE treatment_master SET name=$1,category=$2,default_frequency=$3,default_duration=$4,practitioner=$5,instructions=$6,precautions=$7,rate=$8 WHERE treatment_id=$9 RETURNING *',
    [b.name, b.category || null, b.frequency || null, b.duration || null, b.practitioner || null, b.instructions || null, b.precautions || null, missing(b.rate) ? null : Number(b.rate), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Treatment not found' });
  await audit(req, 'UPDATE_TREATMENT', 'treatment_master', rows[0].treatment_id);
  res.json(rows[0]);
}));

app.delete('/api/treatment-master/:id', auth, requirePerm('treatments.delete'), transactional(pool, async (req, res, c) => {
  const r = await c.query('UPDATE treatment_master SET active=false WHERE treatment_id=$1 AND active', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Treatment not found' });
  await audit(req, 'DELETE_TREATMENT', 'treatment_master', req.params.id);
  res.json({ ok: true });
}));

app.get('/api/treatment-master', auth, requirePerm('treatments.read'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM treatment_master WHERE active ORDER BY name');
  res.json(rows);
});

app.post('/api/patients/:id/prescriptions', auth, requirePerm('prescriptions.write'), async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const b = req.body || {};
    const invalid = prescriptionError(b);
    if (invalid) { await c.query('ROLLBACK'); return res.status(400).json({ error: invalid }); }
    const encounterId = await visitForWrite(c, req.params.id, b.encounterId);
    const p = await c.query('INSERT INTO prescriptions(patient_id,prescriber_user,status,notes,encounter_id) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.params.id, req.auth.user_id, b.status || 'ISSUED', b.notes || null, encounterId]);
    const rx = p.rows[0];
    for (const [i, t] of (b.treatments || []).entries()) {
      await c.query(
        'INSERT INTO prescription_treatments(prescription_id,treatment_name,frequency,duration,practitioner,instructions,precautions,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [rx.prescription_id, t.name, t.frequency || null, t.duration || null, t.practitioner || null, t.instructions || null, t.precautions || null, i]
      );
    }
    for (const [i, m] of (b.medicines || []).entries()) {
      await c.query(
        'INSERT INTO prescription_medicines(prescription_id,medicine_name,form,dose,route,frequency,duration,timing,anupana,indication,instructions,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [rx.prescription_id, m.name, m.form || null, m.dose || null, m.route || null, m.frequency || null, m.duration || null, m.timing || null, m.anupana || null, m.indication || null, m.instructions || null, i]
      );
    }
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'ISSUE_PRESCRIPTION', tableName: 'prescriptions', recordId: rx.prescription_id, req, details: { prescriptionNo: rx.prescription_no } });
    await c.query('COMMIT');
    res.status(201).json(rx);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Prescription failed:', e.message);
    res.status(e.status || (e.code === '23503' ? 404 : 400)).json({ error: e.status ? e.message : e.code === '23503' ? 'Patient not found' : 'Prescription could not be saved' });
  } finally {
    c.release();
  }
});

app.post('/api/patients/:id/letters', auth, requirePerm('discharge.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  const { rows } = await c.query(
    'INSERT INTO letters(patient_id,letter_type,recipient,subject,body,authored_by,author_id) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *',
    [req.params.id, b.type, b.recipient, b.subject, b.body, req.auth.user_id]
  );
  await audit(req, 'CREATE_LETTER', 'letters', rows[0].letter_id, req.params.id);
  res.status(201).json(rows[0]);
}));

app.post('/api/patients/:id/discharge-summaries', auth, requirePerm('discharge.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  const { rows } = await c.query(
    `INSERT INTO discharge_summaries(patient_id,admission_date,discharge_date,attending_provider,discharge_status,reason,final_diagnosis,clinical_course,procedures,discharge_medicines,diet_lifestyle,followup_plan,warning_signs,remarks,authored_by,author_id)
     VALUES($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`,
    [req.params.id, b.admissionDate || null, b.dischargeDate || null, b.attendingProvider, b.status, b.reason, b.finalDiagnosis, b.clinicalCourse, b.procedures, b.dischargeMedicines, b.dietLifestyle, b.followupPlan, b.warningSigns, b.remarks, req.auth.user_id]
  );
  await audit(req, 'CREATE_DISCHARGE', 'discharge_summaries', rows[0].discharge_id, req.params.id);
  res.status(201).json(rows[0]);
}));

// A scheduled appointment for the same doctor that overlaps [start, start+minutes). `ignoreId` excludes the appointment being moved.
async function findClash(providerId, start, minutes, ignoreId) {
  const { rows } = await pool.query(
    `SELECT a.appointment_at, p.name, u.display_name AS provider_name FROM appointments a
     JOIN patients p ON p.patient_id=a.patient_id LEFT JOIN users u ON u.user_id=a.provider_user
     WHERE a.provider_user=$1 AND a.status='SCHEDULED' AND ($4::uuid IS NULL OR a.appointment_id<>$4::uuid)
       AND a.appointment_at < $2::timestamptz + make_interval(mins => $3) AND a.appointment_at + make_interval(mins => a.duration_minutes) > $2::timestamptz
     LIMIT 1`, [providerId, start.toISOString(), minutes, ignoreId]);
  return rows[0] || null;
}

app.post('/api/patients/:id/appointments', auth, requirePerm('appointments.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  const when = new Date(b.appointmentAt);
  if (!b.appointmentAt || Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Choose a valid date and time' });
  if (when.getTime() < Date.now() - 5 * 60e3) return res.status(400).json({ error: 'The appointment cannot be in the past' });
  const minutes = b.durationMinutes === undefined ? 30 : Number(b.durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) return res.status(400).json({ error: 'Appointment length must be between 5 and 480 minutes' });
  if (b.providerUser && !b.confirmClash) {
    const clash = await findClash(b.providerUser, when, minutes, null);
    if (clash) return res.status(409).json({ error: `${clash.provider_name || 'That doctor'} already has ${clash.name} booked at that time. Book anyway?`, clash: true });
  }
  const { rows } = await c.query(
    'INSERT INTO appointments(patient_id,appointment_at,provider_user,type,reason,reception_reminder,created_by,duration_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [req.params.id, b.appointmentAt, b.providerUser || null, b.type || null, b.reason || null, b.receptionReminder !== false, req.auth.user_id, minutes]
  );
  await audit(req, 'CREATE_APPOINTMENT', 'appointments', rows[0].appointment_id, req.params.id);
  res.status(201).json(rows[0]);
}));

app.get('/api/providers', auth, requirePerm('appointments.write'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.user_id, u.display_name FROM users u JOIN user_roles ur ON ur.user_id=u.user_id JOIN roles r ON r.role_id=ur.role_id
     WHERE u.active AND r.name IN ('DOCTOR','AYURVEDA_PHYSICIAN','MODERN_MEDICAL_CONSULTANT') ORDER BY u.display_name`);
  res.json(rows);
});

app.put('/api/appointments/:id', auth, requirePerm('appointments.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  const cur = await c.query('SELECT * FROM appointments WHERE appointment_id=$1', [req.params.id]);
  if (!cur.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
  const a = cur.rows[0];
  if (b.status !== undefined && !['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
  let when = new Date(a.appointment_at);
  if (b.appointmentAt !== undefined) {
    when = new Date(b.appointmentAt);
    if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Choose a valid date and time' });
    if (when.getTime() < Date.now() - 5 * 60e3) return res.status(400).json({ error: 'The appointment cannot be moved into the past' });
  }
  const minutes = b.durationMinutes === undefined ? a.duration_minutes : Number(b.durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) return res.status(400).json({ error: 'Appointment length must be between 5 and 480 minutes' });
  const provider = b.providerUser === undefined ? a.provider_user : (b.providerUser || null);
  const moved = b.appointmentAt !== undefined || b.providerUser !== undefined || b.durationMinutes !== undefined;
  if (moved && provider && !b.confirmClash && (b.status ?? a.status) === 'SCHEDULED') {
    const clash = await findClash(provider, when, minutes, a.appointment_id);
    if (clash) return res.status(409).json({ error: `${clash.provider_name || 'That doctor'} already has ${clash.name} booked at that time. Book anyway?`, clash: true });
  }
  const { rows } = await c.query(
    'UPDATE appointments SET status=$1, appointment_at=$2, duration_minutes=$3, provider_user=$4, type=COALESCE($5,type), reason=COALESCE($6,reason) WHERE appointment_id=$7 RETURNING appointment_id,patient_id,status,appointment_at,duration_minutes',
    [b.status ?? a.status, when.toISOString(), minutes, provider, b.type ?? null, b.reason ?? null, a.appointment_id]);
  await audit(req, moved ? 'RESCHEDULE_APPOINTMENT' : 'UPDATE_APPOINTMENT', 'appointments', a.appointment_id, a.patient_id, { status: rows[0].status });
  res.json(rows[0]);
}));

// Registration counts for the dashboard, computed over all patients (the directory list is capped at 100).
app.get('/api/stats/patients', auth, requirePerm('patients.view'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT to_char(date_trunc('month', registered_at), 'YYYY-MM') AS month, count(*)::int AS n
     FROM patients WHERE archived_at IS NULL AND registered_at >= date_trunc('month', now()) - interval '11 months' GROUP BY 1 ORDER BY 1`);
  const total = (await pool.query('SELECT count(*)::int AS n FROM patients WHERE archived_at IS NULL')).rows[0].n;
  res.json({ total, months: rows });
});

// Filters: ?q= (user, action, table or record), ?action=, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD, ?limit= (default 500, max 5000 for export).
app.get('/api/audit', auth, requirePerm('audit.read'), async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const action = String(req.query.action || '').trim().slice(0, 60);
  const day = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
  const { rows } = await pool.query(
    `SELECT a.audit_id, a.event_time, a.action, a.table_name, a.record_id, a.ip_address, a.details, u.username, u.display_name
     FROM audit_log a LEFT JOIN users u ON u.user_id=a.user_id
     WHERE ($1='' OR a.action=$1)
       AND ($2='' OR u.username ILIKE $3 OR a.action ILIKE $3 OR a.table_name ILIKE $3 OR a.record_id ILIKE $3)
       AND ($4::date IS NULL OR a.event_time >= $4::date) AND ($5::date IS NULL OR a.event_time < $5::date + 1)
     ORDER BY a.event_time DESC, a.audit_id DESC LIMIT $6`,
    [action, q, `%${q.replace(/[\\%_]/g, '\\$&')}%`, day(req.query.from), day(req.query.to), limit]);
  res.json(rows);
});

// Every appointment starting in [from, to) for the calendar view (all statuses; the UI fades cancelled ones).
app.get('/api/appointments', auth, requirePerm('appointments.read'), async (req, res) => {
  const from = new Date(String(req.query.from || '')), to = new Date(String(req.query.to || ''));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to - from > 100 * 864e5) return res.status(400).json({ error: 'Choose a valid date range (up to 100 days)' });
  const { rows } = await pool.query(
    `SELECT a.appointment_id, a.patient_id, a.appointment_at, a.duration_minutes, a.type, a.reason, a.status, a.provider_user,
            u.display_name AS provider_name, p.name, p.uhid
     FROM appointments a JOIN patients p ON p.patient_id=a.patient_id LEFT JOIN users u ON u.user_id=a.provider_user
     WHERE a.appointment_at >= $1 AND a.appointment_at < $2 ORDER BY a.appointment_at LIMIT 1000`, [from.toISOString(), to.toISOString()]);
  res.json(rows);
});

app.get('/api/reception/followups', auth, requirePerm('appointments.read'), async (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const { rows } = await pool.query(
    `SELECT a.*,p.uhid,p.name,p.patient_id,pu.display_name AS provider_name FROM appointments a
     JOIN patients p ON p.patient_id=a.patient_id
     LEFT JOIN users pu ON pu.user_id=a.provider_user
     WHERE a.reception_reminder AND a.status='SCHEDULED' AND a.appointment_at BETWEEN now() AND now()+($1||' days')::interval
     ORDER BY a.appointment_at`,
    [days]
  );
  res.json(rows);
});

// ---- Full EPR module APIs ----
app.get('/api/patients/:id/timeline', auth, requirePerm('clinical.read'), async (req, res) => {
  const id = req.params.id;
  {
    const r = await pool.query(
      `SELECT * FROM (
        SELECT started_at AS event_time,'ENCOUNTER' AS event_type, encounter_id::text AS event_id, status AS title, '' AS detail FROM encounters WHERE patient_id=$1
        UNION ALL SELECT created_at,'NOTE',record_id::text,COALESCE(payload->>'type','Note'),COALESCE(payload->>'text','') FROM clinical_records WHERE patient_id=$1 AND section='NOTE'
        UNION ALL SELECT created_at,'NOTE',id::text,note_type,note_text FROM clinical_notes WHERE patient_id=$1
        UNION ALL SELECT prescribed_at,'PRESCRIPTION',prescription_id::text,prescription_no,status FROM prescriptions WHERE patient_id=$1
        UNION ALL SELECT appointment_at,'APPOINTMENT',appointment_id::text,type,COALESCE(reason,'') FROM appointments WHERE patient_id=$1
        UNION ALL SELECT created_at,'PROBLEM',id::text,problem,COALESCE(notes,'') FROM patient_problems WHERE patient_id=$1
        UNION ALL SELECT created_at,'REFERRAL',id::text,COALESCE(specialty,''),COALESCE(reason,'') FROM referrals WHERE patient_id=$1
      ) x ORDER BY event_time DESC`,
      [id]
    );
    await audit(req, 'VIEW_TIMELINE', 'patients', id, id);
    res.json(r.rows);
  }
});

app.get('/api/patients/:id/problems', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM patient_problems WHERE patient_id=$1 ORDER BY created_at DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'problems' });
  res.json(rows);
});

app.post('/api/patients/:id/problems', auth, requirePerm('chart.write'), requiredText('problem'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  if (!['ACTIVE', 'RESOLVED', 'HISTORICAL'].includes(b.status || 'ACTIVE')) return res.status(400).json({ error: 'Invalid initial status; use a reasoned correction for existing records' });
  const r = await c.query(
    `INSERT INTO patient_problems(patient_id,problem,type,onset_date,status,notes,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id, b.problem, b.type || 'ACTIVE', b.onsetDate || null, b.status || 'ACTIVE', b.notes || null, req.auth.user_id]
  );
  await audit(req, 'CREATE_PROBLEM', 'patient_problems', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/allergies', auth, requirePerm('allergies.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM allergies WHERE patient_id=$1 ORDER BY created_at DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'allergies' });
  res.json(rows);
});

app.post('/api/patients/:id/allergies', auth, requirePerm('allergies.write'), requiredText('allergen'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  if (!['ACTIVE'].includes(b.status || 'ACTIVE')) return res.status(400).json({ error: 'Invalid initial status; use a reasoned correction for existing records' });
  const r = await c.query(
    `INSERT INTO allergies(patient_id,allergen,reaction,severity,recorded_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, b.allergen, b.reaction || null, b.severity || null, req.auth.user_id]
  );
  await audit(req, 'CREATE_ALLERGY', 'allergies', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/medication-reconciliation', auth, requirePerm('medrec.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM medication_reconciliation WHERE patient_id=$1 ORDER BY reconciled_at DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'medication-reconciliation' });
  res.json(rows);
});

app.post('/api/patients/:id/medication-reconciliation', auth, requirePerm('chart.write'), requiredText('medicineName'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  const r = await c.query(
    `INSERT INTO medication_reconciliation(patient_id,medicine_name,dose,route,frequency,source,reconciled_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id, b.medicineName, b.dose || null, b.route || null, b.frequency || null, b.source || null, req.auth.user_id]
  );
  await audit(req, 'RECONCILE_MEDICATION', 'medication_reconciliation', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/outcomes', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM outcomes WHERE patient_id=$1 ORDER BY assessment_date DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'outcomes' });
  res.json(rows);
});

app.post('/api/patients/:id/outcomes', auth, requirePerm('outcomes.write'), requiredText('domain'), patientLinks(pool, 'encounterId'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  b.encounterId = await visitForWrite(c, req.params.id, b.encounterId);
  if (!missing(b.score) && !finiteNumber(b.score)) return res.status(400).json({ error: 'Score must be a finite number' });
  const r = await c.query(
    `INSERT INTO outcomes(patient_id,encounter_id,assessment_date,domain,scale_name,score,unit,narrative,assessor_id) VALUES($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.params.id, b.encounterId || null, b.date || null, b.domain, b.scaleName || null, missing(b.score) ? null : Number(b.score), b.unit || null, b.narrative || null, req.auth.user_id]
  );
  await audit(req, 'CREATE_OUTCOME', 'outcomes', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/investigations', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM investigations WHERE patient_id=$1 ORDER BY COALESCE(result_date,requested_date) DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'investigations' });
  res.json(rows);
});

app.post('/api/patients/:id/investigations', auth, requirePerm('chart.write'), requiredText('testName'), patientLinks(pool, 'encounterId'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  b.encounterId = await visitForWrite(c, req.params.id, b.encounterId);
  const r = await c.query(
    `INSERT INTO investigations(patient_id,encounter_id,investigation_type,test_name,requested_date,result_date,result_summary,result_data,abnormal_flag,ordered_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.params.id, b.encounterId || null, b.type || null, b.testName, b.requestedDate || null, b.resultDate || null, b.summary || null, b.data == null ? null : J(b.data), b.abnormal || false, req.auth.user_id]
  );
  await audit(req, 'CREATE_INVESTIGATION', 'investigations', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/exams', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT er.*,et.name template_name FROM exam_results er LEFT JOIN exam_templates et ON et.id=er.template_id WHERE er.patient_id=$1 ORDER BY er.created_at DESC`,
    [req.params.id]
  );
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'exams' });
  res.json(rows);
});

app.post('/api/patients/:id/exams', auth, requirePerm('chart.write'), patientLinks(pool, 'encounterId'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  b.encounterId = await visitForWrite(c, req.params.id, b.encounterId);
  const r = await c.query(
    `INSERT INTO exam_results(patient_id,encounter_id,template_id,findings,examiner_id) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, b.encounterId || null, b.templateId || null, J(b.findings ?? {}), req.auth.user_id]
  );
  await audit(req, 'CREATE_EXAM', 'exam_results', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/exam-templates', auth, requirePerm('clinical.read'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM exam_templates WHERE active ORDER BY name');
  res.json(rows);
});

app.post('/api/exam-templates', auth, requirePerm('templates.write'), requiredText('name'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  const r = await c.query(
    'INSERT INTO exam_templates(name,specialty,fields) VALUES($1,$2,$3) RETURNING *',
    [b.name, b.specialty || null, J(b.fields ?? [])]
  );
  await audit(req, 'CREATE_EXAM_TEMPLATE', 'exam_templates', r.rows[0].id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/referrals', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM referrals WHERE patient_id=$1 ORDER BY referral_date DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'referrals' });
  res.json(rows);
});

app.post('/api/patients/:id/referrals', auth, requirePerm('chart.write'), requiredText('referredTo'), patientLinks(pool, 'encounterId'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  b.encounterId = await visitForWrite(c, req.params.id, b.encounterId);
  const r = await c.query(
    `INSERT INTO referrals(patient_id,encounter_id,referred_to,specialty,reason,urgency,status,referral_date,followup_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.params.id, b.encounterId || null, b.referredTo || null, b.specialty || null, b.reason || null, b.urgency || null, b.status || 'PENDING', b.referralDate || new Date().toISOString().slice(0, 10), b.followupDate || null, req.auth.user_id]
  );
  await audit(req, 'CREATE_REFERRAL', 'referrals', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/care-plans', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM care_plans WHERE patient_id=$1 ORDER BY created_at DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'care-plans' });
  res.json(rows);
});

app.post('/api/patients/:id/care-plans', auth, requirePerm('chart.write'), patientLinks(pool, 'encounterId'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  b.encounterId = await visitForWrite(c, req.params.id, b.encounterId);
  const r = await c.query(
    `INSERT INTO care_plans(patient_id,encounter_id,plan_type,goals,interventions,monitoring,review_date,status,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.params.id, b.encounterId || null, b.planType || 'INTEGRATED', J(b.goals ?? []), J(b.interventions ?? []), J(b.monitoring ?? []), b.reviewDate || null, b.status || 'ACTIVE', req.auth.user_id]
  );
  await audit(req, 'CREATE_CARE_PLAN', 'care_plans', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/treatment-sessions', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ts.*, u.display_name AS practitioner_name, pt.treatment_name FROM treatment_sessions ts
     LEFT JOIN users u ON u.user_id=ts.practitioner_id LEFT JOIN prescription_treatments pt ON pt.row_id=ts.prescription_treatment_id
     WHERE ts.patient_id=$1 ORDER BY ts.session_date DESC, ts.start_time DESC NULLS LAST, ts.created_at DESC`, [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'treatment-sessions' });
  res.json(rows);
});

app.post('/api/patients/:id/treatment-sessions', auth, requirePerm('sessions.write'), patientLinks(pool, 'prescriptionTreatmentId'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  await checkPrescriptionLine(c, req.params.id, b.prescriptionTreatmentId, 'treatment');
  if (!['COMPLETED', 'PLANNED', 'CANCELLED'].includes(b.status || 'COMPLETED')) return res.status(400).json({ error: 'Invalid session status' });
  const r = await c.query(
    `INSERT INTO treatment_sessions(patient_id,prescription_treatment_id,session_date,start_time,end_time,practitioner_id,pre_assessment,procedure_notes,materials,tolerance,adverse_event,post_assessment,response,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [req.params.id, b.prescriptionTreatmentId || null, b.sessionDate || new Date().toISOString().slice(0, 10), b.startTime || null, b.endTime || null, req.auth.user_id, b.preAssessment || null, b.procedureNotes || null, b.materials || null, b.tolerance || null, b.adverseEvent || null, b.postAssessment || null, b.response || null, b.status || 'COMPLETED']
  );
  await audit(req, 'CREATE_TREATMENT_SESSION', 'treatment_sessions', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/administrations', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ma.*, u.display_name AS administered_by_name, pm.medicine_name FROM medication_administration ma
     LEFT JOIN users u ON u.user_id=ma.administered_by LEFT JOIN prescription_medicines pm ON pm.row_id=ma.prescription_medicine_id
     WHERE ma.patient_id=$1 ORDER BY COALESCE(ma.administered_at,ma.scheduled_at) DESC`, [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'administrations' });
  res.json(rows);
});

app.post('/api/patients/:id/administrations', auth, requirePerm('chart.write'), patientLinks(pool, 'prescriptionMedicineId'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  await checkPrescriptionLine(c, req.params.id, b.prescriptionMedicineId, 'medicine');
  if (b.status !== undefined && !['GIVEN', 'REFUSED', 'HELD', 'NOT_GIVEN'].includes(b.status)) return res.status(400).json({ error: 'Invalid administration status' });
  const r = await c.query(
    `INSERT INTO medication_administration(prescription_medicine_id,patient_id,scheduled_at,administered_at,dose,route,administered_by,status,response,adverse_event,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [b.prescriptionMedicineId || null, req.params.id, b.scheduledAt || null, b.administeredAt || new Date(), b.dose || null, b.route || null, req.auth.user_id, b.status || 'GIVEN', b.response || null, b.adverseEvent || null, b.notes || null]
  );
  await audit(req, 'CREATE_MEDICATION_ADMINISTRATION', 'medication_administration', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/patients/:id/discharge', auth, requirePerm('clinical.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM discharge_summaries WHERE patient_id=$1 ORDER BY created_at DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'discharge' });
  res.json(rows);
});

app.post('/api/patients/:id/discharge', auth, requirePerm('discharge.write'), patientLinks(pool, 'encounterId'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  b.encounterId = await visitForWrite(c, req.params.id, b.encounterId);
  const r = await c.query(
    `INSERT INTO discharge_summaries(patient_id,encounter_id,author_id,authored_by,admission_summary,diagnoses,procedures_data,medicines,treatment_course,condition_at_discharge,followup_plan,warnings,signed_at) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) RETURNING *`,
    [req.params.id, b.encounterId || null, req.auth.user_id, b.admissionSummary || null, J(b.diagnoses ?? []), J(b.procedures ?? []), J(b.medicines ?? []), b.treatmentCourse || null, b.conditionAtDischarge || null, b.followupPlan || null, b.warnings || null]
  );
  await audit(req, 'CREATE_DISCHARGE', 'discharge_summaries', r.rows[0].discharge_id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

// Price list for the invoice pick-lists: treatments (consultations included) at their fixed rate, and medicines at their
// selling price (one entry per medicine; the newest priced batch wins). Read-only, for whoever writes invoices.
app.get('/api/billing/catalog', auth, requirePerm('billing.write'), async (_req, res) => {
  const t = await pool.query('SELECT name, category, rate FROM treatment_master WHERE active ORDER BY name');
  const m = await pool.query(
    `SELECT DISTINCT ON (lower(medicine_name)) medicine_name AS name, sale_price AS rate FROM pharmacy_stock
     WHERE active ORDER BY lower(medicine_name), (sale_price IS NULL), updated_at DESC`);
  res.json({ treatments: t.rows, medicines: m.rows });
});

// What this patient received since their last invoice, so it can be added to a new invoice in one step:
// medicines handed over at the pharmacy and completed therapy sessions, each with its current rate.
app.get('/api/patients/:id/billable', auth, requirePerm('billing.write'), async (req, res) => {
  const last = await pool.query(`SELECT max(created_at) AS at FROM billing_accounts WHERE patient_id=$1 AND status<>'VOID'`, [req.params.id]);
  const since = last.rows[0].at ?? new Date(0);
  const meds = await pool.query(
    `SELECT pm.medicine_name AS name, sum(di.quantity) AS quantity,
            (SELECT s2.sale_price FROM pharmacy_stock s2 WHERE lower(s2.medicine_name)=lower(pm.medicine_name) AND s2.sale_price IS NOT NULL ORDER BY s2.updated_at DESC LIMIT 1) AS rate
     FROM dispensing_items di JOIN prescriptions r ON r.prescription_id=di.prescription_id
     JOIN prescription_medicines pm ON pm.row_id=di.prescription_medicine_id
     WHERE r.patient_id=$1 AND di.created_at>$2 GROUP BY pm.medicine_name ORDER BY pm.medicine_name`, [req.params.id, since]);
  const sessions = await pool.query(
    `SELECT COALESCE(pt.treatment_name, 'Therapy session') AS name, count(*) AS quantity, tm.category, tm.rate
     FROM treatment_sessions ts LEFT JOIN prescription_treatments pt ON pt.row_id=ts.prescription_treatment_id
     LEFT JOIN treatment_master tm ON lower(tm.name)=lower(pt.treatment_name) AND tm.active
     WHERE ts.patient_id=$1 AND ts.created_at>$2 AND upper(COALESCE(ts.status,'COMPLETED'))='COMPLETED'
     GROUP BY 1, tm.category, tm.rate ORDER BY 1`, [req.params.id, since]);
  res.json({ since: last.rows[0].at, medicines: meds.rows, sessions: sessions.rows });
});

app.get('/api/patients/:id/billing', auth, requirePerm('billing.read'), async (req, res) => {
  const a = await pool.query('SELECT * FROM billing_accounts WHERE patient_id=$1 ORDER BY account_date DESC', [req.params.id]);
  const items = await pool.query(`SELECT bi.* FROM billing_items bi JOIN billing_accounts ba ON ba.id=bi.account_id WHERE ba.patient_id=$1 ORDER BY bi.created_at DESC`, [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'billing' });
  res.json({ accounts: a.rows, items: items.rows });
});

app.post('/api/patients/:id/billing', auth, requirePerm('billing.write'), async (req, res) => {
  const b = req.body || {}, c = await pool.connect();
  try {
    await c.query('BEGIN');
    const inv = 'INV-' + Date.now() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length || items.some(i => !hasText(i?.description) || !finiteNumber(i.quantity) || Number(i.quantity) <= 0 || !finiteNumber(i.unitPrice) || Number(i.unitPrice) < 0))
      { await c.query('ROLLBACK'); return res.status(400).json({ error: 'Each invoice line needs a description and a positive quantity and non-negative price' }); }
    if (!nonNeg(b.discount) || !nonNeg(b.tax)) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'Discount and tax cannot be negative' }); }
    const total = items.reduce((x, i) => x + Number(i.quantity) * Number(i.unitPrice || 0), 0);
    if (Number(b.discount || 0) > total + Number(b.tax || 0)) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'Discount cannot exceed the invoice amount' }); }
    const a = await c.query(
      `INSERT INTO billing_accounts(patient_id,payer_type,invoice_number,status,subtotal,discount,tax,total,notes,created_by) VALUES($1,$2,$3,'OPEN',$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, b.payerType || 'SELF-PAY', inv, total, Number(b.discount || 0), Number(b.tax || 0), total - Number(b.discount || 0) + Number(b.tax || 0), b.notes || null, req.auth.user_id]
    );
    for (const i of items) {
      await c.query(
        `INSERT INTO billing_items(account_id,description,category,quantity,unit_price,amount) VALUES($1,$2,$3,$4,$5,$6)`,
        [a.rows[0].id, i.description, i.category || null, Number(i.quantity), Number(i.unitPrice || 0), Number(i.quantity) * Number(i.unitPrice || 0)]
      );
    }
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'CREATE_INVOICE', tableName: 'billing_accounts', recordId: a.rows[0].id, req, details: { invoice: inv, total: a.rows[0].total } });
    await c.query('COMMIT');
    res.status(201).json(a.rows[0]);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Invoice failed:', e.message);
    res.status(e.code === '23503' ? 404 : 400).json({ error: e.code === '23503' ? 'Patient not found' : 'Invoice could not be saved' });
  } finally {
    c.release();
  }
});

// All invoices across patients (with totals) for Finance and Management; ?status=OPEN|PAID|VOID, ?q= invoice no., patient name or UHID.
app.get('/api/billing/invoices', auth, requirePerm('billing.read'), async (req, res) => {
  const status = ['OPEN', 'PAID', 'VOID'].includes(req.query.status) ? req.query.status : '';
  const q = String(req.query.q || '').trim().slice(0, 100);
  const [list, sum] = await Promise.all([
    pool.query(
      `SELECT ba.id, ba.invoice_number, ba.account_date, ba.status, ba.total, ba.payer_type, p.patient_id, p.name, p.uhid
       FROM billing_accounts ba JOIN patients p ON p.patient_id=ba.patient_id
       WHERE ($1='' OR ba.status=$1) AND ($2='' OR ba.invoice_number ILIKE $3 OR p.name ILIKE $3 OR p.uhid ILIKE $3)
       ORDER BY ba.created_at DESC LIMIT 200`, [status, q, `%${q.replace(/[\\%_]/g, '\\$&')}%`]),
    pool.query(
      `SELECT count(*) FILTER (WHERE status='OPEN')::int AS open_count,
              COALESCE(sum(total) FILTER (WHERE status='OPEN'),0) AS open_total,
              COALESCE(sum(total) FILTER (WHERE status<>'VOID' AND date_trunc('month',account_date)=date_trunc('month',CURRENT_DATE)),0) AS invoiced_month,
              COALESCE(sum(total) FILTER (WHERE status='PAID' AND date_trunc('month',account_date)=date_trunc('month',CURRENT_DATE)),0) AS paid_month
       FROM billing_accounts`),
  ]);
  res.json({ summary: sum.rows[0], invoices: list.rows });
});

app.put('/api/billing/:id', auth, requirePerm('billing.write'), transactional(pool, async (req, res, c) => {
  const { status } = req.body || {};
  if (!['OPEN', 'PAID', 'VOID'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { rows } = await c.query('UPDATE billing_accounts SET status=$1 WHERE id=$2 RETURNING id,patient_id,invoice_number,status', [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  await audit(req, 'UPDATE_INVOICE_STATUS', 'billing_accounts', rows[0].id, rows[0].patient_id, { status, invoice: rows[0].invoice_number });
  res.json(rows[0]);
}));

app.get('/api/patients/:id/documents', auth, requirePerm('documents.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT id,patient_id,document_type,file_name,mime_type,uploaded_by,uploaded_at FROM documents WHERE patient_id=$1 ORDER BY uploaded_at DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'documents' });
  res.json(rows);
});

app.post('/api/patients/:id/documents', auth, requirePerm('documents.write'), upload.single('file'), transactional(pool, async (req, res, c) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  req.onRollback = () => fs.promises.unlink(req.file.path).catch(() => {});
  const mimeType = await validateUpload(req.file);
  let r;
  try {
    r = await c.query(
      `INSERT INTO documents(patient_id,document_type,file_name,storage_key,mime_type,uploaded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,patient_id,document_type,file_name,mime_type,uploaded_at`,
      [req.params.id, req.body.documentType || 'OTHER', req.file.originalname, req.file.filename, mimeType, req.auth.user_id]
    );
  } catch (e) {
    fs.unlink(req.file.path, () => {}); // don't leave an orphan file when the record could not be saved
    throw e;
  }
  await audit(req, 'UPLOAD_DOCUMENT', 'documents', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/documents/:id/download', auth, requirePerm('documents.read'), async (req, res) => {
  const r = await pool.query('SELECT * FROM documents WHERE id=$1', [req.params.id]);
  if (!r.rows[0]) return res.status(404).end();
  const f = path.join(STORAGE_DIR, r.rows[0].storage_key);
  if (!fs.existsSync(f)) return res.status(404).end();
  await audit(req, 'DOWNLOAD_DOCUMENT', 'documents', req.params.id, r.rows[0].patient_id);
  res.setHeader('Content-Disposition', `attachment; filename="${r.rows[0].file_name.replace(/[^\w. -]/g, '_')}"`);
  res.setHeader('Content-Type', r.rows[0].mime_type || 'application/octet-stream');
  res.sendFile(f);
});

app.get('/api/patients/:id/contacts', auth, requirePerm('contacts.read'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM patient_contacts WHERE patient_id=$1 ORDER BY contact_date DESC', [req.params.id]);
  await audit(req, 'VIEW_PATIENT_MODULE', 'patients', req.params.id, req.params.id, { module: 'contacts' });
  res.json(rows);
});

app.post('/api/patients/:id/contacts', auth, requirePerm('contacts.write'), transactional(pool, async (req, res, c) => {
  const b = req.body || {};
  const r = await c.query(
    `INSERT INTO patient_contacts(patient_id,contact_type,subject,notes,outcome,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, b.type || 'TELEPHONE', b.subject || null, b.notes || null, b.outcome || null, req.auth.user_id]
  );
  await audit(req, 'CREATE_CONTACT', 'patient_contacts', r.rows[0].id, req.params.id);
  res.status(201).json(r.rows[0]);
}));

app.get('/healthz', async (_req, res) => {
  try { await pool.query('SELECT 1'); await fs.promises.access(STORAGE_DIR, fs.constants.R_OK | fs.constants.W_OK); res.send('ok'); }
  catch { res.status(503).send('unavailable'); }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler: map database/body-parsing errors to client errors, never leak internals.
app.use((err, req, res, _next) => {
  const PG = { '23503': [404, 'Referenced record not found'], '23505': [409, 'That record already exists'], '23502': [400, 'A required field is missing'],
    '22P02': [400, 'A value has the wrong format'], '22007': [400, 'A date or time has the wrong format'], '22008': [400, 'A date or time has the wrong format'],
    '22003': [400, 'A number is out of range'], '23514': [400, 'A value is not allowed'], '22001': [400, 'A value is too long'] };
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File is larger than ${MAX_UPLOAD_MB} MB` });
  if (err.name === 'MulterError') return res.status(400).json({ error: 'Upload failed' });
  if (PG[err.code]) return res.status(PG[err.code][0]).json({ error: PG[err.code][1] });
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(`${req.method} ${req.originalUrl}:`, err);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.type === 'entity.parse.failed' ? 'Malformed JSON' : err.message });
});

const server = app.listen(PORT, () => console.log(`AYUSH EPR API listening on port ${PORT}${IS_PROD ? '' : ' (development mode)'}`));

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal} received: shutting down`);
  server.close();
  setTimeout(() => process.exit(1), 10e3).unref();
  await closeDatabase();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
