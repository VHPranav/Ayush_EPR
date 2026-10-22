"use client";
import { api } from "@/lib/api";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import { useRouter } from "next/navigation";
import type { RxMedicine, StockItem } from "@/lib/types";
import { Button, Card, Empty, PageHead, Pill } from "@/components/ui";

interface QueueItem {
  prescription_id: string; prescription_no: string; prescribed_at: string; notes: string | null;
  patient_id: string; name: string; uhid: string; allergies: string[]; medicines: RxMedicine[];
}

/** Total quantity on hand for a medicine name across batches (null when the name is not in stock at all). */
function onHand(stock: StockItem[] | null, name: string) {
  if (!stock) return undefined;
  const rows = stock.filter(s => s.medicine_name.trim().toLowerCase() === name.trim().toLowerCase());
  return rows.length ? rows.reduce((n, r) => n + Number(r.quantity), 0) : null;
}

export default function DispensingPage() {
  const toast = useToast();
  const router = useRouter();
  const { open } = usePatient();
  const { data: queue, error, reload } = useFetch<QueueItem[]>("/api/pharmacy/queue");
  const { data: stock } = useFetch<StockItem[]>("/api/pharmacy/stock");

  async function dispense(q: QueueItem) {
    try {
      await api(`/api/prescriptions/${q.prescription_id}/dispense`, { method: "POST", body: {} });
      toast(`${q.prescription_no} marked as dispensed`);
      reload();
    } catch (e) {
      toast(errMsg(e));
      reload();
    }
  }

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
      <PageHead title="Dispensing" subtitle="Prescriptions waiting to be dispensed, oldest first. Check allergies and stock, hand over the medicines, then mark it dispensed." />
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
            <Button variant="primary" onClick={() => dispense(q)}>Mark dispensed</Button>
            <Button onClick={() => view(q)}>Open prescription</Button>
          </div>
        </Card>
      ))}
    </>
  );
}
