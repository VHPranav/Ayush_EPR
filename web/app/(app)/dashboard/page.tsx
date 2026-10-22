"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AreaChart, Delta, type Point } from "@/components/charts";
import { Avatar, Button, Card, Empty, PageHead, Pill, StatCard, Table, Td } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate, fmtDateTime, money as fmtMoney } from "@/lib/format";
import { actionLabel, detailText } from "@/lib/audit-labels";
import { usePatient } from "@/lib/patient";
import { patientHome } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { useToast } from "@/lib/toast";
import type { AuditEntry, FollowUp, InvoiceRow, InvoiceSummary, PatientSummary, StockItem } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";

type Range = 6 | 12;
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const DAY = 86_400_000;
// "Dr. Kavita Rao" -> "Kavita" (skip honorifics when greeting)
const firstName = (full: string) => full.replace(/^(dr|nurse|mr|mrs|ms|prof)\.?\s+/i, "").split(" ")[0];

/** Registrations per calendar month for the last `months` months (oldest first), from the server's per-month counts. */
function monthlySeries(rows: { month: string; n: number }[], months: number): Point[] {
  const base = monthKey(new Date());
  const counts = new Map<number, number>();
  for (const r of rows) {
    const [y, m] = r.month.split("-").map(Number);
    counts.set(y * 12 + (m - 1), r.n);
  }
  return Array.from({ length: months }, (_, i) => {
    const k = base - (months - 1 - i);
    return { label: new Date(Math.floor(k / 12), k % 12, 1).toLocaleString(undefined, { month: "short" }), value: counts.get(k) ?? 0 };
  });
}

const daysUntil = (iso: string | null, now: number) => {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Math.ceil((new Date(+m[1], +m[2] - 1, +m[3]).getTime() - now) / DAY) : Infinity;
};

const COLS: Record<number, string> = { 1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4" };

export default function DashboardPage() {
  const { user, can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { open } = usePatient();
  const [range, setRange] = useState<Range>(6);
  // Wall-clock time must not be read during the server prerender (it would be frozen into the page),
  // so "now" is null until the page has mounted in the browser.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  // Each source is only requested when the role may read it, so no widget ever shows a 403.
  const dispenser = can("pharmacy.write"); // pharmacist: the dashboard is about dispensing and stock, not registrations
  const showMoney = can("billing.read");
  // Finance and the pharmacist have no patient-flow duties, so their dashboards skip registration figures.
  const showPatients = can("patients.view") && !dispenser && !(showMoney && !can("appointments.read"));
  const showChart = showPatients && (can("patients.register") || can("billing.read"));
  const showAppts = can("appointments.read");
  const showStock = can("pharmacy.read");
  const showAudit = can("audit.read");

  const patients = useFetch<PatientSummary[]>(showPatients ? "/api/patients?q=" : null);
  const stats = useFetch<{ total: number; months: { month: string; n: number }[] }>(showPatients ? "/api/stats/patients" : null);
  const followups = useFetch<FollowUp[]>(showAppts ? "/api/reception/followups?days=14" : null);
  const stock = useFetch<StockItem[]>(showStock ? "/api/pharmacy/stock" : null);
  const queue = useFetch<unknown[]>(dispenser ? "/api/pharmacy/queue" : null);
  const money = useFetch<{ summary: InvoiceSummary; invoices: InvoiceRow[] }>(showMoney ? "/api/billing/invoices?status=OPEN" : null);
  const audit = useFetch<AuditEntry[]>(showAudit ? "/api/audit" : null);

  const series = useMemo(() => (stats.data ? monthlySeries(stats.data.months, range) : null), [stats.data, range]);
  const thisMonth = series?.[series.length - 1]?.value ?? 0;
  const lastMonth = series?.[series.length - 2]?.value ?? 0;

  const lowStock = useMemo(() => stock.data?.filter(s => s.low_stock) ?? [], [stock.data]);
  const expiring = useMemo(() => (now === null ? [] : stock.data?.filter(s => daysUntil(s.expiry_date, now) <= 30) ?? []), [stock.data, now]);
  const attention = useMemo(() => {
    const seen = new Set<string>();
    return [...lowStock, ...expiring].filter(s => (seen.has(s.stock_id) ? false : (seen.add(s.stock_id), true)));
  }, [lowStock, expiring]);

  const recentAudit = useMemo(() => (now === null ? [] : audit.data?.filter(e => new Date(e.event_time).getTime() >= now - DAY) ?? []), [audit.data, now]);
  const failedLogins = recentAudit.filter(e => e.action === "LOGIN_FAILURE").length;

  const num = (f: { loading: boolean; error: string }, v: number | string) => (f.loading ? "…" : f.error ? "—" : v);

  const cards: ReactNode[] = [];
  if (showPatients) {
    cards.push(<StatCard key="p" label="Patients" value={num(stats, stats.data?.total ?? 0)} />);
    cards.push(
      <StatCard key="n" label="New this month" value={num(stats, thisMonth)}
        hint={!stats.loading && !stats.error ? <Delta value={thisMonth - lastMonth} label=" vs last month" /> : null} />,
    );
  }
  if (showAppts) cards.push(<StatCard key="a" label="Appointments · 14 days" value={num(followups, followups.data?.length ?? 0)} />);
  if (showMoney) {
    const s = money.data?.summary;
    cards.push(<StatCard key="out" label="Outstanding" value={num(money, s ? fmtMoney(s.open_total) : 0)} hint={s?.open_count ? <Link href="/billing" className="font-semibold text-brand hover:underline">{s.open_count} open invoice{s.open_count === 1 ? "" : "s"}</Link> : null} />);
    cards.push(<StatCard key="inv" label="Invoiced this month" value={num(money, s ? fmtMoney(s.invoiced_month) : 0)} />);
  }
  if (dispenser) {
    cards.push(
      <StatCard key="q" label="Prescriptions to dispense" value={num(queue, queue.data?.length ?? 0)}
        hint={queue.data?.length ? <Link href="/dispensing" className="font-semibold text-brand hover:underline">Open dispensing</Link> : null} />,
    );
  }
  if (showStock) {
    cards.push(
      <StatCard key="l" label="Low-stock medicines" value={num(stock, lowStock.length)}
        hint={lowStock.length ? <Pill tone="amber">Needs reorder</Pill> : null} />,
    );
    cards.push(
      <StatCard key="e" label="Expiring within 30 days" value={num({ loading: stock.loading || now === null, error: stock.error }, expiring.length)}
        hint={expiring.length ? <Pill tone="red">Check batches</Pill> : null} />,
    );
  }
  if (showAudit) {
    cards.push(<StatCard key="ev" label="Audit events · last 24h" value={num({ loading: audit.loading || now === null, error: audit.error }, recentAudit.length)} />);
    cards.push(
      <StatCard key="fl" label="Failed logins · last 24h" value={num({ loading: audit.loading || now === null, error: audit.error }, failedLogins)}
        hint={failedLogins ? <Pill tone="red">Review</Pill> : null} />,
    );
  }
  const shown = cards.slice(0, 4); // keep the headline row to four cards

  async function openPatient(id: string) {
    try {
      await open(id);
      router.push(patientHome(can));
    } catch (e) {
      toast(errMsg(e));
    }
  }

  const apptPanel = showAppts && (
    <Card title="Upcoming appointments" bodyClass="p-0">
      {followups.error ? <Empty>Could not load: {followups.error}</Empty> : followups.loading ? <Empty>Loading…</Empty> : followups.data?.length ? (
        <ul className="m-0 list-none divide-y divide-line p-0">
          {/* The signed-in doctor's own appointments come first; clicking a row opens that patient. */}
          {[...followups.data].sort((a, b) => Number(b.provider_user === user?.id) - Number(a.provider_user === user?.id)).slice(0, 6).map((a, i) => (
            <li key={a.appointment_id ?? i}>
              <button type="button" disabled={!a.patient_id || !can("patients.view")} onClick={() => a.patient_id && openPatient(a.patient_id)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left enabled:hover:bg-subtle">
                <Avatar name={a.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{a.name}</div>
                  <div className="truncate text-xs text-muted">{fmtDateTime(a.appointment_at)} · {a.type || "Appointment"}</div>
                </div>
                {a.provider_user && a.provider_user === user?.id && <Pill>Yours</Pill>}
              </button>
            </li>
          ))}
        </ul>
      ) : <Empty>No appointments in the next 14 days.</Empty>}
      <div className="border-t border-line px-5 py-3 text-sm"><Link href="/appointments" className="font-semibold text-brand hover:underline">View all appointments</Link></div>
    </Card>
  );

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle={`Welcome back${user ? `, ${firstName(user.name)}` : ""}. ${user ? `Signed in as ${user.roles.map(roleLabel).join(", ")}.` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {can("patients.register") && <Link href="/reception"><Button variant="primary">Register patient</Button></Link>}
            {can("pharmacy.write") && <Link href="/dispensing"><Button variant="primary">Dispense</Button></Link>}
            {can("pharmacy.write") && <Link href="/pharmacy"><Button>Add stock</Button></Link>}
            {can("audit.read") && <Link href="/audit"><Button>Open audit log</Button></Link>}
          </div>
        }
      />

      {shown.length > 0 && <div className={`mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2 ${COLS[shown.length]}`}>{shown}</div>}

      {(showChart || showAppts) && (
        <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
          {showChart && (
            <section className={`rounded-2xl bg-white p-6 shadow-card ${showAppts ? "xl:col-span-2" : "xl:col-span-3"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-ink">New patients</div>
                  <div className="mt-3 text-[32px] font-semibold leading-9 tracking-tight text-ink">{series ? series.reduce((s, p) => s + p.value, 0) : "…"}</div>
                </div>
                <div className="flex gap-1 text-sm font-medium" role="tablist" aria-label="Range">
                  {([6, 12] as Range[]).map(r => (
                    <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}
                      className={`whitespace-nowrap rounded-md px-2.5 py-1 ${range === r ? "bg-hover text-ink" : "text-muted hover:text-ink"}`}>
                      {r} months
                    </button>
                  ))}
                </div>
              </div>
              {series ? <AreaChart data={series} /> : <Empty>{stats.error ? `Could not load: ${stats.error}` : "Loading…"}</Empty>}
            </section>
          )}
          {apptPanel}
        </div>
      )}

      {showMoney && (
        <Card title="Open invoices" aside={<Link href="/billing" className="text-sm font-semibold text-brand hover:underline">View all</Link>}>
          {money.error ? <Empty>Could not load: {money.error}</Empty> : money.loading ? <Empty>Loading…</Empty> : money.data?.invoices.length ? (
            <Table head={["Invoice", "Date", "Patient", "Total"]}>
              {money.data.invoices.slice(0, 5).map(i => (
                <tr key={i.id}><Td>{i.invoice_number}</Td><Td>{fmtDate(i.account_date)}</Td><Td>{i.name}</Td><Td>{fmtMoney(i.total)}</Td></tr>
              ))}
            </Table>
          ) : <Empty>No open invoices. Everything is paid.</Empty>}
        </Card>
      )}

      {showStock && (
        <Card title="Pharmacy attention" aside={<Link href="/pharmacy" className="text-sm font-semibold text-brand hover:underline">Open pharmacy</Link>}>
          {stock.error ? <Empty>Could not load: {stock.error}</Empty> : stock.loading ? <Empty>Loading…</Empty> : attention.length ? (
            <Table head={["Medicine", "Batch", "Expiry", "Qty", "Reorder level", "Status"]}>
              {attention.slice(0, 8).map(s => {
                const d = now === null ? Infinity : daysUntil(s.expiry_date, now);
                return (
                  <tr key={s.stock_id}>
                    <Td>{s.medicine_name}</Td><Td>{s.batch_no || "—"}</Td><Td>{fmtDate(s.expiry_date)}</Td><Td>{s.quantity}</Td><Td>{s.reorder_level}</Td>
                    <Td>
                      <span className="flex gap-1.5">
                        {s.low_stock && <Pill tone="amber">Low stock</Pill>}
                        {d <= 30 && <Pill tone="red">{d < 0 ? "Expired" : `Expires in ${d}d`}</Pill>}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : <Empty>Nothing needs attention — stock levels and expiry dates look fine.</Empty>}
        </Card>
      )}

      {showAudit && (
        <Card title="Recent audit activity" aside={<Link href="/audit" className="text-sm font-semibold text-brand hover:underline">View all</Link>}>
          {audit.error ? <Empty>Could not load: {audit.error}</Empty> : audit.loading ? <Empty>Loading…</Empty> : audit.data?.length ? (
            <Table head={["Time", "User", "Action", "Details"]}>
              {audit.data.slice(0, 8).map((e, i) => (
                <tr key={e.audit_id ?? i}><Td>{fmtDateTime(e.event_time)}</Td><Td>{e.username || "—"}</Td><Td>{actionLabel(e.action)}</Td><Td><span className="text-xs text-muted">{detailText(e.details)}</span></Td></tr>
              ))}
            </Table>
          ) : <Empty>No audit events yet.</Empty>}
        </Card>
      )}

      {showPatients && (
        <Card title="Recent patients" aside={<Link href="/reception" className="text-sm font-semibold text-brand hover:underline">View directory</Link>}>
          {patients.error ? <Empty>Could not load: {patients.error}</Empty> : patients.loading ? <Empty>Loading…</Empty> : patients.data?.length ? (
            <Table head={["UHID", "Name", "DOB", "Sex", "Phone", ""]}>
              {patients.data.slice(0, 5).map(p => (
                <tr key={p.patient_id}>
                  <Td>{p.uhid}</Td><Td>{p.name}</Td><Td>{fmtDate(p.dob)}</Td><Td>{p.sex || "—"}</Td><Td>{p.phone || "—"}</Td>
                  <Td><Button onClick={() => openPatient(p.patient_id)}>Open</Button></Td>
                </tr>
              ))}
            </Table>
          ) : <Empty>No patients yet.</Empty>}
        </Card>
      )}
    </>
  );
}
