"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CURRENCY, errMsg, fmtDate, money } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { usePatientData } from "@/lib/use-patient-data";
import type { Billable, BillingAccount, BillingCatalog, BillingItem, CatalogItem, InvoiceRow, InvoiceSummary } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { usePatient } from "@/lib/patient";
import { printInvoice } from "@/lib/print";
import { PatientBar, Table, Td } from "@/components/ui";
import { Button, Card, Empty, Grid, Input, PageHead, Pill, Select, TextField } from "@/components/ui";

interface Row { description: string; category: string; quantity: number; unitPrice: number }
const newRow = (): Row => ({ description: "", category: "Treatment", quantity: 1, unitPrice: 0 });
const BASE_CATEGORIES = ["Consultation", "Treatment", "Therapy", "Pharmacy", "Other"];
// A catalogue entry becomes an invoice line at its fixed rate; medicines are always billed under Pharmacy.
const lineFor = (item: CatalogItem, kind: "treatment" | "medicine", quantity = 1): Row => ({
  description: item.name, category: kind === "medicine" ? "Pharmacy" : item.category || "Treatment", quantity, unitPrice: Number(item.rate ?? 0),
});
const TONE = { OPEN: "amber", PAID: "green", VOID: "gray" } as const;

export default function BillingPage() {
  return (
    <>
      <PageHead title="Billing" subtitle="Every invoice at a glance. To create an invoice, open a patient first." />
      <Overview />
      <PatientSection />
    </>
  );
}

function PatientSection() {
  const { patient } = usePatient();
  if (!patient) return <p className="m-0 mb-6 text-sm text-muted">To create or review one patient&apos;s invoices, find them with the search bar above.</p>;
  return <><PatientBar /><Billing /></>;
}

/** Invoices across all patients with the headline totals, filterable by status and searchable. */
function Overview() {
  const { can } = useAuth();
  const toast = useToast();
  const { open } = usePatient();
  const [status, setStatus] = useState<"" | "OPEN" | "PAID" | "VOID">("OPEN");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useFetch<{ summary: InvoiceSummary; invoices: InvoiceRow[] }>(`/api/billing/invoices?status=${status}&q=${encodeURIComponent(term)}`);

  async function setInvoice(i: InvoiceRow, next: "PAID" | "VOID") {
    if (next === "VOID" && !window.confirm(`Void invoice ${i.invoice_number}?`)) return;
    try {
      await api(`/api/billing/${i.id}`, { method: "PUT", body: { status: next } });
      toast(next === "PAID" ? "Marked as paid" : "Invoice voided");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }
  const sum = data?.summary;
  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {[["Outstanding", sum ? money(sum.open_total) : "…", sum ? `${sum.open_count} open invoice${sum.open_count === 1 ? "" : "s"}` : ""], ["Invoiced this month", sum ? money(sum.invoiced_month) : "…", "excluding voided"], ["Paid this month", sum ? money(sum.paid_month) : "…", "invoices dated this month"]].map(([label, value, hint]) => (
          <section key={label} className="rounded-2xl bg-white p-5 shadow-card">
            <div className="text-sm font-medium text-muted">{label}</div>
            <div className="mt-2 text-[28px] font-semibold leading-8 text-ink">{value}</div>
            <div className="mt-1 text-xs text-muted">{hint}</div>
          </section>
        ))}
      </div>
      <Card
        title="All invoices"
        aside={<input value={q} onChange={e => setQ(e.target.value)} placeholder="Invoice no., patient or UHID" aria-label="Search invoices" className="w-full max-w-[260px] rounded-xl border border-line-strong bg-white px-3.5 py-2 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring" />}
      >
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Status">
          {([["OPEN", "Open"], ["PAID", "Paid"], ["VOID", "Void"], ["", "All"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${status === k ? "bg-brand text-white" : "bg-hover text-ink-2 hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        {error ? <Empty>Could not load: {error}</Empty> : loading ? <Empty>Loading…</Empty> : !data?.invoices.length ? <Empty>No invoices match.</Empty> : (
          <Table head={["Invoice", "Date", "Patient", "Total", "Status", ""]}>
            {data.invoices.map(i => (
              <tr key={i.id}>
                <Td>{i.invoice_number}</Td><Td>{fmtDate(i.account_date)}</Td><Td>{i.name} <span className="text-xs text-muted">{i.uhid}</span></Td><Td>{money(i.total)}</Td>
                <Td><Pill tone={TONE[i.status as keyof typeof TONE] ?? "gray"}>{i.status}</Pill></Td>
                <Td>
                  <span className="flex flex-wrap gap-1.5">
                    {can("billing.write") && i.status === "OPEN" && <Button variant="primary" onClick={() => setInvoice(i, "PAID")}>Mark paid</Button>}
                    {can("billing.write") && i.status === "OPEN" && <Button variant="danger" onClick={() => setInvoice(i, "VOID")}>Void</Button>}
                    <Button onClick={() => open(i.patient_id).catch(e => toast(errMsg(e)))}>Open patient</Button>
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function Billing() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, post, reload } = usePatientData<{ accounts: BillingAccount[]; items: BillingItem[] }>("billing");
  const { patient } = usePatient();
  const { data: catalog } = useFetch<BillingCatalog>(can("billing.write") ? "/api/billing/catalog" : null);
  const [rows, setRows] = useState<Row[]>([]);
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [openId, setOpenId] = useState<string | null>(null);
  // The form always ends with one empty line ready for typing; filling it in makes it a real line and a new empty one appears.
  const lines = [...rows, newRow()];
  const update = (i: number, patch: Partial<Row>) =>
    setRows(rs => (i >= rs.length ? [...rs, { ...newRow(), ...patch }] : rs.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  const filled = rows.filter(r => r.description.trim() || r.unitPrice > 0);
  const subtotal = filled.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
  const total = subtotal - Number(discount || 0) + Number(tax || 0);

  // Everything that can be billed, by name, so typing or picking a known item fills in its category and rate.
  const known = new Map<string, Row>();
  catalog?.treatments.forEach(t => known.set(t.name.toLowerCase(), lineFor(t, "treatment")));
  catalog?.medicines.forEach(m => known.set(m.name.toLowerCase(), lineFor(m, "medicine")));
  const categories = [...new Set([...BASE_CATEGORIES, ...(catalog?.treatments.map(t => t.category).filter((c): c is string => !!c) ?? [])])];
  const treatmentGroups = new Map<string, CatalogItem[]>();
  catalog?.treatments.forEach(t => treatmentGroups.set(t.category || "Other", [...(treatmentGroups.get(t.category || "Other") ?? []), t]));

  function setDescription(i: number, description: string) {
    const hit = known.get(description.trim().toLowerCase());
    update(i, hit ? { ...hit, quantity: lines[i].quantity } : { description });
  }

  function quickAdd(key: string) {
    const [kind, name] = key.split("|");
    const item = (kind === "medicine" ? catalog?.medicines : catalog?.treatments)?.find(x => x.name === name);
    if (item) setRows(rs => [...rs, lineFor(item, kind as "treatment" | "medicine")]);
  }

  // Pulls in what the patient received since their last invoice: dispensed medicines and completed therapy sessions.
  async function addFromVisit() {
    if (!patient) return;
    try {
      const b = await api<Billable>(`/api/patients/${patient.patient_id}/billable`);
      const lines = [
        ...b.sessions.map(x => lineFor(x, "treatment", Number(x.quantity))),
        ...b.medicines.map(x => lineFor(x, "medicine", Number(x.quantity))),
      ];
      if (!lines.length) return toast(b.since ? "Nothing new to bill since the last invoice" : "No dispensed medicines or therapy sessions to bill yet");
      setRows(rs => [...rs, ...lines]);
      const unpriced = lines.filter(l => !l.unitPrice).length;
      toast(`Added ${lines.length} item${lines.length === 1 ? "" : "s"}` + (unpriced ? `. ${unpriced} ha${unpriced === 1 ? "s" : "ve"} no rate set: enter the price` : ""));
    } catch (e) {
      toast(errMsg(e));
    }
  }

  async function save() {
    if (!filled.length) return;
    if (filled.some(r => !r.description.trim())) return toast("Every line needs a description");
    if (filled.some(r => r.quantity <= 0 || r.unitPrice < 0)) return toast("Quantity must be above 0 and price cannot be negative");
    if (Number(discount) < 0 || Number(tax) < 0 || total < 0) return toast("Check the discount and tax amounts");
    if (await post({ items: filled, discount: Number(discount || 0), tax: Number(tax || 0) }, "Invoice saved. Use Print below to give the patient a copy.")) { setRows([]); setDiscount("0"); setTax("0"); }
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={addFromVisit}>Add from this visit</Button>
            <Select aria-label="Add an item from the price list" className="!w-auto min-w-[260px]" value="" onChange={e => quickAdd(e.target.value)}>
              <option value="">+ Add from price list…</option>
              {[...treatmentGroups].map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map(t => <option key={t.name} value={`treatment|${t.name}`}>{t.name}{t.rate == null ? " (no rate)" : ` · ${money(t.rate)}`}</option>)}
                </optgroup>
              ))}
              {!!catalog?.medicines.length && (
                <optgroup label="Medicines">
                  {catalog.medicines.map(m => <option key={m.name} value={`medicine|${m.name}`}>{m.name}{m.rate == null ? " (no rate)" : ` · ${money(m.rate)}`}</option>)}
                </optgroup>
              )}
            </Select>
            <span className="text-xs text-muted">Rates come from Treatment Master and the Pharmacy selling price.</span>
          </div>
          <datalist id="billing-items">{[...known.values()].map(r => <option key={r.description} value={r.description} />)}</datalist>
          <div className="mb-2 hidden grid-cols-4 gap-3 text-sm font-medium text-ink-2 md:grid">
            <span>Description</span><span>Category</span><span>Quantity</span><span>Unit price</span>
          </div>
          {lines.map((r, i) => (
            <div key={i} className="mb-2">
              <Grid cols={4}>
                <Input placeholder="Pick or type an item" aria-label="Description" list="billing-items" value={r.description} onChange={e => setDescription(i, e.target.value)} />
                <Select aria-label="Category" value={r.category} onChange={e => update(i, { category: e.target.value })}>
                  {(categories.includes(r.category) ? categories : [r.category, ...categories]).map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Input type="number" min={1} aria-label="Quantity" value={r.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })} />
                <div className="flex gap-2">
                  <Input type="number" min={0} step="0.01" aria-label="Unit price" value={r.unitPrice} onChange={e => update(i, { unitPrice: Number(e.target.value) })} />
                  {i < rows.length && <Button variant="danger" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>Remove</Button>}
                </div>
              </Grid>
            </div>
          ))}
          <div className="max-w-md"><Grid cols={2}>
            <TextField label={`Discount (${CURRENCY})`} type="number" min={0} step="0.01" value={discount} onChange={setDiscount} />
            <TextField label={`Tax (${CURRENCY})`} type="number" min={0} step="0.01" value={tax} onChange={setTax} />
          </Grid></div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={save} disabled={!filled.length}>Create Invoice</Button>
            <span className="text-sm font-bold">Total: {money(total)}</span>
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
                  {patient && <Button onClick={() => { if (!printInvoice(patient, a, items)) toast("Allow pop-ups for this site to print"); }}>Print</Button>}
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
