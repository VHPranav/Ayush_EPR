// Patient intake form (SAGLASNOST): the bilingual English / Montenegrin form patients fill in on a tablet
// before seeing the doctor. One submission, in one transaction:
//   - creates the patient when they are new (or fills in empty demographics on an existing record),
//   - stores the answers as an append-only clinical record (section INTAKE_FORM),
//   - adds a patient-reported allergy and the weight as vitals when given,
//   - renders the signed form as a PDF and files it under the patient's documents (type CONSENT).
// The question labels below must match web/lib/intake-form.ts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { requirePerm } from './permissions.js';
import { transactional } from './transaction.js';
import { visitForWrite } from './chart-safety.js';

// Letterhead exactly as on the clinic's paper form.
export const CLINIC = {
  lines: ['DATATREYA INDJISKI TRETMAN CENTAR', 'DATHA AYURYOGA INTERNATIONAL HEALTH INSTUTUTE D.O.O.'],
  address: '109, NIKSICKI PUT, PODGORICA, MONTENEGRO',
  contact: 'tel: +38269330057 · email: dathahealthinstitute@gmail.com',
};

const YES_NO = ['YES', 'NO'];
// [key, English, Montenegrin, kind]. kind: text (one line), long (paragraph), yesno, date.
export const SECTIONS = [
  ['Personal details', 'Lični podaci', [
    ['name', 'Name', 'Ime i prezime', 'text'],
    ['dob', 'Date of birth', 'Datum rođenja', 'date'],
    ['phone', 'Phone no.', 'Broj telefona', 'text'],
    ['email', 'Email', 'Email', 'text'],
    ['address', 'Address', 'Adresa', 'text'],
    ['city', 'City', 'Grad', 'text'],
    ['weight', 'Weight (kg)', 'Kilaža (kg)', 'text'],
    ['referredBy', 'Referred by', 'Preporučeni od strane', 'text'],
  ]],
  ['Diagnosis and symptoms', 'Dijagnoza i simptomi', [
    ['diagnosis', 'Diagnosis', 'Dijagnoza', 'long'],
    ['symptoms', 'Symptoms', 'Simptomi', 'long'],
    ['additional', 'Additional symptoms or diagnosis', 'Dodatne tegobe ili dijagnoze', 'long'],
  ]],
  ['Medical history', 'Anamneza (istorija bolesti)', [
    ['history', 'Medical history', 'Anamneza', 'long'],
    ['surgeries', 'Surgeries', 'Operacije', 'long'],
    ['allergiesAny', 'Do you have any allergies?', 'Da li imate alergije?', 'yesno'],
    ['allergies', 'Allergies', 'Alergije', 'long'],
    ['hereditary', 'Hereditary diseases', 'Nasljedne bolesti', 'long'],
  ]],
  ['Habits', 'Navike', [
    ['smoking', 'Cigarette consumption', 'Konzumiranje cigareta', 'yesno'],
    ['smokingAmount', 'How much per day or month', 'Koliko dnevno ili mjesečno', 'text'],
    ['alcohol', 'Alcohol consumption', 'Konzumiranje alkohola', 'yesno'],
    ['alcoholAmount', 'How much per day or month', 'Koliko dnevno ili mjesečno', 'text'],
    ['drugs', 'Drug consumption', 'Konzumiranje droga', 'yesno'],
    ['drugsAmount', 'How much per day or month', 'Koliko dnevno ili mjesečno', 'text'],
    ['sleepHours', 'How many hours of sleep do you get?', 'Koliko sati sna imate?', 'text'],
    ['sleepInterrupted', 'Is your sleep interrupted?', 'Da li je san sa prekidima?', 'yesno'],
    ['bowelDaily', 'Do you have daily bowel movements?', 'Da li imate stolicu dnevno?', 'yesno'],
  ]],
  ['Therapies and supplements', 'Terapije i suplementacija', [
    ['therapies', 'Present therapies in use', 'Trenutne terapije koje koristite', 'long'],
    ['supplements', 'Supplements', 'Suplementacija', 'long'],
  ]],
];
const FIELDS = SECTIONS.flatMap(([, , f]) => f);
// An amount is only meaningful after a YES; it is dropped (and hidden on the PDF) otherwise.
const AMOUNT_OF = { smokingAmount: 'smoking', alcoholAmount: 'alcohol', drugsAmount: 'drugs', allergies: 'allergiesAny' };

const MAX_TEXT = 4000;
const MAX_SIGNATURE_BYTES = 600 * 1024;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

/** Validates and normalises the submitted answers: trimmed strings, known keys only. */
export function cleanAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'Form answers are required');
  const out = {};
  for (const [key, en, , kind] of FIELDS) {
    const v = raw[key];
    if (v === undefined || v === null || v === '') { out[key] = ''; continue; }
    if (typeof v !== 'string') fail(400, `${en}: invalid value`);
    const s = v.trim();
    if (s.length > MAX_TEXT) fail(400, `${en} is too long`);
    if (kind === 'yesno' && s && !YES_NO.includes(s)) fail(400, `${en}: answer Yes or No`);
    if (kind === 'date' && s) {
      const d = new Date(s + 'T00:00:00Z');
      if (!DATE_RE.test(s) || Number.isNaN(d.getTime()) || d > new Date() || d.getUTCFullYear() < 1900) fail(400, `${en}: choose a valid date`);
    }
    out[key] = s;
  }
  for (const [amount, toggle] of Object.entries(AMOUNT_OF)) if (out[toggle] !== 'YES') out[amount] = '';
  if (!out.name) fail(400, 'Name is required');
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) fail(400, 'Email: check the address');
  if (out.weight && !(Number(out.weight.replace(',', '.')) > 0 && Number(out.weight.replace(',', '.')) < 500)) fail(400, 'Weight: enter a number in kg');
  return out;
}

/** The signature arrives as a PNG data URL drawn on the tablet. */
export function signaturePng(dataUrl) {
  const m = typeof dataUrl === 'string' && /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) fail(400, 'Please sign the form');
  const png = Buffer.from(m[1], 'base64');
  if (png.length > MAX_SIGNATURE_BYTES) fail(400, 'The signature image is too large');
  if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) fail(400, 'Please sign the form');
  return png;
}

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
let fontBytes;
const fonts = () => (fontBytes ??= {
  regular: fs.readFileSync(path.join(FONT_DIR, 'NotoSans-Regular.ttf')),
  bold: fs.readFileSync(path.join(FONT_DIR, 'NotoSans-Bold.ttf')),
});

const fmtDay = iso => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}.`; };
const answerText = (kind, v) => kind === 'yesno' ? (v === 'YES' ? 'Yes / Da' : v === 'NO' ? 'No / Ne' : '—') : kind === 'date' && v ? fmtDay(v) : v || '—';

/** Renders the completed, signed form as an A4 PDF (bilingual labels, the patient's answers, signature and date). */
export async function renderIntakePdf({ answers, signature, uhid, submittedAt }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts().regular, { subset: false });
  const bold = await doc.embedFont(fonts().bold, { subset: false });
  const sig = await doc.embedPng(signature);
  doc.setTitle(`Saglasnost — ${answers.name}`);
  doc.setSubject('Patient intake form / Saglasnost');
  doc.setCreationDate(submittedAt);

  const W = 595.28, H = 841.89, M = 50, ink = rgb(0.1, 0.1, 0.13), muted = rgb(0.42, 0.42, 0.47), line = rgb(0.85, 0.85, 0.88);
  const day = submittedAt.toISOString().slice(0, 10);
  let page, y;

  const wrap = (text, font, size, width) => {
    const out = [];
    for (const para of String(text).split(/\r?\n/)) {
      let cur = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { cur = next; continue; }
        if (cur) out.push(cur);
        // A single word longer than the line is broken by characters.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          let n = w.length;
          while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
          out.push(w.slice(0, n));
          w = w.slice(n);
        }
        cur = w;
      }
      out.push(cur);
    }
    return out;
  };
  const centre = (text, font, size, color = ink) => {
    page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  };
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - 46;
    centre(CLINIC.lines[0], bold, 14); y -= 17;
    centre(CLINIC.lines[1], bold, 10.5); y -= 14;
    centre(CLINIC.address, regular, 8.5, muted); y -= 11;
    centre(CLINIC.contact, regular, 8.5, muted); y -= 10;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: line });
    y -= 22;
  };
  const ensure = h => { if (y - h < 70) newPage(); };

  newPage();
  centre('Patient intake form / Saglasnost', bold, 13); y -= 16;
  centre(`${answers.name}${uhid ? ` · ${uhid}` : ''} · ${fmtDay(day)}`, regular, 9.5, muted); y -= 24;

  const labelW = 190, valueX = M + labelW + 10, valueW = W - M - valueX;
  for (const [en, me, fields] of SECTIONS) {
    ensure(40);
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.91, 0.95, 0.93) });
    page.drawText(`${en} / ${me}`, { x: M + 8, y, size: 10.5, font: bold, color: rgb(0.09, 0.32, 0.24) });
    y -= 26;
    for (const [key, fen, fme, kind] of fields) {
      if (AMOUNT_OF[key] && answers[AMOUNT_OF[key]] !== 'YES') continue;
      const labels = [
        ...wrap(fen, bold, 9, labelW).map(t => ({ t, size: 9, font: bold, color: ink })),
        ...wrap(fme, regular, 8.5, labelW).map(t => ({ t, size: 8.5, font: regular, color: muted })),
      ];
      const values = wrap(answerText(kind, answers[key]), regular, 10, valueW);
      // Keep a row on one page when it fits on one; a very long answer continues line by line on the next page.
      const rowH = Math.max(labels.length * 11.5, values.length * 13.5) + 8;
      if (rowH < H - 200) ensure(rowH);
      let ly = y, vy = y;
      for (const l of labels) {
        page.drawText(l.t, { x: M, y: ly, size: l.size, font: l.font, color: l.color });
        ly -= 11.5;
      }
      for (const t of values) {
        if (vy < 60) { newPage(); vy = y; ly = y; }
        page.drawText(t, { x: valueX, y: vy, size: 10, font: regular, color: ink });
        vy -= 13.5;
      }
      y = Math.min(ly, vy) - 4;
      page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.4, color: line });
      y -= 8;
    }
    y -= 6;
  }

  // Signature block, kept together on one page.
  // Fit the drawn signature inside a 210 x 80 box without distorting it.
  const lineX = M + 105, lineW = 210, scale = Math.min(lineW / sig.width, 80 / sig.height);
  const sigW = sig.width * scale, sigH = sig.height * scale;
  ensure(sigH + 60);
  y -= 10;
  page.drawImage(sig, { x: lineX, y: y - sigH, width: sigW, height: sigH });
  y -= sigH + 4;
  page.drawText('Signature / Potpis:', { x: M, y: y + 6, size: 10, font: bold, color: ink });
  page.drawLine({ start: { x: lineX, y: y + 2 }, end: { x: lineX + lineW, y: y + 2 }, thickness: 0.8, color: ink });
  page.drawText('Date / Datum:', { x: M + 340, y: y + 6, size: 10, font: bold, color: ink });
  page.drawText(fmtDay(day), { x: M + 415, y: y + 6, size: 10, font: regular, color: ink });
  page.drawLine({ start: { x: M + 410, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.8, color: ink });
  y -= 28;
  page.drawText(`Completed on a tablet and signed electronically, ${submittedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC.`, { x: M, y, size: 8, font: regular, color: muted });

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `${answers.name}${uhid ? ` · ${uhid}` : ''} · ${i + 1} / ${pages.length}`;
    p.drawText(t, { x: W - M - regular.widthOfTextAtSize(t, 8), y: 30, size: 8, font: regular, color: muted });
  });
  return Buffer.from(await doc.save());
}

export function registerIntake({ app, pool, auth, audit, storageDir }) {
  // POST /api/intake-forms  { patientId?, answers, signature }
  // Without patientId a new patient is registered from the answers (needs patients.register as well).
  app.post('/api/intake-forms', auth, requirePerm('intake.write'), transactional(pool, async (req, res, c) => {
    const b = req.body || {};
    const answers = cleanAnswers(b.answers);
    const signature = signaturePng(b.signature);
    const submittedAt = new Date();
    const address = [answers.address, answers.city].filter(Boolean).join(', ');
    let patient;

    if (b.patientId) {
      if (typeof b.patientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.patientId)) fail(400, 'patientId must be a valid identifier');
      patient = (await c.query('SELECT * FROM patients WHERE patient_id=$1 AND archived_at IS NULL FOR UPDATE', [b.patientId])).rows[0];
      if (!patient) fail(404, 'Patient not found');
      // Only empty demographics are filled in; anything already on the record is left for staff to correct deliberately.
      const fill = { dob: answers.dob, phone: answers.phone, email: answers.email, address, referral: answers.referredBy };
      const set = Object.entries(fill).filter(([k, v]) => v && !patient[k]);
      if (set.length) {
        patient = (await c.query(`UPDATE patients SET ${set.map(([k], i) => `${k}=$${i + 2}`).join(',')} WHERE patient_id=$1 RETURNING *`,
          [patient.patient_id, ...set.map(([, v]) => v)])).rows[0];
        await audit(req, 'UPDATE_PATIENT_FROM_INTAKE', 'patients', patient.patient_id, patient.patient_id, { fields: set.map(([k]) => k) });
      }
    } else {
      if (!req.auth.permissions.includes('patients.register')) fail(403, 'Insufficient permission');
      patient = (await c.query(
        `INSERT INTO patients(name,dob,phone,email,address,referral,registration_user) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [answers.name, answers.dob || null, answers.phone || null, answers.email || null, address || null, answers.referredBy || null, req.auth.user_id])).rows[0];
      await audit(req, 'CREATE_PATIENT', 'patients', patient.patient_id, patient.patient_id, { uhid: patient.uhid, source: 'intake form' });
    }
    const id = patient.patient_id;
    const encounterId = await visitForWrite(c, id, null);

    const record = (await c.query(
      `INSERT INTO clinical_records(patient_id,encounter_id,section,payload,authored_by,signed_at) VALUES($1,$2,'INTAKE_FORM',$3,$4,$5) RETURNING record_id`,
      [id, encounterId, JSON.stringify({ ...answers, source: 'patient', submittedAt: submittedAt.toISOString() }), req.auth.user_id, submittedAt])).rows[0];
    await audit(req, 'CREATE_CLINICAL_RECORD', 'clinical_records', record.record_id, id, { section: 'INTAKE_FORM' });

    if (answers.allergiesAny === 'YES' && answers.allergies) {
      const a = await c.query(`INSERT INTO allergies(patient_id,allergen,reaction,recorded_by) VALUES($1,$2,$3,$4) RETURNING id`,
        [id, answers.allergies.slice(0, 500), 'Patient-reported on intake form', req.auth.user_id]);
      await audit(req, 'CREATE_ALLERGY', 'allergies', a.rows[0].id, id, { source: 'intake form' });
    }
    if (answers.weight) {
      const v = await c.query(`INSERT INTO clinical_records(patient_id,encounter_id,section,payload,authored_by,signed_at) VALUES($1,$2,'VITALS',$3,$4,now()) RETURNING record_id`,
        [id, encounterId, JSON.stringify({ weight: answers.weight.replace(',', '.'), source: 'patient intake form' }), req.auth.user_id]);
      await audit(req, 'CREATE_CLINICAL_RECORD', 'clinical_records', v.rows[0].record_id, id, { section: 'VITALS', source: 'intake form' });
    }

    const pdf = await renderIntakePdf({ answers, signature, uhid: patient.uhid, submittedAt });
    const storageKey = crypto.randomUUID() + '.pdf';
    const file = path.join(storageDir, storageKey);
    await fs.promises.writeFile(file, pdf);
    req.onRollback = () => fs.promises.unlink(file).catch(() => {});
    // "4063/2026" -> "4063-2026": a slash cannot be part of a file name.
    const fileName = `Saglasnost_${patient.uhid.replace(/[^\w.-]+/g, '-')}_${submittedAt.toISOString().slice(0, 10)}.pdf`;
    const docRow = (await c.query(
      `INSERT INTO documents(patient_id,document_type,file_name,storage_key,mime_type,uploaded_by) VALUES($1,'CONSENT',$2,$3,'application/pdf',$4) RETURNING id`,
      [id, fileName, storageKey, req.auth.user_id])).rows[0];
    await audit(req, 'UPLOAD_DOCUMENT', 'documents', docRow.id, id, { source: 'intake form' });

    res.status(201).json({ patientId: id, uhid: patient.uhid, recordId: record.record_id, documentId: docRow.id, fileName, newPatient: !b.patientId });
  }));
}
