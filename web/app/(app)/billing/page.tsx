"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CURRENCY, errMsg, fmtDate, money } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { usePatientData } from "@/lib/use-patient-data";
import type { BillingAccount, BillingItem } from "@/lib/types";
import { Button, Card, Empty, Grid, Input, PageHead, Pill, RequirePatient, TextField } from "@/components/ui";

interface Row { description: string; category: string; quantity: number; unitPrice: number }
const newRow = (): Row => ({ description: "", category: "Treatment", quantity: 1, unitPrice: 0 });
const TONE = { OPEN: "amber", PAID: "green", VOID: "gray" } as const;

export default function BillingPage() {
  return (
    <>
      <PageHead title="Billing" subtitle="Create invoices, record payment and view the patient's billing history." />
      <RequirePatient><Billing /></RequirePatient>
    </>
  );
}

function Billing() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, post, reload } = usePatientData<{ accounts: BillingAccount[]; items: BillingItem[] }>("billing");
  const [rows, setRows] = useState<Row[]>([]);
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [openId, setOpenId] = useState<string | null>(null);
  const update = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const subtotal = rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
  const total = subtotal - Number(discount || 0) + Number(tax || 0);

  async function save() {
    if (!rows.length) return;
    if (rows.some(r => !r.description.trim())) return toast("Every line needs a description");
    if (rows.some(r => r.quantity <= 0 || r.unitPrice < 0)) return toast("Quantity must be above 0 and price cannot be negative");
    if (Number(discount) < 0 || Number(tax) < 0 || total < 0) return toast("Check the discount and tax amounts");
    if (await post({ items: rows, discount: Number(discount || 0), tax: Number(tax || 0) }, "Invoice saved")) { setRows([]); setDiscount("0"); setTax("0"); }
  }

  async function setStatus(a: BillingAccount, status: "PAID" | "VOID" | "OPEN") {
    if (status === "VOID" && !window.confirm(`Void invoice ${a.invoice_number}?`)) return;
    try {
      await api(`/api/billing/${a.id}`, { method: "PUT", body: { status } });
      toast(status === "PAID" ? "Marked as paid" : status === "VOID" ? "Invoice voided" : "Invoice reopened");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <>
      {can("billing.write") && (
        <Card title="New invoice">
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
          {rows.length > 0 && (
            <div className="max-w-md"><Grid cols={2}>
              <TextField label={`Discount (${CURRENCY})`} type="number" min={0} step="0.01" value={discount} onChange={setDiscount} />
              <TextField label={`Tax (${CURRENCY})`} type="number" min={0} step="0.01" value={tax} onChange={setTax} />
            </Grid></div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button onClick={() => setRows(rs => [...rs, newRow()])}>+ Add item</Button>
            <Button variant="primary" onClick={save} disabled={!rows.length}>Create Invoice</Button>
            {rows.length > 0 && <span className="text-sm font-bold">Total: {money(total)}</span>}
          </div>
        </Card>
      )}
      <Card title="Invoices">
        {error ? <Empty>Could not load: {error}</Empty> : loading ? <Empty>Loading…</Empty> : !data?.accounts.length ? <Empty>No invoices.</Empty> : data.accounts.map(a => {
          const items = data.items.filter(i => i.account_id === a.id);
          const isOpen = openId === a.id;
          return (
            <div key={a.id} className="border-b border-line py-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <b>{a.invoice_number}</b>
                <span className="text-sm text-muted">{fmtDate(a.account_date)}</span>
                <span className="font-semibold">{money(a.total)}</span>
                <Pill tone={TONE[a.status as keyof typeof TONE] ?? "gray"}>{a.status}</Pill>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  <Button onClick={() => setOpenId(isOpen ? null : a.id)}>{isOpen ? "Hide details" : "Details"}</Button>
                  {can("billing.write") && a.status === "OPEN" && <Button variant="primary" onClick={() => setStatus(a, "PAID")}>Mark paid</Button>}
                  {can("billing.write") && a.status === "OPEN" && <Button variant="danger" onClick={() => setStatus(a, "VOID")}>Void</Button>}
                  {can("billing.write") && a.status !== "OPEN" && <Button onClick={() => setStatus(a, "OPEN")}>Reopen</Button>}
                </span>
              </div>
              {isOpen && (
                <div className="mt-2 rounded-xl bg-subtle p-3 text-sm">
                  {items.map(i => <div key={i.id} className="flex justify-between gap-3 py-0.5"><span>{i.description} <span className="text-muted">× {Number(i.quantity)}</span></span><span>{money(i.amount)}</span></div>)}
                  <div className="mt-1 flex justify-between border-t border-line pt-1 text-muted"><span>Subtotal</span><span>{money(a.subtotal)}</span></div>
                  {Number(a.discount) > 0 && <div className="flex justify-between text-muted"><span>Discount</span><span>−{money(a.discount)}</span></div>}
                  {Number(a.tax) > 0 && <div className="flex justify-between text-muted"><span>Tax</span><span>{money(a.tax)}</span></div>}
                  <div className="flex justify-between font-semibold"><span>Total</span><span>{money(a.total)}</span></div>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </>
  );
}
