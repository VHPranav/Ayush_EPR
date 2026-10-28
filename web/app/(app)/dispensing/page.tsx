"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import { useRouter } from "next/navigation";
import type { RxMedicine, StockItem } from "@/lib/types";
import { Button, Card, Empty, Field, Input, PageHead, Pill, Select } from "@/components/ui";

interface QueueItem {
  prescription_id: string; prescription_no: string; prescribed_at: string; notes: string | null;
  patient_id: string; name: string; uhid: string; allergies: string[]; medicines: RxMedicine[];
}

/** Total quantity on hand for a medicine name across batches (null when the name is not in stock at all). */
function onHand(stock: StockItem[] | null, name: string) {
  if (!stock) return undefined;
  const rows = stock.filter(s => !s.expired && s.medicine_name.trim().toLowerCase() === name.trim().toLowerCase());
  return rows.length ? rows.reduce((n, r) => n + Number(r.quantity), 0) : null;
}

export default function DispensingPage() {
  const toast = useToast();
  const router = useRouter();
  const { open } = usePatient();
  const { data: queue, error, reload } = useFetch<QueueItem[]>("/api/pharmacy/queue");
  const { data: stock, reload: reloadStock } = useFetch<StockItem[]>("/api/pharmacy/stock");

  async function view(q: QueueItem) {
    try {
      await open(q.patient_id);
      router.push("/prescription");
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <>
      <PageHead title="Dispensing" subtitle="Prescriptions waiting to be dispensed, oldest first. Check allergies, select the batches and quantities handed over, then confirm dispensing." />
      {error ? <Card><Empty>Could not load: {error}</Empty></Card> : queue === null ? <Card><Empty>Loading…</Empty></Card> : !queue.length ? (
        <Card><Empty>Nothing waiting. New prescriptions from doctors appear here.</Empty></Card>
      ) : queue.map(q => (
        <Card key={q.prescription_id}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-base">{q.name}</b><Pill>{q.uhid}</Pill>
            <span className="text-sm text-muted">{q.prescription_no} · {fmtDateTime(q.prescribed_at)}</span>
          </div>
          {q.allergies.length > 0 && (
            <div role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"><b>Allergies:</b> {[...new Set(q.allergies)].join(", ")}</div>
          )}
          {q.medicines.length ? (
            <ul className="m-0 mt-3 list-none divide-y divide-line p-0">
              {q.medicines.map((m, i) => {
                const qty = onHand(stock, m.medicine_name);
                return (
                  <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <b className="text-ink">{m.medicine_name}</b>
                    <span className="text-ink-2">{[m.dose, m.frequency].filter(Boolean).join(" · ")}{m.instructions ? ` — ${m.instructions}` : ""}</span>
                    <span className="ml-auto">
                      {qty === undefined ? null : qty === null ? <Pill tone="red">Not in stock</Pill> : qty <= 0 ? <Pill tone="red">Out of stock</Pill> : <Pill tone="green">{qty} in stock</Pill>}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">No medicines on this prescription (treatments only).</p>}
          {q.notes && <p className="mb-0 mt-2 text-sm text-ink-2">Notes: {q.notes}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <DispenseForm prescription={q} stock={stock} onDone={() => { reload(); reloadStock(); }} />
            <Button onClick={() => view(q)}>Open prescription</Button>
          </div>
        </Card>
      ))}
    </>
  );
}

interface Allocation { key: number; medicineId: string; stockId: string; quantity: string }

function DispenseForm({ prescription, stock, onDone }: { prescription: QueueItem; stock: StockItem[] | null; onDone: () => void }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Allocation[]>(() => prescription.medicines.map((m, key) => ({ key, medicineId: m.row_id!, stockId: "", quantity: "" })));
  const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
  const patch = (key: number, values: Partial<Allocation>) => setRows(all => all.map(r => r.key === key ? { ...r, ...values } : r));

  async function save() {
    if (busy) return;
    if (rows.some(r => !r.stockId || !r.quantity.trim() || !Number.isFinite(Number(r.quantity)) || Number(r.quantity) <= 0)) {
      toast("Choose a batch and enter a positive quantity for each medicine");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/prescriptions/${prescription.prescription_id}/dispense`, { body: {
        items: rows.map(r => ({ prescriptionMedicineId: r.medicineId, stockId: r.stockId, quantity: r.quantity })),
      } });
      toast(`${prescription.prescription_no} dispensed; stock updated`);
      onDone();
    } catch (e) {
      toast(errMsg(e));
      onDone();
    } finally { setBusy(false); }
  }

  if (!expanded) return <Button variant="primary" onClick={() => setExpanded(true)}>Dispense</Button>;
  return (
    <div className="w-full rounded-xl border border-line bg-subtle p-4">
      {prescription.medicines.map(m => {
        const batches = (stock ?? []).filter(s => !s.expired && Number(s.quantity) > 0 && normalize(s.medicine_name) === normalize(m.medicine_name) && (!m.form || normalize(s.form) === normalize(m.form)));
        const allocations = rows.filter(r => r.medicineId === m.row_id);
        return (
          <div key={m.row_id} className="mb-4">
            <b className="text-sm">{m.medicine_name}</b>
            {allocations.map(r => (
              <div key={r.key} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_140px_auto]">
                <Field label="Stock batch">
                  <Select disabled={busy} value={r.stockId} onChange={e => patch(r.key, { stockId: e.target.value })}>
                    <option value="">Choose a batch…</option>
                    {batches.map(s => <option key={s.stock_id} value={s.stock_id}>{[s.batch_no || "No batch number", s.form, s.strength, s.expiry_date ? `expires ${s.expiry_date}` : "No expiry date", `${s.quantity} ${s.unit || "units"} available`].filter(Boolean).join(" · ")}</option>)}
                  </Select>
                </Field>
                <Field label="Quantity handed over"><Input disabled={busy} type="number" min="0.001" step="0.001" value={r.quantity} onChange={e => patch(r.key, { quantity: e.target.value })} /></Field>
                {allocations.length > 1 && <Button disabled={busy} onClick={() => setRows(all => all.filter(x => x.key !== r.key))}>Remove batch</Button>}
              </div>
            ))}
            {!stock ? <p className="text-sm text-muted">Loading stock…</p> : !batches.length ? <p className="text-sm text-danger">No matching unexpired stock is available.</p> : null}
            <Button disabled={busy || !batches.length} onClick={() => setRows(all => [...all, { key: Math.max(-1, ...all.map(r => r.key)) + 1, medicineId: m.row_id!, stockId: "", quantity: "" }])}>+ Another batch</Button>
          </div>
        );
      })}
      {!prescription.medicines.length && <p className="text-sm">This prescription has treatments only; no medicine stock will be deducted.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || (!!prescription.medicines.length && !stock)} onClick={save}>{busy ? "Saving…" : "Confirm dispensing"}</Button>
        <Button disabled={busy} onClick={() => setExpanded(false)}>Cancel</Button>
      </div>
    </div>
  );
}
