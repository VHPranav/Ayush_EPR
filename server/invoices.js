// Invoices in the Montenegrin layout ("Faktura"), issued by the EPR as a numbered pre-invoice ("Predračun",
// PR n/year) because the EPR is not registered for fiscalization (EFI). The clinic enters it in its fiscal
// software and records the fiscal invoice number and IKOF / JIKR codes back here.
import { requirePerm } from './permissions.js';
import { transactional } from './transaction.js';
import { finiteNumber, hasText, nonNegative } from './validation.js';

/** Seller details as on the clinic's own invoices; editable under Billing > Invoice settings. */
export const DEFAULT_INVOICE_SETTINGS = {
  seller: {
    name: 'DRUŠTVO SA OGRANIČENOM ODGOVORNOŠĆU "AYUSH AYURVEDA AND YOGA THERAPHY CENTER" PODGORICA',
    address: 'NIKŠIĆKI PUT 109',
    city: '81000 PODGORICA',
    pib: '03767558',
    pdv: '',
    phone: '+382 67 024 746',
    email: 'ayush@t-com.me',
    bankAccount: '510-0000000211762-07',
    bankName: 'CRNOGORSKA KOMERCIJALNA BANKA',
    swift: '',
  },
  place: 'PODGORICA',
  dueDays: 30,
  defaultUnit: 'kom',
  defaultVat: null, // null = PDV exempt ("Oslobođeno"), as on the clinic's current invoices
  note: '',
};
export const VAT_RATES = [0, 7, 15, 21];

const SELLER_KEYS = Object.keys(DEFAULT_INVOICE_SETTINGS.seller);
const BUYER_KEYS = ['name', 'address', 'city', 'country', 'pib', 'pdv'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (v, max, label) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') fail(400, `${label}: invalid value`);
  const s = v.trim();
  if (s.length > max) fail(400, `${label} is too long`);
  return s;
};
const date = (v, label) => {
  if (!v) return null;
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(new Date(v + 'T00:00:00Z').getTime())) fail(400, `${label}: choose a valid date`);
  return v;
};
const vatRate = (v, label) => {
  if (v === undefined || v === null || v === '' || v === 'EXEMPT') return null;
  const n = Number(v);
  if (!VAT_RATES.includes(n)) fail(400, `${label}: PDV must be exempt, 0, 7, 15 or 21 %`);
  return n;
};

export async function invoiceSettings(db) {
  const r = await db.query("SELECT value FROM app_settings WHERE key='invoice'");
  const saved = r.rows[0]?.value ?? {};
  return { ...DEFAULT_INVOICE_SETTINGS, ...saved, seller: { ...DEFAULT_INVOICE_SETTINGS.seller, ...(saved.seller ?? {}) } };
}

function cleanSettings(b) {
  if (!b || typeof b !== 'object') fail(400, 'Settings are required');
  const seller = Object.fromEntries(SELLER_KEYS.map(k => [k, text(b.seller?.[k], 300, `Seller ${k}`)]));
  if (!seller.name) fail(400, 'Seller name is required');
  const dueDays = Number(b.dueDays ?? 30);
  if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) fail(400, 'Payment term must be 0 to 365 days');
  return {
    seller,
    place: text(b.place, 100, 'Place') || 'PODGORICA',
    dueDays,
    defaultUnit: text(b.defaultUnit, 20, 'Default unit') || 'kom',
    defaultVat: vatRate(b.defaultVat, 'Default PDV'),
    note: text(b.note, 1000, 'Note'),
  };
}

/** Validates the lines and works out each line's discount, PDV and the invoice totals. */
export function priceLines(items, { discount = 0, tax = 0 } = {}) {
  if (!Array.isArray(items) || !items.length) fail(400, 'Each invoice line needs a description and a positive quantity and non-negative price');
  const lines = items.map((i, n) => {
    if (!hasText(i?.description) || !finiteNumber(i.quantity) || Number(i.quantity) <= 0 || !finiteNumber(i.unitPrice) || Number(i.unitPrice) < 0)
      fail(400, 'Each invoice line needs a description and a positive quantity and non-negative price');
    const pct = i.discountPct === undefined || i.discountPct === null || i.discountPct === '' ? 0 : Number(i.discountPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) fail(400, `Line ${n + 1}: discount must be between 0 and 100 %`);
    const rate = vatRate(i.vatRate, `Line ${n + 1}`);
    const gross = round2(Number(i.quantity) * Number(i.unitPrice));
    const lineDiscount = round2(gross * pct / 100);
    const net = round2(gross - lineDiscount);
    const vat = rate === null ? 0 : round2(net * rate / 100);
    return {
      description: i.description.trim().slice(0, 500), category: typeof i.category === 'string' ? i.category.slice(0, 100) : null,
      unit: text(i.unit, 20, `Line ${n + 1} unit`) || null, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice),
      discountPct: pct, vatRate: rate, gross, lineDiscount, net, vat,
    };
  });
  if (!nonNegative(discount) || !nonNegative(tax)) fail(400, 'Discount and tax cannot be negative');
  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const totalDiscount = round2(lines.reduce((s, l) => s + l.lineDiscount, 0) + Number(discount || 0));
  const totalTax = round2(lines.reduce((s, l) => s + l.vat, 0) + Number(tax || 0));
  if (Number(discount || 0) > subtotal - (totalDiscount - Number(discount || 0)) + totalTax) fail(400, 'Discount cannot exceed the invoice amount');
  return { lines, subtotal, discount: totalDiscount, tax: totalTax, total: round2(subtotal - totalDiscount + totalTax) };
}

export function registerInvoices({ app, pool, auth, audit }) {
  app.get('/api/settings/invoice', auth, requirePerm('billing.read'), async (_req, res) => {
    res.json({ ...(await invoiceSettings(pool)), vatRates: VAT_RATES });
  });

  app.put('/api/settings/invoice', auth, requirePerm('users.manage'), transactional(pool, async (req, res, c) => {
    const value = cleanSettings(req.body);
    await c.query(`INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES('invoice',$1,$2,now())
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [JSON.stringify(value), req.auth.user_id]);
    await audit(req, 'UPDATE_INVOICE_SETTINGS', 'app_settings', 'invoice');
    res.json(value);
  }));

  app.post('/api/patients/:id/billing', auth, requirePerm('billing.write'), transactional(pool, async (req, res, c) => {
    const b = req.body || {};
    const priced = priceLines(b.items, { discount: b.discount, tax: b.tax });
    const patient = (await c.query('SELECT patient_id,name,address FROM patients WHERE patient_id=$1', [req.params.id])).rows[0];
    if (!patient) fail(404, 'Patient not found');
    const settings = await invoiceSettings(c);

    // Bill the patient unless a buyer (e.g. an employer paying for staff consultations) is given.
    const given = b.buyer && typeof b.buyer === 'object' ? Object.fromEntries(BUYER_KEYS.map(k => [k, text(b.buyer[k], 300, `Buyer ${k}`)])) : {};
    const buyer = given.name ? given : { name: patient.name, address: patient.address || '', city: '', country: '', pib: '', pdv: '' };
    const issuedAt = new Date();
    const year = issuedAt.getFullYear();
    const due = date(b.dueDate, 'Due date') ?? new Date(issuedAt.getTime() + settings.dueDays * 864e5).toISOString().slice(0, 10);
    const periodFrom = date(b.periodFrom, 'Service period start'), periodTo = date(b.periodTo, 'Service period end');
    if (periodFrom && periodTo && periodTo < periodFrom) fail(400, 'The service period ends before it starts');

    const seq = (await c.query(`INSERT INTO invoice_year_sequence(year,last_number) VALUES($1,1)
      ON CONFLICT(year) DO UPDATE SET last_number=invoice_year_sequence.last_number+1 RETURNING last_number`, [year])).rows[0].last_number;
    const number = `PR ${seq}/${year}`;
    const a = (await c.query(
      `INSERT INTO billing_accounts(patient_id,payer_type,invoice_number,status,subtotal,discount,tax,total,notes,created_by,
         seq_year,seq_no,issued_at,due_date,period_from,period_to,place,buyer,seller)
       VALUES($1,$2,$3,'OPEN',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [patient.patient_id, b.payerType || (given.name ? 'COMPANY' : 'SELF-PAY'), number, priced.subtotal, priced.discount, priced.tax, priced.total,
        text(b.notes, 2000, 'Note') || settings.note || null, req.auth.user_id, year, seq, issuedAt, due, periodFrom, periodTo,
        text(b.place, 100, 'Place') || settings.place, JSON.stringify(buyer), JSON.stringify({ ...settings.seller, place: settings.place })])).rows[0];
    for (const l of priced.lines) {
      await c.query(
        `INSERT INTO billing_items(account_id,description,category,quantity,unit_price,amount,unit,discount_pct,vat_rate,vat_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [a.id, l.description, l.category, l.quantity, l.unitPrice, l.net, l.unit, l.discountPct, l.vatRate, l.vat]);
    }
    await audit(req, 'CREATE_INVOICE', 'billing_accounts', a.id, patient.patient_id, { invoice: number, total: a.total });
    res.status(201).json(a);
  }));

  // The fiscal invoice issued for this pre-invoice in the clinic's fiscal software (number, IKOF, JIKR).
  app.put('/api/billing/:id/fiscal', auth, requirePerm('billing.write'), transactional(pool, async (req, res, c) => {
    const b = req.body || {};
    const fiscalNumber = text(b.fiscalNumber, 50, 'Fiscal invoice number');
    const ikof = text(b.ikof, 64, 'IKOF'), jikr = text(b.jikr, 64, 'JIKR');
    if (ikof && !/^[0-9a-f]{32}$/i.test(ikof)) fail(400, 'IKOF is 32 characters (0-9, a-f)');
    if (jikr && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jikr)) fail(400, 'JIKR looks like 9397109d-3479-4ae5-aeb9-0e1ea261959f');
    const r = await c.query(
      'UPDATE billing_accounts SET fiscal_number=$1, fiscal_ikof=$2, fiscal_jikr=$3 WHERE id=$4 RETURNING id,patient_id,invoice_number,fiscal_number,fiscal_ikof,fiscal_jikr',
      [fiscalNumber || null, ikof ? ikof.toLowerCase() : null, jikr ? jikr.toLowerCase() : null, req.params.id]);
    if (!r.rows[0]) fail(404, 'Invoice not found');
    await audit(req, 'RECORD_FISCAL_INVOICE', 'billing_accounts', r.rows[0].id, r.rows[0].patient_id, { invoice: r.rows[0].invoice_number, fiscalNumber });
    res.json(r.rows[0]);
  }));
}
