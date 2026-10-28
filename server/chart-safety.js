import { requirePerm } from './permissions.js';
import { transactional } from './transaction.js';
import { hasText } from './validation.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

// The patient lock serializes visit closure with chart writes. Call inside the write transaction.
export async function visitForWrite(c, patientId, requested) {
  const patient = await c.query('SELECT patient_id FROM patients WHERE patient_id=$1 FOR UPDATE', [patientId]);
  if (!patient.rowCount) fail(404, 'Patient not found');
  if (requested) {
    const r = await c.query('SELECT * FROM encounters WHERE patient_id=$1 AND encounter_id=$2', [patientId, requested]);
    if (!r.rowCount) fail(404, 'Visit not found for this patient');
    if (r.rows[0].status !== 'OPEN') fail(409, 'This visit is closed. Start a new visit before adding records.');
    return requested;
  }
  const r = await c.query("SELECT encounter_id FROM encounters WHERE patient_id=$1 AND status='OPEN' ORDER BY started_at DESC", [patientId]);
  if (r.rowCount > 1) fail(409, 'Multiple open visits exist. Close the older visits first.');
  return r.rows[0]?.encounter_id ?? null;
}

export async function checkPrescriptionLine(c, patientId, id, kind) {
  if (!id) return;
  const table = kind === 'medicine' ? 'prescription_medicines' : 'prescription_treatments';
  const r = await c.query(`SELECT p.status FROM ${table} l JOIN prescriptions p USING(prescription_id)
    WHERE l.row_id=$1 AND p.patient_id=$2 FOR SHARE OF p`, [id, patientId]);
  if (!r.rowCount) fail(404, 'Prescription line not found for this patient');
  if (r.rows[0].status === 'CANCELLED') fail(409, 'This prescription is cancelled. Review the current prescription before recording care.');
}

export function registerChartSafety({ app, pool, auth, audit }) {
  const change = async (req, c, resource, before, after) => {
    await c.query(`INSERT INTO chart_changes(patient_id,resource,record_id,before_data,after_data,reason,changed_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [req.params.id, resource, before.id ?? before.patient_id,
      JSON.stringify(before), JSON.stringify(after), req.body.reason.trim(), req.auth.user_id]);
    await audit(req, 'CORRECT_CHART', resource, before.id ?? before.patient_id, req.params.id, { reason: req.body.reason.trim() });
  };
  const reason = (req, res, next) => hasText(req.body?.reason) && req.body.reason.trim().length >= 5
    ? next() : res.status(400).json({ error: 'A reason of at least 5 characters is required' });

  app.patch('/api/patients/:id', auth, requirePerm('patients.register'), reason, transactional(pool, async (req, res, c) => {
    const before = (await c.query('SELECT * FROM patients WHERE patient_id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!before) return res.status(404).json({ error: 'Patient not found' });
    if (!req.body.expected || ['name','dob','sex','phone','email','address'].some(k => req.body.expected[k] !== before[k]))
      return res.status(409).json({ error: 'Patient details changed. Reload and review before correcting.' });
    const b = req.body;
    if (!hasText(b.name)) return res.status(400).json({ error: 'Name is required' });
    if (b.dob && (!/^\d{4}-\d{2}-\d{2}$/.test(b.dob) || b.dob > new Date().toISOString().slice(0,10))) return res.status(400).json({ error: 'Date of birth must be a valid date in the past or today' });
    for (const key of ['name','dob','sex','phone','email','address']) if (b[key] !== null && typeof b[key] !== 'string') return res.status(400).json({ error: `Invalid ${key}` });
    const after = (await c.query(`UPDATE patients SET name=$2,dob=$3,sex=$4,phone=$5,email=$6,address=$7 WHERE patient_id=$1 RETURNING *`,
      [req.params.id,b.name.trim(),b.dob || null,b.sex || null,b.phone || null,b.email || null,b.address || null])).rows[0];
    await change(req, c, 'patients', before, after);
    res.json(after);
  }));

  for (const [resource, table, permission, statuses] of [
    ['problems', 'patient_problems', 'chart.write', ['ACTIVE','RESOLVED','HISTORICAL','ENTERED_IN_ERROR']],
    ['allergies', 'allergies', 'allergies.write', ['ACTIVE','RESOLVED','ENTERED_IN_ERROR']],
  ]) {
    app.patch(`/api/patients/:id/${resource}/:recordId`, auth, requirePerm(permission), reason, transactional(pool, async (req, res, c) => {
      const before = (await c.query(`SELECT * FROM ${table} WHERE patient_id=$1 AND id=$2 FOR UPDATE`, [req.params.id, req.params.recordId])).rows[0];
      if (!before) return res.status(404).json({ error: 'Record not found for this patient' });
      if (!statuses.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
      if ((before.status || 'ACTIVE') !== req.body.expectedStatus) return res.status(409).json({ error: 'Record changed. Reload before correcting.' });
      if ((before.status || 'ACTIVE') === req.body.status) return res.status(400).json({ error: 'Choose a different status' });
      const after = (await c.query(`UPDATE ${table} SET status=$3 WHERE patient_id=$1 AND id=$2 RETURNING *`, [req.params.id,req.params.recordId,req.body.status])).rows[0];
      await change(req, c, table, before, after);
      res.json(after);
    }));
  }
  app.get('/api/patients/:id/corrections', auth, requirePerm('patients.view'), async (req, res) => {
    const resources = [];
    if (req.auth.permissions.includes('patients.register')) resources.push('patients');
    if (req.auth.permissions.includes('clinical.read')) resources.push('patient_problems');
    if (req.auth.permissions.includes('allergies.read')) resources.push('allergies');
    const r = await pool.query(`SELECT c.*, u.display_name AS author_name FROM chart_changes c JOIN users u ON u.user_id=c.changed_by
      WHERE c.patient_id=$1 AND c.resource=ANY($2) ORDER BY c.changed_at DESC`, [req.params.id,resources]);
    await audit(req, 'VIEW_CORRECTIONS', 'patients', req.params.id, req.params.id);
    res.json(r.rows);
  });

  app.get('/api/patients/:id/encounters', auth, requirePerm('clinical.read'), async (req, res) => {
    const r = await pool.query('SELECT e.*,u.display_name AS provider_name FROM encounters e LEFT JOIN users u ON u.user_id=e.provider_user WHERE patient_id=$1 ORDER BY started_at DESC', [req.params.id]);
    await audit(req, 'VIEW_ENCOUNTERS', 'patients', req.params.id, req.params.id);
    res.json(r.rows);
  });
  app.post('/api/patients/:id/encounters', auth, requirePerm('chart.write'), transactional(pool, async (req, res, c) => {
    if (!['OPD','IPD','FOLLOWUP','THERAPY'].includes(req.body?.type)) return res.status(400).json({ error: 'Choose a visit type' });
    if (await visitForWrite(c, req.params.id)) return res.status(409).json({ error: 'Close the current visit before starting another' });
    const r = await c.query('INSERT INTO encounters(patient_id,encounter_type,provider_user) VALUES($1,$2,$3) RETURNING *', [req.params.id,req.body.type,req.auth.user_id]);
    await audit(req, 'START_VISIT', 'encounters', r.rows[0].encounter_id, req.params.id);
    res.status(201).json(r.rows[0]);
  }));
  app.post('/api/patients/:id/encounters/:recordId/close', auth, requirePerm('chart.write'), transactional(pool, async (req, res, c) => {
    await c.query('SELECT patient_id FROM patients WHERE patient_id=$1 FOR UPDATE', [req.params.id]);
    const r = await c.query("UPDATE encounters SET status='CLOSED',ended_at=now() WHERE patient_id=$1 AND encounter_id=$2 AND status='OPEN' RETURNING *", [req.params.id,req.params.recordId]);
    if (!r.rowCount) return res.status(409).json({ error: 'Open visit not found for this patient' });
    await audit(req, 'CLOSE_VISIT', 'encounters', r.rows[0].encounter_id, req.params.id);
    res.json(r.rows[0]);
  }));
  app.post('/api/patients/:id/prescriptions/:recordId/cancel', auth, requirePerm('prescriptions.write'), reason, transactional(pool, async (req, res, c) => {
    const before = (await c.query('SELECT * FROM prescriptions WHERE patient_id=$1 AND prescription_id=$2 FOR UPDATE', [req.params.id,req.params.recordId])).rows[0];
    if (!before) return res.status(404).json({ error: 'Prescription not found for this patient' });
    if (before.status !== 'ISSUED') return res.status(409).json({ error: 'Only an undispensed prescription can be cancelled. Dispensed medicines need a clinician and pharmacist review.' });
    const after = (await c.query("UPDATE prescriptions SET status='CANCELLED',cancelled_at=now(),cancelled_by=$2,cancellation_reason=$3 WHERE prescription_id=$1 RETURNING *", [req.params.recordId,req.auth.user_id,req.body.reason.trim()])).rows[0];
    await audit(req, 'CANCEL_PRESCRIPTION', 'prescriptions', before.prescription_id, req.params.id, { reason: req.body.reason.trim() });
    res.json(after);
  }));
}
