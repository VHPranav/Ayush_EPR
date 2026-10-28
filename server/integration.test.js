import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, writeFile, appendFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { runMigrations } from './migrations.js';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('API integrity on an isolated PostgreSQL database', { timeout: 120000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ayush-regression-'));
  const dbPort = await freePort(), apiPort = await freePort();
  const database = new EmbeddedPostgres({ databaseDir: path.join(dir, 'pg'), port: dbPort,
    user: 'regression', password: 'isolated-test-password', persistent: true, onLog() {}, onError() {} });
  let child, pool, logs = '';
  try {
    await database.initialise();
    await database.start();
    await database.createDatabase('regression');
    const databaseUrl = `postgresql://regression:isolated-test-password@127.0.0.1:${dbPort}/regression`;
    pool = new pg.Pool({ connectionString: databaseUrl });
    child = spawn(process.execPath, ['server.js'], { cwd: import.meta.dirname,
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: databaseUrl, PORT: String(apiPort),
        PASSWORD_SALT: 'isolated-regression-salt-32-characters', ADMIN_USERNAME: 'regression',
        ADMIN_PASSWORD: 'Regression-Only-Password!', STORAGE_DIR: path.join(dir, 'documents') },
      stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => { logs += b; });
    child.stderr.on('data', b => { logs += b; });
    const base = `http://127.0.0.1:${apiPort}`;
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { ready = (await fetch(base + '/api/health')).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    let token;
    async function call(method, route, body) {
      const response = await fetch(base + route, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }
    const login = await call('POST', '/api/auth/login', { username: 'regression', password: 'Regression-Only-Password!' });
    assert.equal(login.status, 200);
    token = login.body.token;
    const a = (await call('POST', '/api/patients', { name: 'Patient A' })).body.patient_id;
    const b = (await call('POST', '/api/patients', { name: 'Patient B' })).body.patient_id;
    assert.ok(a && b);
    const rx = await call('POST', `/api/patients/${a}/prescriptions`, {
      medicines: [{ name: 'Test medicine', dose: '1 g', frequency: 'Once daily' }],
      treatments: [{ name: 'Test therapy', frequency: 'Once daily', duration: '7 days' }] });
    assert.equal(rx.status, 201);
    const medicine = (await pool.query('SELECT row_id FROM prescription_medicines WHERE prescription_id=$1', [rx.body.prescription_id])).rows[0].row_id;
    const treatment = (await pool.query('SELECT row_id FROM prescription_treatments WHERE prescription_id=$1', [rx.body.prescription_id])).rows[0].row_id;
    const encounter = (await pool.query("INSERT INTO encounters(patient_id,encounter_type) VALUES($1,'OPD') RETURNING encounter_id", [a])).rows[0].encounter_id;
    const record = (await call('POST', `/api/patients/${a}/clinical-records`, { section: 'TEST', payload: {} })).body.record_id;

    await t.test('prescription lines belong to the patient being treated', async () => {
      for (const [route, field, value, table] of [
        ['treatment-sessions', 'prescriptionTreatmentId', treatment, 'treatment_sessions'],
        ['administrations', 'prescriptionMedicineId', medicine, 'medication_administration'],
      ]) {
        assert.equal((await call('POST', `/api/patients/${b}/${route}`, { [field]: value })).status, 404);
        assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE patient_id=$1`, [b])).rows[0].n, 0);
        assert.equal((await call('POST', `/api/patients/${a}/${route}`, { [field]: value })).status, 201);
        assert.equal((await call('POST', `/api/patients/${a}/${route}`, { [field]: 'invalid' })).status, 400);
      }
    });
    await t.test('encounters and amendments cannot cross patient charts', async () => {
      for (const route of ['clinical-records', 'outcomes', 'investigations', 'exams', 'referrals', 'care-plans', 'discharge']) {
        const result = await call('POST', `/api/patients/${b}/${route}`, { encounterId: encounter, section: 'TEST', payload: {}, domain: 'Pain', testName: 'CBC', referredTo: 'Specialist' });
        assert.equal(result.status, 404, route);
      }
      assert.equal((await call('POST', `/api/patients/${b}/clinical-records`, { section: 'TEST', payload: {}, amendedFrom: record })).status, 404);
      assert.equal((await call('POST', `/api/patients/${a}/clinical-records`, { section: 'TEST', payload: {}, amendedFrom: record, amendmentReason: 'Corrected test entry', encounterId: encounter })).status, 201);
    });

    await t.test('every clinical module write records an audit event', async () => {
      const cases = [
        ['medication-reconciliation', { medicineName: 'Reconciled medicine' }, 'RECONCILE_MEDICATION'],
        ['outcomes', { domain: 'Pain', score: 2 }, 'CREATE_OUTCOME'],
        ['investigations', { testName: 'CBC' }, 'CREATE_INVESTIGATION'],
        ['exams', { findings: { observation: 'normal' } }, 'CREATE_EXAM'],
        ['referrals', { referredTo: 'Specialist' }, 'CREATE_REFERRAL'],
        ['care-plans', { goals: ['Recovery'] }, 'CREATE_CARE_PLAN'],
        ['treatment-sessions', { prescriptionTreatmentId: treatment }, 'CREATE_TREATMENT_SESSION'],
        ['administrations', { prescriptionMedicineId: medicine }, 'CREATE_MEDICATION_ADMINISTRATION'],
        ['contacts', { subject: 'Follow-up call' }, 'CREATE_CONTACT'],
      ];
      for (const [route, body, action] of cases) {
        const result = await call('POST', `/api/patients/${a}/${route}`, body);
        assert.equal(result.status, 201, route + JSON.stringify(result.body));
        const audit = (await pool.query('SELECT details,user_id,session_id FROM audit_log WHERE action=$1 AND record_id=$2', [action, result.body.id])).rows;
        assert.equal(audit.length, 1, route);
        assert.equal(audit[0].details.patientId, a);
        assert.ok(audit[0].user_id && audit[0].session_id);
      }
    });
    await t.test('audit failure rolls back the clinical write', async () => {
      await pool.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;
        CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`);
      try {
        const result = await call('POST', `/api/patients/${a}/investigations`, { testName: 'Must roll back' });
        assert.equal(result.status, 500);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM investigations WHERE test_name='Must roll back'")).rows[0].n, 0);
        const registration = await call('POST', '/api/patients', { name: 'Must roll back' });
        assert.equal(registration.status, 400);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM patients WHERE name='Must roll back'")).rows[0].n, 0);
      } finally { await pool.query('DROP TRIGGER reject_test_audit ON audit_log; DROP FUNCTION reject_test_audit()'); }
    });
    await t.test('failed logins remain audited', async () => {
      assert.equal((await call('POST', '/api/auth/login', { username: 'regression', password: 'wrong' })).status, 401);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='LOGIN_FAILURE'")).rows[0].n, 1);
    });
    await t.test('clinical zero scores and default assessment dates are preserved', async () => {
      for (const score of [0, '0', -2, '']) {
        const result = await call('POST', `/api/patients/${a}/outcomes`, { domain: 'Test scale', score });
        assert.equal(result.status, 201);
        assert.equal(result.body.score, score === '' ? null : String(Number(score)));
        assert.ok(result.body.assessment_date);
      }
      for (const score of [true, [], {}, 'NaN', 'Infinity', ' '])
        assert.equal((await call('POST', `/api/patients/${a}/outcomes`, { domain: 'Test', score })).status, 400);
    });
    await t.test('backend rejects incomplete prescriptions and invalid invoice amounts', async () => {
      for (const body of [
        { medicines: [{ name: 'Missing dose' }] }, { medicines: {} },
        { medicines: [null] }, { treatments: [{ name: 'Missing schedule' }] },
        { medicines: [{ name: 'Valid', dose: '1 g', frequency: 'Once daily' }], status: 'DISPENSED' },
      ]) assert.equal((await call('POST', `/api/patients/${a}/prescriptions`, body)).status, 400);
      for (const quantity of [0, '0', -1, true, [], {}, '', null])
        assert.equal((await call('POST', `/api/patients/${a}/billing`, { items: [{ description: 'Consult', quantity, unitPrice: 5 }] })).status, 400);
      const free = await call('POST', `/api/patients/${a}/billing`, { items: [{ description: 'Free consult', quantity: 1, unitPrice: 0 }] });
      assert.equal(free.status, 201);
      assert.equal(Number(free.body.total), 0);
      assert.equal((await call('POST', `/api/patients/${a}/billing`, { items: [{ description: 'Consult', quantity: 1, unitPrice: 5 }], discount: 6 })).status, 400);
    });
    await t.test('new clinical notes appear once and legacy notes remain visible', async () => {
      const note = await call('POST', `/api/patients/${a}/clinical-records`, { section: 'NOTE', payload: { type: 'SOAP', text: 'Single canonical note' } });
      assert.equal(note.status, 201);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM clinical_notes WHERE patient_id=$1', [a])).rows[0].n, 0);
      await pool.query("INSERT INTO clinical_notes(patient_id,note_type,note_text) VALUES($1,'LEGACY','Legacy note')", [a]);
      const timeline = await call('GET', `/api/patients/${a}/timeline`);
      assert.equal(timeline.body.filter(e => e.detail === 'Single canonical note').length, 1);
      assert.equal(timeline.body.filter(e => e.detail === 'Legacy note').length, 1);
    });
    await t.test('migrations are repeatable, detect modified history, and roll back failed upgrades', async () => {
      await runMigrations(pool);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 3);
      const migrationsDir = path.join(dir, 'migrations');
      await cp(new URL('./migrations/', import.meta.url), migrationsDir, { recursive: true });
      const url = pathToFileURL(migrationsDir + '/');
      await writeFile(path.join(migrationsDir, '004_failure.sql'), 'CREATE TABLE must_rollback(id integer); SELECT nonexistent_column;');
      await assert.rejects(runMigrations(pool, url), /nonexistent_column/);
      assert.equal((await pool.query("SELECT to_regclass('must_rollback') AS relation")).rows[0].relation, null);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 3);
      await appendFile(path.join(migrationsDir, '001_appointment_duration.sql'), '\n-- changed applied migration');
      await assert.rejects(runMigrations(pool, url), /Applied migration was modified/);
    });
    await t.test('a pre-migration database upgrades without changing its patient records', async () => {
      await database.createDatabase('legacy');
      const legacyUrl = new URL(databaseUrl);
      legacyUrl.pathname = '/legacy';
      const legacy = new pg.Pool({ connectionString: legacyUrl.toString() });
      try {
        await legacy.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
        const patient = (await legacy.query("INSERT INTO patients(name) VALUES('Existing patient') RETURNING patient_id,uhid")).rows[0];
        await legacy.query('ALTER TABLE appointments DROP COLUMN duration_minutes');
        await runMigrations(legacy);
        const preserved = (await legacy.query('SELECT patient_id,uhid FROM patients')).rows;
        assert.deepEqual(preserved, [patient]);
        assert.equal((await legacy.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='appointments' AND column_name='duration_minutes'")).rows[0].n, 1);
        assert.equal((await legacy.query('SELECT count(*)::int AS n FROM dispensing_items')).rows[0].n, 0);
      } finally { await legacy.end(); }
    });
    await t.test('dispensing validates batches, deducts stock, and cannot dispense twice', async () => {
      const stock = await call('POST', '/api/pharmacy/stock', { medicineName: 'Test medicine', quantity: 10, unit: 'g', batchNo: 'REG-1', expiryDate: '2099-12-31' });
      assert.equal(stock.status, 201);
      const expired = await call('POST', '/api/pharmacy/stock', { medicineName: 'Test medicine', quantity: 10, expiryDate: '2000-01-01' });
      const wrong = await call('POST', '/api/pharmacy/stock', { medicineName: 'Different medicine', quantity: 10 });
      const route = `/api/prescriptions/${rx.body.prescription_id}/dispense`;
      const allocation = { prescriptionMedicineId: medicine, stockId: stock.body.stock_id, quantity: 2.5 };
      assert.equal((await call('POST', route, {})).status, 400);
      for (const [extra, status] of [
        [{ quantity: 0 }, 400], [{ quantity: 11 }, 409], [{ quantity: 'NaN' }, 400], [{ quantity: 0.0001 }, 400],
        [{ stockId: expired.body.stock_id }, 409], [{ stockId: wrong.body.stock_id }, 400],
        [{ prescriptionMedicineId: record }, 400],
      ]) assert.equal((await call('POST', route, { items: [{ ...allocation, ...extra }] })).status, status, JSON.stringify(extra));
      assert.equal((await pool.query('SELECT quantity FROM pharmacy_stock WHERE stock_id=$1', [stock.body.stock_id])).rows[0].quantity, '10');
      const results = await Promise.all([call('POST', route, { items: [allocation] }), call('POST', route, { items: [allocation] })]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal(Number((await pool.query('SELECT quantity FROM pharmacy_stock WHERE stock_id=$1', [stock.body.stock_id])).rows[0].quantity), 7.5);
      assert.equal((await pool.query('SELECT quantity FROM dispensing_items WHERE prescription_id=$1', [rx.body.prescription_id])).rows.length, 1);
    });
    await t.test('concurrent prescriptions cannot oversell a shared batch', async () => {
      const batch = await call('POST', '/api/pharmacy/stock', { medicineName: 'Limited medicine', quantity: 3 });
      async function prepare() {
        const r = await call('POST', `/api/patients/${a}/prescriptions`, { medicines: [{ name: 'Limited medicine', dose: '1 g', frequency: 'Once daily' }] });
        const m = (await pool.query('SELECT row_id FROM prescription_medicines WHERE prescription_id=$1', [r.body.prescription_id])).rows[0].row_id;
        return { id: r.body.prescription_id, medicineId: m };
      }
      const prescriptions = [await prepare(), await prepare()];
      const results = await Promise.all(prescriptions.map(r => call('POST', `/api/prescriptions/${r.id}/dispense`, {
        items: [{ prescriptionMedicineId: r.medicineId, stockId: batch.body.stock_id, quantity: 2 }],
      })));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal(Number((await pool.query('SELECT quantity FROM pharmacy_stock WHERE stock_id=$1', [batch.body.stock_id])).rows[0].quantity), 1);
    });
    await t.test('audit failure rolls back dispensing stock, ledger and status together', async () => {
      const batch = await call('POST', '/api/pharmacy/stock', { medicineName: 'Rollback medicine', quantity: 3 });
      const r = await call('POST', `/api/patients/${a}/prescriptions`, { medicines: [{ name: 'Rollback medicine', dose: '1 g', frequency: 'Once daily' }] });
      const m = (await pool.query('SELECT row_id FROM prescription_medicines WHERE prescription_id=$1', [r.body.prescription_id])).rows[0].row_id;
      await pool.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;
        CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`);
      try {
        assert.equal((await call('POST', `/api/prescriptions/${r.body.prescription_id}/dispense`, { items: [{ prescriptionMedicineId: m, stockId: batch.body.stock_id, quantity: 1 }] })).status, 500);
        assert.equal(Number((await pool.query('SELECT quantity FROM pharmacy_stock WHERE stock_id=$1', [batch.body.stock_id])).rows[0].quantity), 3);
        assert.equal((await pool.query('SELECT status FROM prescriptions WHERE prescription_id=$1', [r.body.prescription_id])).rows[0].status, 'ISSUED');
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM dispensing_items WHERE prescription_id=$1', [r.body.prescription_id])).rows[0].n, 0);
      } finally { await pool.query('DROP TRIGGER reject_test_audit ON audit_log; DROP FUNCTION reject_test_audit()'); }
    });
    await t.test('visit lifecycle links records and rejects closed/cross-patient visits', async () => {
      const patient = (await call('POST', '/api/patients', { name: 'Visit safety' })).body.patient_id;
      const starts = await Promise.all([1,2].map(() => call('POST', `/api/patients/${patient}/encounters`, { type: 'OPD' })));
      assert.deepEqual(starts.map(r => r.status).sort(), [201,409]);
      const visit = starts.find(r => r.status === 201).body.encounter_id;
      const note = await call('POST', `/api/patients/${patient}/clinical-records`, { section: 'NOTE', payload: { text: 'Visit note' } });
      assert.equal(note.body.encounter_id, visit);
      assert.ok(note.body.signed_at);
      const order = await call('POST', `/api/patients/${patient}/prescriptions`, { medicines: [{ name: 'Visit med', dose: '1 g', frequency: 'Daily' }] });
      assert.equal(order.body.encounter_id, visit);
      assert.equal((await call('POST', `/api/patients/${b}/encounters/${visit}/close`, {})).status,409);
      assert.equal((await call('POST', `/api/patients/${patient}/encounters/${visit}/close`, {})).status,200);
      assert.equal((await call('POST', `/api/patients/${patient}/clinical-records`, { section: 'NOTE', payload: { text: 'Late note' }, encounterId: visit })).status,409);
      const amend = await call('POST', `/api/patients/${patient}/clinical-records`, { section: 'NOTE', payload: { text: 'Corrected visit note' }, amendedFrom: note.body.record_id, amendmentReason: 'Corrected wording' });
      assert.equal(amend.status,201);
      assert.equal(amend.body.encounter_id,visit);
      assert.equal(amend.body.version,2);
      assert.equal((await call('POST', `/api/patients/${patient}/clinical-records`, { section: 'NOTE', payload: { text: 'Competing correction' }, amendedFrom: note.body.record_id, amendmentReason: 'Concurrent amendment' })).status,409);
      assert.equal((await pool.query('SELECT payload FROM clinical_records WHERE record_id=$1',[note.body.record_id])).rows[0].payload.text,'Visit note');
    });
    await t.test('demographic and allergy corrections retain originals and reject stale changes', async () => {
      const before = (await call('GET', `/api/patients/${b}`)).body;
      const fields = ['name','dob','sex','phone','email','address'];
      const expected = Object.fromEntries(fields.map(k => [k,before[k]]));
      const correction = { ...expected, name: 'Corrected Patient B', reason: 'Corrected registration typo', expected };
      assert.equal((await call('PATCH', `/api/patients/${b}`, { ...correction, reason: '' })).status,400);
      assert.equal((await call('PATCH', `/api/patients/${b}`, correction)).status,200);
      assert.equal((await call('PATCH', `/api/patients/${b}`, correction)).status,409);
      const history = (await call('GET', `/api/patients/${b}/corrections`)).body;
      assert.equal(history[0].before_data.name,before.name);
      assert.equal(history[0].after_data.name,'Corrected Patient B');
      assert.ok(history[0].changed_by);
      const allergy = (await call('POST', `/api/patients/${b}/allergies`, { allergen: 'Test allergen' })).body;
      const route = `/api/patients/${b}/allergies/${allergy.id}`;
      const body = { status: 'ENTERED_IN_ERROR', expectedStatus: 'ACTIVE', reason: 'Wrong allergen selected' };
      assert.equal((await call('PATCH', `/api/patients/${a}/allergies/${allergy.id}`, body)).status,404);
      assert.equal((await call('PATCH',route,body)).status,200);
      assert.equal((await call('PATCH',route,body)).status,409);
      assert.ok(!(await call('GET', `/api/patients/${b}`)).body.allergies.some(x => x.id === allergy.id));
      assert.equal((await pool.query('SELECT allergen FROM allergies WHERE id=$1',[allergy.id])).rows[0].allergen,'Test allergen');
      await pool.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;
        CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`);
      try {
        assert.equal((await call('PATCH',route,{ status:'ACTIVE',expectedStatus:'ENTERED_IN_ERROR',reason:'Restore verified allergy' })).status,500);
        assert.equal((await pool.query('SELECT status FROM allergies WHERE id=$1',[allergy.id])).rows[0].status,'ENTERED_IN_ERROR');
        assert.equal((await pool.query('SELECT count(*)::int n FROM chart_changes WHERE record_id=$1',[allergy.id])).rows[0].n,1);
        assert.equal((await call('GET',`/api/patients/${b}`)).status,500, 'No chart response when access audit fails');
      } finally { await pool.query('DROP TRIGGER reject_test_audit ON audit_log; DROP FUNCTION reject_test_audit()'); }
    });
    await t.test('cancellation removes prescriptions from queue and races safely with dispensing', async () => {
      const order = (await call('POST', `/api/patients/${b}/prescriptions`, { treatments: [{ name:'Test therapy',frequency:'Daily',duration:'1 day' }] })).body;
      const route = `/api/patients/${b}/prescriptions/${order.prescription_id}/cancel`;
      assert.equal((await call('POST',route,{ reason:'' })).status,400);
      assert.equal((await call('POST',`/api/patients/${a}/prescriptions/${order.prescription_id}/cancel`,{ reason:'Wrong patient attempt' })).status,404);
      const results = await Promise.all([call('POST',route,{reason:'Cancelled before treatment'}),call('POST',`/api/prescriptions/${order.prescription_id}/dispense`,{items:[]})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.ok(!(await call('GET','/api/pharmacy/queue')).body.some(r=>r.prescription_id===order.prescription_id));
      const state = (await pool.query('SELECT status,cancellation_reason FROM prescriptions WHERE prescription_id=$1',[order.prescription_id])).rows[0];
      if (state.status === 'CANCELLED') assert.equal(state.cancellation_reason,'Cancelled before treatment');
    });
    await t.test('document content validation rejects disguised files and removes failed uploads', async () => {
      const send = async (content, name, mime) => {
        const form = new FormData(); form.append('file',new Blob([content],{type:mime}),name);
        return fetch(base+`/api/patients/${b}/documents`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
      };
      const before = (await pool.query('SELECT count(*)::int n FROM documents')).rows[0].n;
      assert.equal((await send('<html>fake pdf</html>','fake.pdf','application/pdf')).status,400);
      assert.equal((await send('archive','file.docx','application/octet-stream')).status,400);
      assert.equal((await send('plain text','note.txt','application/x-msdownload')).status,201);
      assert.equal((await pool.query('SELECT count(*)::int n FROM documents')).rows[0].n,before+1);
      const doc = (await pool.query("SELECT * FROM documents WHERE file_name='note.txt'")).rows[0];
      assert.equal(doc.mime_type,'text/plain');
      assert.equal(await readFile(path.join(dir,'documents',doc.storage_key),'utf8'),'plain text');
      const files = await (await import('node:fs/promises')).readdir(path.join(dir,'documents'));
      assert.ok(!files.some(f=>f.endsWith('.pdf')));
      assert.equal((await fetch(base+'/healthz')).status,200);
    });
    await t.test('clinical originals and correction history reject SQL mutation or truncation', async () => {
      await assert.rejects(pool.query('UPDATE clinical_records SET payload=$1 WHERE record_id=$2',[JSON.stringify({text:'overwritten'}),record]), /append-only/);
      await assert.rejects(pool.query('DELETE FROM clinical_records WHERE record_id=$1',[record]), /append-only/);
      await assert.rejects(pool.query('TRUNCATE clinical_records CASCADE'), /append-only/);
      await assert.rejects(pool.query('UPDATE chart_changes SET reason=$1',['changed reason']), /append-only/);
      await assert.rejects(pool.query('TRUNCATE chart_changes'), /append-only/);
      await assert.rejects(pool.query('TRUNCATE audit_log'), /append-only/);
    });
    await t.test('all 15 roles pass the end-to-end permission smoke suite', async () => {
      const smoke = spawn(process.execPath, ['role-smoke.mjs'], { cwd: import.meta.dirname,
        env: { ...process.env, BASE_URL: base, SMOKE_ADMIN_USER: 'regression', SMOKE_ADMIN_PASSWORD: 'Regression-Only-Password!' },
        stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      smoke.stdout.on('data', b => { output += b; });
      smoke.stderr.on('data', b => { output += b; });
      const [code] = await once(smoke, 'exit');
      assert.equal(code, 0, output);
      t.diagnostic(output.trim().split('\n').at(-1));
    });
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    if (pool) await pool.end();
    await database.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
