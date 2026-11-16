"use client";
// Billing in the clinic's Montenegrin invoice layout. The EPR issues a numbered pre-invoice ("Predračun", PR n/year):
// it is not registered for fiscalization, so the fiscal invoice is made in the clinic's fiscal software and its
// number and IKOF / JIKR codes are recorded back on the EPR invoice ("Fiscal codes").
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate, money } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { usePatientData } from "@/lib/use-patient-data";
import type { Billable, BillingAccount, BillingCatalog, BillingItem, CatalogItem, InvoiceParty, InvoiceRow, InvoiceSettings, InvoiceSummary } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { usePatient } from "@/lib/patient";
import { printInvoice } from "@/lib/print";
import { PatientBar, Table, Td } from "@/components/ui";
import { AreaField, Button, Card, Empty, Field, Grid, Input, Modal, PageHead, Pill, Select, TextField } from "@/components/ui";

type Vat = "EXEMPT" | "0" | "7" | "15" | "21";
const VATS: [Vat, string][] = [["EXEMPT", "Oslobođeno (exempt)"], ["0", "0 %"], ["7", "7 %"], ["15", "15 %"], ["21", "21 %"]];
interface Row { description: string; category: string; unit: string; quantity: number; unitPrice: number; discountPct: number; vat: Vat }
const BASE_CATEGORIES = ["Consultation", "Treatment", "Therapy", "Pharmacy", "Other"];
const UNITS = ["kom", "Sat", "usluga", "pak", "ml", "gr"];
const TONE = { OPEN: "amber", PAID: "green", VOID: "gray" } as const;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const vatOf = (v: number | null | undefined): Vat => (v === null || v === undefined ? "EXEMPT" : (String(v) as Vat));

/** Line maths, identical to server/invoices.js priceLines. */
function priced(r: Row) {
  const gross = round2(r.quantity * r.unitPrice);
  const discount = round2(gross * (r.discountPct || 0) / 100);
  const net = round2(gross - discount);
  const vat = r.vat === "EXEMPT" ? 0 : round2(net * Number(r.vat) / 100);
  return { gross, discount, net, vat, total: round2(net + vat) };
}

export default function BillingPage() {
  return (
    <>
      <PageHead title="Billing" subtitle="Every invoice at a glance. To create an invoice, open a patient first." />
      <Overview />
      <PatientSection />
      <InvoiceSettingsCard />
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
        aside={<input value={q} onChange={e => setQ(e.target.value)} placeholder="Invoice no., fiscal no., patient, company" aria-label="Search invoices" className="w-full max-w-[280px] rounded-xl border border-line-strong bg-white px-3.5 py-2 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring" />}
      >
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Status">
          {([["OPEN", "Open"], ["PAID", "Paid"], ["VOID", "Void"], ["", "All"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${status === k ? "bg-brand text-white" : "bg-hover text-ink-2 hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        {error ? <Empty>Could not load: {error}</Empty> : loading ? <Empty>Loading…</Empty> : !data?.invoices.length ? <Empty>No invoices match.</Empty> : (
          <Table head={["Invoice", "Fiscal no.", "Date", "Billed to", "Total", "Status", ""]}>
            {data.invoices.map(i => (
              <tr key={i.id}>
                <Td>{i.invoice_number}</Td>
                <Td>{i.fiscal_number || <span className="text-muted">—</span>}</Td>
                <Td>{fmtDate(i.account_date)}</Td>
                <Td>{i.buyer_name && i.buyer_name !== i.name ? <>{i.buyer_name} <span className="text-xs text-muted">for {i.name}</span></> : <>{i.name} <span className="text-xs text-muted">{i.uhid}</span></>}</Td>
                <Td>{money(i.total)}</Td>
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
  const { data: settings } = useFetch<InvoiceSettings>("/api/settings/invoice");
  const defaults = { unit: settings?.defaultUnit ?? "kom", vat: vatOf(settings?.defaultVat) };
  const newRow = (): Row => ({ description: "", category: "Treatment", unit: defaults.unit, quantity: 1, unitPrice: 0, discountPct: 0, vat: defaults.vat });
  const lineFor = (item: CatalogItem, kind: "treatment" | "medicine", quantity = 1): Row => ({
    ...newRow(), description: item.name, category: kind === "medicine" ? "Pharmacy" : item.category || "Treatment", quantity, unitPrice: Number(item.rate ?? 0),
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [billTo, setBillTo] = useState<"patient" | "company">("patient");
  const [buyer, setBuyer] = useState<Required<InvoiceParty>>({ name: "", address: "", city: "", country: "Crna Gora", pib: "", pdv: "" });
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [fiscalFor, setFiscalFor] = useState<BillingAccount | null>(null);

  // The form always ends with one empty line ready for typing; filling it in makes it a real line and a new empty one appears.
  const lines = [...rows, newRow()];
  const update = (i: number, patch: Partial<Row>) =>
    setRows(rs => (i >= rs.length ? [...rs, { ...newRow(), ...patch }] : rs.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  const filled = rows.filter(r => r.description.trim() || r.unitPrice > 0);
  const sums = filled.map(priced).reduce((s, p) => ({ gross: s.gross + p.gross, discount: s.discount + p.discount, vat: s.vat + p.vat, total: s.total + p.total }), { gross: 0, discount: 0, vat: 0, total: 0 });

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
      const added = [
        ...b.sessions.map(x => lineFor(x, "treatment", Number(x.quantity))),
        ...b.medicines.map(x => lineFor(x, "medicine", Number(x.quantity))),
      ];
      if (!added.length) return toast(b.since ? "Nothing new to bill since the last invoice" : "No dispensed medicines or therapy sessions to bill yet");
      setRows(rs => [...rs, ...added]);
      const unpriced = added.filter(l => !l.unitPrice).length;
      toast(`Added ${added.length} item${added.length === 1 ? "" : "s"}` + (unpriced ? `. ${unpriced} ha${unpriced === 1 ? "s" : "ve"} no rate set: enter the price` : ""));
    } catch (e) {
      toast(errMsg(e));
    }
  }

  async function save() {
    if (!filled.length) return;
    if (filled.some(r => !r.description.trim())) return toast("Every line needs a description");
    if (filled.some(r => r.quantity <= 0 || r.unitPrice < 0)) return toast("Quantity must be above 0 and price cannot be negative");
    if (filled.some(r => r.discountPct < 0 || r.discountPct > 100)) return toast("Discount must be between 0 and 100 %");
    if (billTo === "company" && !buyer.name.trim()) return toast("Enter the company name, or bill the patient");
    if (periodFrom && periodTo && periodTo < periodFrom) return toast("The service period ends before it starts");
    const body = {
      items: filled.map(r => ({ description: r.description, category: r.category, unit: r.unit, quantity: r.quantity, unitPrice: r.unitPrice, discountPct: r.discountPct, vatRate: r.vat === "EXEMPT" ? null : Number(r.vat) })),
      buyer: billTo === "company" ? buyer : undefined,
      periodFrom: periodFrom || undefined, periodTo: periodTo || undefined, dueDate: dueDate || undefined, notes: notes || undefined,
    };
    if (await post(body, "Invoice saved. Print it, enter it in the fiscal software, then record the fiscal codes.")) {
      setRows([]); setPeriodFrom(""); setPeriodTo(""); setDueDate(""); setNotes("");
    }
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

  const today = new Date();
  const defaultDue = new Date(today.getTime() + (settings?.dueDays ?? 30) * 864e5).toISOString().slice(0, 10);

  return (
    <>
      {can("billing.write") && (
        <Card title="New invoice" aside={<Pill tone="amber">Predračun · not fiscal</Pill>}>
          {/* Who pays */}
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Bill to">
            {([["patient", `Patient: ${patient?.name ?? ""}`], ["company", "Company or other payer"]] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={billTo === k} onClick={() => setBillTo(k)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${billTo === k ? "bg-brand text-white" : "bg-hover text-ink-2 hover:text-ink"}`}>{label}</button>
            ))}
          </div>
          {billTo === "company" && (
            <div className="mb-3 rounded-xl bg-subtle p-4">
              <Grid cols={3}>
                <TextField label="Company name *" value={buyer.name} onChange={v => setBuyer(b => ({ ...b, name: v }))} placeholder="e.g. FINANCE PLUS" />
                <TextField label="Address" value={buyer.address} onChange={v => setBuyer(b => ({ ...b, address: v }))} />
                <TextField label="Postcode and city" value={buyer.city} onChange={v => setBuyer(b => ({ ...b, city: v }))} placeholder="81000 PODGORICA" />
                <TextField label="Country" value={buyer.country} onChange={v => setBuyer(b => ({ ...b, country: v }))} />
                <TextField label="PIB" value={buyer.pib} onChange={v => setBuyer(b => ({ ...b, pib: v }))} />
                <TextField label="PDV no." value={buyer.pdv} onChange={v => setBuyer(b => ({ ...b, pdv: v }))} />
              </Grid>
            </div>
          )}

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
          <datalist id="billing-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>

          <div className="mb-2 hidden gap-2 text-xs font-medium text-ink-2 xl:grid xl:grid-cols-[2.4fr_1.1fr_0.8fr_0.8fr_1fr_0.8fr_1.3fr_1fr_auto]">
            <span>Naziv / Description</span><span>Category</span><span>JM</span><span>Kol.</span><span>Cijena bez PDV</span><span>Popust %</span><span>PDV</span><span className="text-right">Vrijednost</span><span />
          </div>
          {lines.map((r, i) => (
            <div key={i} className="mb-2 grid grid-cols-2 gap-2 rounded-xl bg-subtle p-2 md:grid-cols-4 xl:grid-cols-[2.4fr_1.1fr_0.8fr_0.8fr_1fr_0.8fr_1.3fr_1fr_auto] xl:items-center xl:bg-transparent xl:p-0">
              <Input className="col-span-2 md:col-span-4 xl:col-span-1" placeholder="Pick or type an item" aria-label="Description" list="billing-items" value={r.description} onChange={e => setDescription(i, e.target.value)} />
              <Select aria-label="Category" value={r.category} onChange={e => update(i, { category: e.target.value })}>
                {(categories.includes(r.category) ? categories : [r.category, ...categories]).map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Input aria-label="Unit (JM)" list="billing-units" value={r.unit} onChange={e => update(i, { unit: e.target.value })} />
              <Input type="number" min={0} step="0.5" aria-label="Quantity" value={r.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })} />
              <Input type="number" min={0} step="0.01" aria-label="Price without PDV" value={r.unitPrice} onChange={e => update(i, { unitPrice: Number(e.target.value) })} />
              <Input type="number" min={0} max={100} step="1" aria-label="Discount %" value={r.discountPct} onChange={e => update(i, { discountPct: Number(e.target.value) })} />
              <Select aria-label="PDV rate" value={r.vat} onChange={e => update(i, { vat: e.target.value as Vat })}>
                {VATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <span className="self-center text-right text-sm font-semibold">{money(priced(r).total)}</span>
              {i < rows.length ? <Button variant="danger" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>Remove</Button> : <span />}
            </div>
          ))}

          <div className="mt-4 grid grid-cols-1 gap-x-6 lg:grid-cols-[1fr_320px]">
            <div>
              <Grid cols={3}>
                <TextField label="Service from (Datum prometa)" type="date" value={periodFrom} onChange={setPeriodFrom} />
                <TextField label="Service to" type="date" value={periodTo} onChange={setPeriodTo} />
                <Field label={`Pay by (Datum valute) · default ${fmtDate(defaultDue)}`}><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
              </Grid>
              <AreaField label="Napomena / note on the invoice" value={notes} onChange={setNotes} placeholder={settings?.note || "Optional"} />
            </div>
            <dl className="m-0 self-end rounded-xl bg-subtle p-4 text-sm">
              {([["Iznos bez PDV-a", sums.gross], ["Popust", sums.discount], ["Neto iznos bez PDV-a", sums.gross - sums.discount], ["Ukupno PDV", sums.vat]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between py-0.5 text-ink-2"><dt>{k}</dt><dd className="m-0">{money(v)}</dd></div>
              ))}
              <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-base font-bold text-ink"><dt>Ukupno sa PDV-om</dt><dd className="m-0">{money(sums.total)}</dd></div>
            </dl>
          </div>
          <div className="mt-4">
            <Button variant="primary" onClick={save} disabled={!filled.length}>Create invoice</Button>
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
                {a.fiscal_number ? <Pill tone="green">Fiscal {a.fiscal_number}</Pill> : a.status !== "VOID" && <Pill tone="gray">No fiscal invoice yet</Pill>}
                <span className="text-sm text-muted">{fmtDate(a.account_date)}{a.buyer?.name && a.buyer.name !== patient?.name ? ` · billed to ${a.buyer.name}` : ""}</span>
                <span className="font-semibold">{money(a.total)}</span>
                <Pill tone={TONE[a.status as keyof typeof TONE] ?? "gray"}>{a.status}</Pill>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  <Button onClick={() => setOpenId(isOpen ? null : a.id)}>{isOpen ? "Hide details" : "Details"}</Button>
                  {patient && <Button onClick={() => { if (!printInvoice(patient, a, items, settings?.seller)) toast("Allow pop-ups for this site to print"); }}>Print</Button>}
                  {can("billing.write") && a.status !== "VOID" && <Button onClick={() => setFiscalFor(a)}>Fiscal codes</Button>}
                  {can("billing.write") && a.status === "OPEN" && <Button variant="primary" onClick={() => setStatus(a, "PAID")}>Mark paid</Button>}
                  {can("billing.write") && a.status === "OPEN" && <Button variant="danger" onClick={() => setStatus(a, "VOID")}>Void</Button>}
                  {can("billing.write") && a.status !== "OPEN" && <Button onClick={() => setStatus(a, "OPEN")}>Reopen</Button>}
                </span>
              </div>
              {isOpen && (
                <div className="mt-2 rounded-xl bg-subtle p-3 text-sm">
                  {items.map(i => (
                    <div key={i.id} className="flex justify-between gap-3 py-0.5">
                      <span>{i.description} <span className="text-muted">× {Number(i.quantity)}{i.unit ? ` ${i.unit}` : ""}{Number(i.discount_pct) > 0 ? ` · −${Number(i.discount_pct)}%` : ""} · PDV {i.vat_rate === null || i.vat_rate === undefined ? "oslobođeno" : `${Number(i.vat_rate)}%`}</span></span>
                      <span>{money(Number(i.amount) + Number(i.vat_amount ?? 0))}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t border-line pt-1 text-muted"><span>Iznos bez PDV-a</span><span>{money(a.subtotal)}</span></div>
                  {Number(a.discount) > 0 && <div className="flex justify-between text-muted"><span>Popust</span><span>−{money(a.discount)}</span></div>}
                  {Number(a.tax) > 0 && <div className="flex justify-between text-muted"><span>PDV</span><span>{money(a.tax)}</span></div>}
                  <div className="flex justify-between font-semibold"><span>Ukupno</span><span>{money(a.total)}</span></div>
                  {a.due_date && <div className="mt-1 text-muted">Pay by {fmtDate(a.due_date)}{a.period_from ? ` · service ${fmtDate(a.period_from)} – ${fmtDate(a.period_to)}` : ""}</div>}
                  {(a.fiscal_ikof || a.fiscal_jikr) && <div className="mt-1 break-all text-xs text-muted">IKOF {a.fiscal_ikof || "—"} · JIKR {a.fiscal_jikr || "—"}</div>}
                </div>
              )}
            </div>
          );
        })}
      </Card>
      <FiscalModal invoice={fiscalFor} onClose={() => setFiscalFor(null)} onSaved={() => { setFiscalFor(null); reload(); }} />
    </>
  );
}

/** Records the fiscal invoice issued in the clinic's fiscal software for this EPR pre-invoice. */
function FiscalModal({ invoice, onClose, onSaved }: { invoice: BillingAccount | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  return (
    <Modal open={invoice !== null} onClose={onClose} title={`Fiscal invoice for ${invoice?.invoice_number ?? ""}`}
      description="Copy these from the fiscal invoice printed by your fiscal software (bottom of the page).">
      {invoice && <FiscalForm key={invoice.id} invoice={invoice} onCancel={onClose} onSaved={() => { toast("Fiscal codes saved"); onSaved(); }} />}
    </Modal>
  );
}

function FiscalForm({ invoice, onCancel, onSaved }: { invoice: BillingAccount; onCancel: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ fiscalNumber: invoice.fiscal_number ?? "", ikof: invoice.fiscal_ikof ?? "", jikr: invoice.fiscal_jikr ?? "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/api/billing/${invoice.id}/fiscal`, { method: "PUT", body: f });
      onSaved();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <TextField label="Fiscal invoice number (Broj računa)" value={f.fiscalNumber} onChange={v => setF(s => ({ ...s, fiscalNumber: v }))} placeholder="5 / 2026" />
      <TextField label="IKOF" value={f.ikof} onChange={v => setF(s => ({ ...s, ikof: v.trim() }))} placeholder="503507115990435ef3d73abce67a05ef" />
      <TextField label="JIKR" value={f.jikr} onChange={v => setF(s => ({ ...s, jikr: v.trim() }))} placeholder="9397109d-3479-4ae5-aeb9-0e1ea261959f" />
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </>
  );
}

/** Seller details printed on every invoice (company, PIB, bank account …); Super Admin only. */
function InvoiceSettingsCard() {
  const { can } = useAuth();
  const { data, reload } = useFetch<InvoiceSettings>(can("users.manage") ? "/api/settings/invoice" : null);
  const [open, setOpen] = useState(false);
  if (!can("users.manage") || !data) return null;
  return (
    <Card title="Invoice settings" aside={<Button onClick={() => setOpen(o => !o)}>{open ? "Close" : "Edit seller details"}</Button>}>
      {!open ? (
        <p className="m-0 text-sm text-muted">{data.seller.name} · PIB {data.seller.pib || "—"} · {data.seller.bankName || "no bank"} {data.seller.bankAccount} · pay within {data.dueDays} days</p>
      ) : <SettingsForm initial={data} onSaved={() => { setOpen(false); reload(); }} />}
    </Card>
  );
}

function SettingsForm({ initial, onSaved }: { initial: InvoiceSettings; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(initial);
  const seller = (k: keyof InvoiceSettings["seller"]) => (v: string) => setF(s => ({ ...s, seller: { ...s.seller, [k]: v } }));
  async function save() {
    try {
      await api("/api/settings/invoice", { method: "PUT", body: f });
      toast("Invoice settings saved. New invoices use them; earlier invoices keep the details they were issued with.");
      onSaved();
    } catch (e) {
      toast(errMsg(e));
    }
  }
  return (
    <>
      <AreaField label="Company name (as registered)" value={f.seller.name} onChange={seller("name")} />
      <Grid cols={3}>
        <TextField label="Address" value={f.seller.address ?? ""} onChange={seller("address")} />
        <TextField label="Postcode and city" value={f.seller.city ?? ""} onChange={seller("city")} />
        <TextField label="PIB" value={f.seller.pib ?? ""} onChange={seller("pib")} />
        <TextField label="PDV no." value={f.seller.pdv ?? ""} onChange={seller("pdv")} />
        <TextField label="Phone" value={f.seller.phone ?? ""} onChange={seller("phone")} />
        <TextField label="Email" value={f.seller.email ?? ""} onChange={seller("email")} />
        <TextField label="Bank account (Žiro račun / IBAN)" value={f.seller.bankAccount ?? ""} onChange={seller("bankAccount")} />
        <TextField label="Bank name" value={f.seller.bankName ?? ""} onChange={seller("bankName")} />
        <TextField label="SWIFT" value={f.seller.swift ?? ""} onChange={seller("swift")} />
        <TextField label="Place of issue (Mjesto)" value={f.place} onChange={v => setF(s => ({ ...s, place: v }))} />
        <TextField label="Payment term (days)" type="number" min={0} max={365} value={String(f.dueDays)} onChange={v => setF(s => ({ ...s, dueDays: Number(v) }))} />
        <TextField label="Default unit (JM)" value={f.defaultUnit} onChange={v => setF(s => ({ ...s, defaultUnit: v }))} />
        <Field label="Default PDV">
          <Select value={vatOf(f.defaultVat)} onChange={e => setF(s => ({ ...s, defaultVat: e.target.value === "EXEMPT" ? null : Number(e.target.value) }))}>
            {VATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </Grid>
      <AreaField label="Default note (Napomena)" value={f.note} onChange={v => setF(s => ({ ...s, note: v }))} />
      <Button variant="primary" onClick={save}>Save settings</Button>
    </>
  );
}
