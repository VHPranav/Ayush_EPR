// Mixing labels for making the therapy, printed on the clinic's label maker: patient name and the total at the
// top (e.g. 80gr), then each part of the formula with its weight. Numbers in brackets in a formula are parts:
// "SD + GRO + RA(2)" for 80gr is 80 / 4 parts = 20gr each, RA twice. The clinic writes a part that is taken
// twice as two rows of the same weight; that is the default here too.
import type { RxMedicine } from "./types";
import { formOf } from "./prescription-text";

export interface LabelRow { code: string; amount: string }
export interface Label { key: string; source: string; include: boolean; title: string; total: string; unit: string; rows: LabelRow[]; edited: boolean }
export interface LabelSize { width: number; height: number }
export const DEFAULT_LABEL_SIZE: LabelSize = { width: 62, height: 40 };

/** Splits a formula at "+" outside brackets: "Elixir-6F + 15(2) + 16" -> parts with their counts. */
export function parseFormula(formula: string): { code: string; parts: number }[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of formula) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "+" && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean).map(s => {
    const m = /^(.*?)\s*\((\d+(?:[.,]\d+)?)\)$/.exec(s);
    const parts = m ? Number(m[2].replace(",", ".")) : 1;
    return m && parts > 0 ? { code: m[1].trim(), parts } : { code: s, parts: 1 };
  });
}

const fmtAmount = (n: number, unit: string) => `${Math.round(n * 10) / 10}${unit}`;

/** The rows for a total: each part's share; with `perPart`, a part counted twice is written as two rows. */
export function labelRows(formula: string, total: number, unit: string, perPart = true): LabelRow[] {
  const items = parseFormula(formula);
  const sum = items.reduce((a, b) => a + b.parts, 0);
  if (!sum || !(total > 0)) return items.map(i => ({ code: i.code, amount: "" }));
  const one = total / sum;
  return items.flatMap(i => perPart && Number.isInteger(i.parts) && i.parts > 1
    ? Array.from({ length: i.parts }, () => ({ code: i.code, amount: fmtAmount(one, unit) }))
    : [{ code: i.code, amount: fmtAmount(one * i.parts, unit) }]);
}

/**
 * The labels a prescription needs: one per powder / elixir line, and one for a powder it is mixed with
 * ("pomiješati sa 1 gr biljnog praha ( Manasam(2) + Manasanthi )"). Elixirs and oils are in ml, the rest in gr.
 */
export function labelsFor(meds: RxMedicine[], patientName: string, perPart = true): Label[] {
  const labels: Label[] = [];
  meds.forEach((m, i) => {
    const f = formOf(m.form);
    const unit = f.key === "ELIXIR" || f.key === "OIL" ? "ml" : "gr";
    const total = unit === "ml" ? 250 : 80;
    labels.push({ key: `${i}`, source: `${f.short}: ${m.medicine_name}`, include: true, title: patientName, total: String(total), unit, rows: labelRows(m.medicine_name, total, unit, perPart), edited: false });
    const inner = /\(\s*(.+)\s*\)\s*$/.exec(m.anupana?.trim() ?? "");
    const mix = inner?.[1].trim();
    if (mix) labels.push({ key: `${i}-mix`, source: `Mixed with: ${mix}`, include: true, title: patientName, total: "80", unit: "gr", rows: labelRows(mix, 80, "gr", perPart), edited: false });
  });
  return labels;
}

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Opens the labels, one per page at the label size, and starts the print dialog (choose the label maker there). */
export function printLabels(labels: Label[], size: LabelSize) {
  const w = window.open("", "_blank", "width=600,height=700");
  if (!w) return false;
  const pad = 2.5;
  const pages = labels.map(l => {
    // Lines share the label height; the font follows (at most 11pt), so a long formula still fits.
    const lines = l.rows.length + 1;
    const lineMm = (size.height - pad * 2) / lines;
    const pt = Math.min(11, Math.max(5, lineMm * 2.835 / 1.2));
    return `<section style="font-size:${pt.toFixed(1)}pt">
  <div class="row head"><span class="code">${esc(l.title)}</span><span class="tot">${esc(l.total ? `${l.total}${l.unit}` : "")}</span></div>
  ${l.rows.map(r => `<div class="row"><span class="code">${esc(r.code)}</span><span class="amt">${esc(r.amount)}</span></div>`).join("")}
</section>`;
  }).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
@page{size:${size.width}mm ${size.height}mm;margin:0}
html,body{margin:0;padding:0}
body{font-family:Aptos,Calibri,Carlito,"Segoe UI",Arial,sans-serif;color:#000}
section{width:${size.width}mm;height:${size.height}mm;box-sizing:border-box;padding:${pad}mm ${pad + 1}mm;overflow:hidden;page-break-after:always;break-after:page;line-height:1.2}
section:last-child{page-break-after:auto;break-after:auto}
.row{display:grid;grid-template-columns:52% 28% 20%;white-space:nowrap}
.code{overflow:hidden;text-overflow:ellipsis}
.head .code{grid-column:1/3}
.tot{text-decoration:underline;text-align:right}
</style></head><body>${pages}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}
