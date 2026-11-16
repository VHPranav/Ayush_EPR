import type { BillingAccount, BillingItem, InvoiceParty, InvoiceSeller, Patient, Prescription, PrescriptionSettings } from "./types";
import { LABELS, prescriptionItems, type Lang } from "./prescription-text";

/** Text for a CSS string literal (page footer), so a name cannot break out of the quotes. */
const cssStr = (v: string) => v.replace(/[\\"\n<>]/g, c => (c === "\n" ? " " : `\\${c.charCodeAt(0).toString(16)} `));
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Opens the prescription in the clinic's format (letterhead, doctor, Name / Registration # / Diagnosis / Date,
 * numbered advice) in English or Montenegrin, and starts the print dialog. Internal notes are not printed.
 */
export function printPrescription(patient: Patient, rx: Prescription, settings: PrescriptionSettings, lang: Lang = rx.language ?? "en") {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  const t = settings[lang], L = LABELS[lang];
  const lines = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean);
  const head = lines(t.letterhead), doc = lines(t.doctor);
  const items = prescriptionItems(rx, lang, t.oralNote, t.advice);
  const date = dmy(rx.prescribed_at);
  const logo = `${window.location.origin}/letterhead-logo.png`;
  const body = items.map(it => `<li>${it.heading ? `<b>${esc(it.heading)}${/[:.]$/.test(it.heading) ? "" : ":"}</b><br>` : ""}<span>${esc(it.text)}</span></li>`).join("");
  w.document.write(`<!doctype html><html lang="${lang === "me" ? "sr-Latn-ME" : "en"}"><head><meta charset="utf-8"><title>${esc(patient.uhid)}-${esc(patient.name)}</title>
<style>
@page{size:A4;margin:12mm 14mm 16mm;@bottom-center{content:"${cssStr(`${patient.uhid}-${patient.name} · ${L.page} `)}" counter(page);font:10px "Times New Roman",serif}}
body{font:12.5px/1.55 Calibri,Carlito,"Segoe UI",Arial,sans-serif;color:#111;margin:0}
.frame{border:1px solid #444}
.lh{display:flex;align-items:center;gap:18px;padding:12px 16px;border-bottom:1px solid #444}
.lh img{width:92px;height:auto}
.lh .t1{font-size:19px;font-weight:700}
.doc{text-align:center;padding:8px;border-bottom:1px solid #444;line-height:1.35}
.doc div:nth-child(1){font-style:italic}
.doc div:nth-child(2){font-size:17px;font-weight:700}
.doc div:nth-child(3),.doc div:nth-child(4){font-weight:700;font-size:12px}
.doc div:nth-child(5){font-size:11.5px}
.title{text-align:center;font-size:24px;font-weight:700;padding:4px;border-bottom:1px solid #444;letter-spacing:.5px}
table.hdr{width:100%;border-collapse:collapse}
.hdr td{border-bottom:1px solid #444;border-right:1px solid #444;padding:4px 10px}
.hdr td:last-child{border-right:0;text-align:center}
.adv{padding:6px 16px 18px}
.adv h2{font-size:13px;margin:6px 0}
ol{margin:0;padding-left:20px}
li{margin:0 0 9px}
</style></head><body>
<div class="frame">
  <div class="lh"><img src="${esc(logo)}" alt=""><div>${head.map((l, i) => `<div class="${i === 0 ? "t1" : ""}">${esc(l)}</div>`).join("")}</div></div>
  <div class="doc">${doc.map(l => `<div>${esc(l)}</div>`).join("")}</div>
  <div class="title">${esc(t.title)}</div>
  <table class="hdr">
    <tr><td style="width:18%">${esc(L.name)}</td><td>${esc(patient.name)}</td><td style="width:20%">${esc(L.reg)}</td><td style="width:16%">${esc(patient.uhid)}</td></tr>
    <tr><td>${esc(L.diagnosis)}</td><td>${esc(rx.diagnosis || "")}</td><td>${esc(L.date)}</td><td>${esc(date)}.</td></tr>
  </table>
  <div class="adv"><h2>${esc(L.advice)}</h2><ol>${body}</ol></div>
</div>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

// ── Invoice (Montenegrin layout, as on the clinic's fiscal "Faktura") ──────────────────────────────────────

const d2 = (n: number) => String(n).padStart(2, "0");
/** "07.10.2026" from a YYYY-MM-DD or ISO string, without timezone shifts for plain dates. */
const dmy = (v: string | null | undefined) => {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  return `${d2(d.getDate())}.${d2(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const dmyTime = (v: string) => { const d = new Date(v); return `${dmy(v)} ${d2(d.getHours())}:${d2(d.getMinutes())}:${d2(d.getSeconds())}`; };
/** "1 225.00" (no currency sign), the number style used throughout the invoice. */
const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  const [i, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${dec}`;
};
const vatLabel = (rate: number | string | null | undefined) => (rate === null || rate === undefined ? "Oslobođeno" : `${Number(rate)}%`);

/**
 * Opens the invoice in the clinic's Montenegrin layout and starts the print dialog. The EPR is not registered for
 * fiscalization, so this is a pre-invoice ("Predračun"); a recorded fiscal invoice number / IKOF / JIKR is shown for reference.
 */
export function printInvoice(patient: Patient, inv: BillingAccount, items: BillingItem[], fallbackSeller?: InvoiceSeller) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  const s: InvoiceSeller = inv.seller ?? fallbackSeller ?? { name: "" };
  const b: InvoiceParty = inv.buyer ?? { name: patient.name, address: patient.address ?? "" };
  const issued = inv.issued_at ?? inv.created_at ?? inv.account_date ?? new Date().toISOString();
  const issuedDate = new Date(issued);
  const period = inv.period_from || inv.period_to ? `${dmy(inv.period_from ?? inv.period_to)} - ${dmy(inv.period_to ?? inv.period_from)}` : dmy(issued);

  const lines = items.map((i, n) => {
    const gross = Number(i.quantity) * Number(i.unit_price);
    const net = Number(i.amount);
    const vat = Number(i.vat_amount ?? 0);
    return `<tr class="line"><td>${n + 1}</td><td>${esc(i.unit || "")}</td><td class="r">${esc(Number(i.quantity))}</td><td class="r">${num(i.unit_price)}</td>
<td class="r">${esc(Number(i.discount_pct ?? (gross ? (1 - net / gross) * 100 : 0)).toFixed(0))}%</td><td class="r">${num(net)}</td>
<td class="r">${num(vat)} (${i.vat_rate === null || i.vat_rate === undefined ? "0%" : `${Number(i.vat_rate)}%`})</td><td class="r">${num(net + vat)}</td></tr>
<tr class="desc"><td></td><td colspan="7"><b>${esc(i.description)}</b></td></tr>`;
  }).join("");

  // PDV summary per rate ("Poreske stope").
  const groups = new Map<string, { base: number; vat: number }>();
  for (const i of items) {
    const k = vatLabel(i.vat_rate);
    const g = groups.get(k) ?? { base: 0, vat: 0 };
    g.base += Number(i.amount);
    g.vat += Number(i.vat_amount ?? 0);
    groups.set(k, g);
  }
  const rates = [...groups].map(([k, g]) => `<tr><td>${esc(k)}</td><td>${num(g.base)}</td><td>${num(g.vat)}</td><td>${num(g.base + g.vat)}</td></tr>`).join("");
  const sub = Number(inv.subtotal ?? 0), disc = Number(inv.discount ?? 0), tax = Number(inv.tax ?? 0);
  const party = (p: InvoiceParty) => [p.address, p.city, p.country].filter(Boolean).map(x => esc(x)).join("<br>")
    + (p.pdv ? `<br>PDV: ${esc(p.pdv)}` : "") + (p.pib ? `<br>PIB: ${esc(p.pib)}` : "");
  const fiscal = inv.fiscal_number || inv.fiscal_ikof || inv.fiscal_jikr;

  w.document.write(`<!doctype html><html lang="sr-Latn-ME"><head><meta charset="utf-8"><title>${esc(inv.invoice_number)}</title>
<style>
@page{size:A4;margin:14mm}
body{font:12px/1.4 "DejaVu Sans",Verdana,system-ui,sans-serif;color:#111;margin:0}
.top{display:flex;justify-content:flex-end}
.seller{text-align:right;max-width:420px}
.bank{margin-top:6px;border:1px solid #bbb;padding:4px 8px;text-align:right}
.mid{display:flex;gap:32px;margin-top:28px}
.buyer{width:240px;flex-shrink:0}
h1{font-size:34px;font-weight:400;margin:0 0 6px;border-bottom:2px solid #111;padding-bottom:4px}
.nf{font-size:10px;color:#a00;margin:-2px 0 8px}
.meta{display:grid;grid-template-columns:repeat(4,auto);justify-content:space-between;gap:2px 14px;font-size:11px;white-space:nowrap}
.meta b{display:block}
table{border-collapse:collapse;width:100%}
.items{margin-top:34px}
.items th{font-weight:400;text-align:left;border-bottom:3px solid #111;padding:4px;vertical-align:bottom}
.items td{padding:4px;vertical-align:top}
.items .desc td{border-bottom:1px solid #999;padding-bottom:8px}
.r{text-align:right}
.below{display:flex;justify-content:space-between;align-items:flex-start;margin-top:28px;gap:24px}
.rates{width:auto}.rates th,.rates td{border:1px solid #111;padding:2px 10px;text-align:center;font-weight:400;white-space:nowrap}
.totals{width:auto}.totals td{white-space:nowrap}
.rates caption{text-align:left;font-size:13px}
.totals td{padding:2px 6px;text-align:right}
.totals .grand td{background:#111;color:#fff;font-weight:700}
.notes{display:flex;justify-content:space-between;margin-top:40px;gap:24px}
.notes>div{width:48%}
.fiscal{margin-top:30px;font-size:10px;color:#333;border-top:1px solid #ccc;padding-top:6px}
</style></head><body>
<div class="top"><div class="seller"><b>${esc(s.name)}</b><br>${esc(s.address || "")}${s.city ? `<br>${esc(s.city)}` : ""}<br>PDV: ${esc(s.pdv || "")}<br>PIB: ${esc(s.pib || "")}
${s.phone ? `<br>${esc(s.phone)} ☎` : ""}${s.email ? `<br>${esc(s.email)} ✉` : ""}${s.bankAccount ? `<br><b>Žiro račun:</b><br>${esc(s.bankAccount)}` : ""}
<div class="bank"><b>Žiro račun/IBAN:</b> ${esc(s.bankAccount || "")}<br><b>Naziv banke/Adresa:</b> ${esc(s.bankName || "")}<br><b>SWIFT Kod:</b> ${esc(s.swift || "")}</div></div></div>
<div class="mid">
  <div class="buyer"><b>Račun na ime:</b><br><b>${esc(b.name)}</b><br>${party(b)}</div>
  <div style="flex:1">
    <h1>Predračun</h1>
    <div class="nf">Nije fiskalni račun · Not a fiscal invoice</div>
    <div class="meta">
      <div style="grid-column:span 3;font-size:15px">Broj: <b style="display:inline">${esc(inv.invoice_number)}</b></div>
      <div><b>Poreski period:</b> ${d2(issuedDate.getMonth() + 1)}/${issuedDate.getFullYear()}</div>
      <div><b>Datum izdavanja</b>${esc(dmyTime(issued))}</div>
      <div><b>Datum valute</b>${esc(dmy(inv.due_date))}</div>
      <div><b>Mjesto</b>${esc(inv.place || s.place || "")}</div>
      <div><b>Datum prometa</b>${esc(period)}</div>
    </div>
  </div>
</div>
<table class="items"><thead><tr><th>R.br. Naziv</th><th>JM</th><th class="r">Kol.</th><th class="r">Cijena bez PDV</th><th class="r">Popust</th><th class="r">Cijena sa popustom</th><th class="r">PDV (stopa %)</th><th class="r">Vrijednost sa PDV</th></tr></thead>
<tbody>${lines}</tbody></table>
<div class="below">
  <table class="rates"><caption>Poreske stope</caption><tr><th>Stopa PDV-a</th><th>Osnovica</th><th>Iznos PDV-a</th><th>Iznos</th></tr>${rates}</table>
  <table class="totals">
    <tr><td>Iznos bez PDV-a</td><td>${num(sub)} €</td></tr>
    <tr><td>Popust</td><td>${num(disc)} €</td></tr>
    <tr><td>Neto iznos bez PDV-a</td><td>${num(sub - disc)} €</td></tr>
    <tr><td>Ukupno PDV</td><td>${num(tax)} €</td></tr>
    <tr class="grand"><td>UKUPNO SA PDV-om:</td><td>${num(inv.total)} €</td></tr>
  </table>
</div>
<div class="notes">
  <div>Napomena<br>${esc(inv.notes || "").replace(/\n/g, "<br>")}</div>
  <div>Važno!<br><br>Pri plaćanju kao vrijednost za polje "poziv na broj" obavezno unesite vrijednost: <b>${esc(inv.seq_no ?? inv.invoice_number)}</b></div>
</div>
${fiscal ? `<div class="fiscal">Fiskalni račun: <b>${esc(inv.fiscal_number || "")}</b>${inv.fiscal_ikof ? ` · IKOF: ${esc(inv.fiscal_ikof)}` : ""}${inv.fiscal_jikr ? ` · JIKR: ${esc(inv.fiscal_jikr)}` : ""}</div>` : ""}
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}
