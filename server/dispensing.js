import { finiteNumber } from './validation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const normalized = value => String(value ?? '').trim().toLowerCase();

export async function dispensePrescription(client, prescriptionId, items, userId) {
  const rx = (await client.query(`SELECT prescription_id,patient_id,prescription_no,status FROM prescriptions
    WHERE prescription_id=$1 FOR UPDATE`, [prescriptionId])).rows[0];
  if (!rx || rx.status !== 'ISSUED') fail(409, 'This prescription was already dispensed or does not exist');
  const medicines = (await client.query('SELECT * FROM prescription_medicines WHERE prescription_id=$1', [prescriptionId])).rows;
  if (!Array.isArray(items) || items.length > 500) fail(400, 'Provide a list of medicine batches and quantities');
  if (medicines.length && !items.length) fail(400, 'Choose a stock batch and quantity for every prescribed medicine');
  const byId = new Map(medicines.map(m => [m.row_id, m]));
  const seen = new Set(), covered = new Set();
  for (const item of items) {
    if (!item || !UUID.test(item.stockId) || !byId.has(item.prescriptionMedicineId))
      fail(400, 'Each batch must refer to a medicine on this prescription');
    if (!finiteNumber(item.quantity) || Number(item.quantity) <= 0 || Number(item.quantity) > 999999999.999)
      fail(400, 'Dispensed quantities must be positive numbers');
    const scaled = Number(item.quantity) * 1000;
    if (Math.abs(scaled - Math.round(scaled)) > 0.0001) fail(400, 'Use no more than three decimal places for quantities');
    const key = `${item.prescriptionMedicineId}:${item.stockId}`;
    if (seen.has(key)) fail(400, 'Combine duplicate batch entries for the same medicine');
    seen.add(key);
    covered.add(item.prescriptionMedicineId);
  }
  if (covered.size !== medicines.length) fail(400, 'Choose a stock batch and quantity for every prescribed medicine');
  const stockIds = [...new Set(items.map(i => i.stockId))].sort();
  // Lock shared batches in a stable order, preventing concurrent dispensing from overselling stock.
  const stock = new Map((await client.query(`SELECT *, (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE) AS expired
    FROM pharmacy_stock WHERE stock_id=ANY($1::uuid[]) ORDER BY stock_id FOR UPDATE`, [stockIds])).rows.map(s => [s.stock_id, s]));
  const totals = new Map();
  for (const item of items) {
    const batch = stock.get(item.stockId), medicine = byId.get(item.prescriptionMedicineId);
    if (!batch || !batch.active) fail(409, 'A selected stock batch is no longer available');
    if (batch.expired) fail(409, 'Expired stock cannot be dispensed');
    if (normalized(batch.medicine_name) !== normalized(medicine.medicine_name) ||
        (medicine.form && normalized(batch.form) !== normalized(medicine.form)))
      fail(400, 'The selected stock batch does not match the prescribed medicine and form');
    totals.set(item.stockId, (totals.get(item.stockId) || 0) + Math.round(Number(item.quantity) * 1000));
  }
  for (const [id, scaled] of totals) {
    const quantity = scaled / 1000;
    const result = await client.query(`UPDATE pharmacy_stock SET quantity=quantity-$1,updated_at=now()
      WHERE stock_id=$2 AND quantity >= $1 RETURNING stock_id`, [quantity, id]);
    if (!result.rowCount) fail(409, 'Insufficient stock in a selected batch; refresh the stock list');
  }
  for (const item of items) await client.query(`INSERT INTO dispensing_items
    (prescription_id,prescription_medicine_id,stock_id,quantity,dispensed_by) VALUES($1,$2,$3,$4,$5)`,
    [prescriptionId, item.prescriptionMedicineId, item.stockId, item.quantity, userId]);
  await client.query("UPDATE prescriptions SET status='DISPENSED' WHERE prescription_id=$1", [prescriptionId]);
  return { ...rx, status: 'DISPENSED' };
}
