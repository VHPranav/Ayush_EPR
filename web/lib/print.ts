import type { BillingAccount, BillingItem, Patient, Prescription } from "./types";
import { fmtDate, fmtDateTime, money } from "./format";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Opens a clean one-page prescription in a new window and starts the browser's print dialog. */
export function printPrescription(patient: Patient, rx: Prescription, prescriber?: string) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return false;
  const allergies = patient.allergies?.length ? `<p class="warn"><b>Allergies:</b> ${patient.allergies.map(a => esc(a.allergen + (a.severity ? ` (${a.severity})` : ""))).join(", ")}</p>` : "";
  const meds = (rx.medicines ?? []).map(m => `<tr><td>${esc(m.medicine_name)}</td><td>${esc(m.dose)}</td><td>${esc(m.frequency)}</td><td>${esc(m.instructions)}</td></tr>`).join("");
  const trs = (rx.treatments ?? []).map(t => `<tr><td>${esc(t.treatment_name)}</td><td>${esc(t.frequency)}</td><td>${esc(t.duration)}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(rx.prescription_no)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0}h2{font-size:15px;margin:20px 0 6px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #ddd;padding:6px 8px}.muted{color:#555}.warn{background:#fde8e8;padding:8px 10px;border-radius:6px}</style></head><body>
<h1>Ayush EPR — Prescription</h1><div class="muted">${esc(rx.prescription_no)} · ${esc(fmtDateTime(rx.prescribed_at))}${prescriber ? ` · ${esc(prescriber)}` : ""}</div>
<h2>${esc(patient.name)} <span class="muted">(${esc(patient.uhid)})</span></h2><div class="muted">DOB ${esc(fmtDate(patient.dob))} · ${esc(patient.sex || "—")} · ${esc(patient.phone || "—")}</div>${allergies}
${trs ? `<h2>Treatments</h2><table><tr><th>Treatment</th><th>Frequency</th><th>Duration</th></tr>${trs}</table>` : ""}
${meds ? `<h2>Medicines</h2><table><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Instructions</th></tr>${meds}</table>` : ""}
${rx.notes ? `<h2>Notes</h2><p>${esc(rx.notes)}</p>` : ""}
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

/** Opens a one-page invoice (bill) for the patient in a new window and starts the browser's print dialog. */
export function printInvoice(patient: Patient, inv: BillingAccount, items: BillingItem[]) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return false;
  const lines = items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.description)}</td><td>${esc(i.category || "")}</td><td class="r">${esc(Number(i.quantity))}</td><td class="r">${esc(money(i.unit_price))}</td><td class="r">${esc(money(i.amount))}</td></tr>`).join("");
  const row = (label: string, v: string, bold = false) => `<tr${bold ? ' class="b"' : ""}><td>${label}</td><td class="r">${v}</td></tr>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoice_number)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0}h2{font-size:15px;margin:20px 0 6px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #ddd;padding:6px 8px}.r{text-align:right}.muted{color:#555}.totals{width:280px;margin:12px 0 0 auto}.totals td{border:0;padding:3px 8px}.b td{font-weight:700;border-top:2px solid #111}.status{display:inline-block;padding:2px 10px;border-radius:999px;border:1px solid #999;font-size:12px;margin-left:8px}</style></head><body>
<h1>Ayush EPR — Invoice <span class="status">${esc(inv.status === "PAID" ? "Paid" : inv.status === "VOID" ? "Void" : "Unpaid")}</span></h1>
<div class="muted">Ayurveda &amp; Yoga Centre · ${esc(inv.invoice_number)} · ${esc(fmtDate(inv.account_date))}</div>
<h2>Billed to: ${esc(patient.name)} <span class="muted">(${esc(patient.uhid)})</span></h2><div class="muted">${esc(patient.phone || "")}${patient.address ? ` · ${esc(patient.address)}` : ""}</div>
<h2>Items</h2><table><tr><th>#</th><th>Description</th><th>Category</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>${lines}</table>
<table class="totals">${row("Subtotal", esc(money(inv.subtotal)))}${Number(inv.discount) > 0 ? row("Discount", "−" + esc(money(inv.discount))) : ""}${Number(inv.tax) > 0 ? row("Tax", esc(money(inv.tax))) : ""}${row("Total", esc(money(inv.total)), true)}</table>
<p class="muted" style="margin-top:32px">Thank you. This is a computer-generated invoice.</p>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}
