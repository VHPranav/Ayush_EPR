"use client";
import { useState } from "react";
import { usePatientData } from "@/lib/use-patient-data";
import type { BillingAccount } from "@/lib/types";
import { Button, Card, DataList, Grid, Input, PageHead, Pill, RequirePatient } from "@/components/ui";

interface Row { description: string; category: string; quantity: number; unitPrice: number }
const newRow = (): Row => ({ description: "", category: "Treatment", quantity: 1, unitPrice: 0 });

export default function BillingPage() {
  return (
    <>
      <PageHead title="Billing" subtitle="Central patient billing ledger." />
      <RequirePatient><Billing /></RequirePatient>
    </>
  );
}

function Billing() {
  const { data, loading, error, post } = usePatientData<{ accounts: BillingAccount[] }>("billing");
  const [rows, setRows] = useState<Row[]>([]);
  const update = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);

  async function save() {
    if (!rows.length) return;
    if (await post({ items: rows }, "Invoice saved")) setRows([]);
  }

  return (
    <>
      <Card>
        {rows.length > 0 && (
          <div className="mb-2 hidden grid-cols-4 gap-3 text-sm font-medium text-ink-2 md:grid">
            <span>Description</span><span>Category</span><span>Quantity</span><span>Unit price</span>
          </div>
        )}
        {rows.map((r, i) => (
          <div key={i} className="mb-2">
            <Grid cols={4}>
              <Input placeholder="Description" aria-label="Description" value={r.description} onChange={e => update(i, { description: e.target.value })} />
              <Input aria-label="Category" value={r.category} onChange={e => update(i, { category: e.target.value })} />
              <Input type="number" min={1} aria-label="Quantity" value={r.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })} />
              <div className="flex gap-2">
                <Input type="number" min={0} step="0.01" aria-label="Unit price" value={r.unitPrice} onChange={e => update(i, { unitPrice: Number(e.target.value) })} />
                <Button variant="danger" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            </Grid>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setRows(rs => [...rs, newRow()])}>+ Add item</Button>
          <Button variant="primary" onClick={save} disabled={!rows.length}>Create Invoice</Button>
          {rows.length > 0 && <span className="text-sm font-bold">Total: ₹{total.toFixed(2)}</span>}
        </div>
      </Card>
      <Card>
        <DataList items={data?.accounts ?? null} loading={loading} error={error} empty="No invoices." render={x => (
          <p key={x.id} className="my-2"><b>{x.invoice_number}</b> — ₹{Number(x.total).toFixed(2)} <Pill>{x.status}</Pill></p>
        )} />
      </Card>
    </>
  );
}
