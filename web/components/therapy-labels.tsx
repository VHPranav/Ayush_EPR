"use client";
// Labels for making the therapy (label maker): one per powder / elixir of a prescription, with each part's weight
// worked out from the total. Every value can be changed before printing; nothing is saved.
import { useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import type { Prescription } from "@/lib/types";
import { DEFAULT_LABEL_SIZE, labelRows, labelsFor, printLabels, type Label, type LabelSize } from "@/lib/labels";
import { Button, Field, Input } from "./ui";

const SIZE_KEY = "ayush.labelSize";
function savedSize(): LabelSize {
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) ?? "null");
    if (s && s.width > 10 && s.height > 10) return { width: Number(s.width), height: Number(s.height) };
  } catch {}
  return DEFAULT_LABEL_SIZE;
}

export function TherapyLabels({ rx, patientName, onDone }: { rx: Prescription; patientName: string; onDone: () => void }) {
  const [perPart, setPerPart] = useState(true);
  const [labels, setLabels] = useState<Label[]>(() => labelsFor(rx.medicines ?? [], patientName, true));
  const [size, setSize] = useState<LabelSize>(savedSize);

  const formulaOf = (l: Label) => l.source.replace(/^[^:]+:\s*/, "");
  const update = (key: string, patch: Partial<Label>) => setLabels(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const setTotal = (l: Label, total: string) =>
    update(l.key, { total, ...(l.edited ? {} : { rows: labelRows(formulaOf(l), Number(total.replace(",", ".")), l.unit, perPart) }) });
  const setRow = (l: Label, i: number, k: "code" | "amount", v: string) => update(l.key, { edited: true, rows: l.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const recalc = (l: Label, split = perPart) => update(l.key, { edited: false, rows: labelRows(formulaOf(l), Number(l.total.replace(",", ".")), l.unit, split) });

  function changeSplit(v: boolean) {
    setPerPart(v);
    labels.forEach(l => recalc(l, v));
  }
  function setDim(k: keyof LabelSize, v: string) {
    const next = { ...size, [k]: Number(v) || 0 };
    setSize(next);
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(next)); } catch {}
  }
  const chosen = labels.filter(l => l.include);

  if (!labels.length) return <p className="text-sm text-muted">This prescription has no herbal therapy lines.</p>;
  return (
    <>
      <p className="mt-0 text-sm text-ink-2">
        Numbers in brackets are parts: <b>SD + GRO + RA(2)</b> for <b>80gr</b> is 80 ÷ 4 = <b>20gr</b> each, RA twice. Change the total and the weights follow; any row can be changed by hand.
      </p>
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={perPart} onChange={e => changeSplit(e.target.checked)} className="h-4 w-4 accent-brand" />
        Write a part taken twice as two rows (RA 20gr, RA 20gr), as on the paper label
      </label>

      <div className="space-y-3">
        {labels.map(l => (
          <div key={l.key} className={`rounded-2xl border p-3 ${l.include ? "border-line-strong bg-white" : "border-line bg-subtle opacity-60"}`}>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" checked={l.include} onChange={e => update(l.key, { include: e.target.checked })} className="h-4 w-4 accent-brand" />
              <span className="truncate">{l.source}</span>
            </label>
            {l.include && (
              <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
                <div>
                  <div className="grid grid-cols-[1fr_110px] gap-2">
                    <Input aria-label="Name on the label" value={l.title} onChange={e => update(l.key, { title: e.target.value })} />
                    <div className="flex items-center gap-1">
                      <Input aria-label="Total" inputMode="decimal" value={l.total} onChange={e => setTotal(l, e.target.value)} className="text-right" />
                      <span className="text-sm text-muted">{l.unit}</span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {l.rows.map((r, i) => (
                      <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2">
                        <Input aria-label="Part" value={r.code} onChange={e => setRow(l, i, "code", e.target.value)} />
                        <Input aria-label="Amount" value={r.amount} onChange={e => setRow(l, i, "amount", e.target.value)} className="text-right" />
                        <Button aria-label="Remove row" onClick={() => update(l.key, { edited: true, rows: l.rows.filter((_, j) => j !== i) })}><Trash2 size={15} /></Button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button onClick={() => update(l.key, { edited: true, rows: [...l.rows, { code: "", amount: "" }] })}><Plus size={15} /> Add row</Button>
                    {l.edited && <Button onClick={() => recalc(l)}>Recalculate</Button>}
                  </div>
                </div>
                {/* Preview at the label's proportions. */}
                <div className="self-start rounded-md border border-dashed border-line-strong bg-white p-2 font-sans text-[11px] leading-tight text-black" style={{ aspectRatio: `${size.width} / ${size.height || 1}` }}>
                  <div className="grid grid-cols-[52%_28%_20%]"><span className="col-span-2 truncate">{l.title}</span><span className="text-right underline">{l.total}{l.total ? l.unit : ""}</span></div>
                  {l.rows.map((r, i) => <div key={i} className="grid grid-cols-[52%_28%_20%]"><span className="truncate">{r.code}</span><span>{r.amount}</span></div>)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
        <div className="flex items-end gap-2">
          <div className="w-28"><Field label="Label width (mm)"><Input inputMode="numeric" value={String(size.width)} onChange={e => setDim("width", e.target.value)} /></Field></div>
          <div className="w-28"><Field label="Height (mm)"><Input inputMode="numeric" value={String(size.height)} onChange={e => setDim("height", e.target.value)} /></Field></div>
          <p className="mb-4 max-w-[220px] text-xs text-muted">The size is remembered on this computer. In the print window choose the label maker.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onDone}>Close</Button>
          <Button variant="primary" disabled={!chosen.length || size.width < 10 || size.height < 10} onClick={() => printLabels(chosen, size)}>
            <Printer size={16} /> Print {chosen.length} label{chosen.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </>
  );
}
