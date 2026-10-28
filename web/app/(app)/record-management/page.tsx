"use client";
import { useState } from "react";
import { api, DEMO } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePatient } from "@/lib/patient";
import { useFetch } from "@/lib/use-fetch";
import { useToast } from "@/lib/toast";
import { errMsg, fmtDateTime } from "@/lib/format";
import type { Allergy, Problem, ClinicalRecord } from "@/lib/types";
import { AreaField, Button, Card, Empty, Grid, PageHead, RequirePatient, SelectField, TextField, Pill } from "@/components/ui";

export default function RecordManagementPage() {
  return <><PageHead title="Record management" subtitle="Manage visits and correct records. Corrections retain the original values, author, time and reason." />
    <RequirePatient>{DEMO ? <Card><Empty>Visit management and corrections are available in the connected application.</Empty></Card> : <Management />}</RequirePatient></>;
}

function Management() {
  const { can } = useAuth();
  const { patient, refresh } = usePatient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("OPD");
  const id = patient!.patient_id;
  const [revision, setRevision] = useState(0);
  async function mutate(path: string, body: unknown, method = "POST") {
    if (busy) return false;
    setBusy(true);
    try { await api(path, { body, method }); await refresh(); setRevision(n => n + 1); toast("Record saved"); return true; }
    catch (e) { toast(errMsg(e)); return false; }
    finally { setBusy(false); }
  }
  return <fieldset disabled={busy}>
    {can("clinical.read") && <Card title="Visits">
      <p className="text-sm text-muted">New assessments, prescriptions and supported clinical modules are linked to the open visit. Close the visit after completing documentation. Historical records remain available.</p>
      {can("chart.write") && !(patient!.encounters ?? []).some(e => e.status === "OPEN") && <div className="flex items-end gap-3"><SelectField label="Visit type" value={type} onChange={setType} options={["OPD","IPD","FOLLOWUP","THERAPY"]} /><Button onClick={() => mutate(`/api/patients/${id}/encounters`, { type })}>Start visit</Button></div>}
      {(patient!.encounters ?? []).map(e => <div key={e.encounter_id} className="my-3 flex flex-wrap items-center gap-3"><b>{e.encounter_type}</b><Pill>{e.status}</Pill>{fmtDateTime(e.started_at)}{e.ended_at && ` · Closed ${fmtDateTime(e.ended_at)}`}{e.status === "OPEN" && can("chart.write") && <Button onClick={() => { if (window.confirm("Close this visit? Finish and save its documentation first.")) void mutate(`/api/patients/${id}/encounters/${e.encounter_id}/close`, {}); }}>Close visit</Button>}</div>)}
    </Card>}
    {can("patients.register") && <Demographics key={`${id}-${revision}`} mutate={mutate} />}
    {can("chart.write") && <StatusCorrections key={`problems-${revision}`} resource="problems" mutate={mutate} />}
    {can("allergies.write") && <StatusCorrections key={`allergies-${revision}`} resource="allergies" mutate={mutate} />}
    {can("clinical.write") && <Amendment key={`records-${revision}`} mutate={mutate} />}
    {can("prescriptions.write") && <CancelPrescription key={`rx-${revision}`} mutate={mutate} />}
    <CorrectionHistory key={`history-${revision}`} />
  </fieldset>;
}
type Mutate = (path: string, body: unknown, method?: string) => Promise<boolean>;
const demographicFields = ["name","dob","sex","phone","email","address"] as const;
function Demographics({ mutate }: { mutate: Mutate }) {
  const { patient } = usePatient();
  const p = patient!;
  const [form, setForm] = useState(() => Object.fromEntries(demographicFields.map(k => [k, p[k] ?? ""])));
  const [reason, setReason] = useState("");
  return <Card title="Correct patient details"><Grid cols={2}>{demographicFields.map(k => <TextField key={k} label={k === "dob" ? "Date of birth" : k[0].toUpperCase() + k.slice(1)} type={k === "dob" ? "date" : "text"} value={form[k]} onChange={value => setForm(f => ({ ...f, [k]: value }))} />)}</Grid>
    <AreaField label="Reason for correction" value={reason} onChange={setReason} />
    <Button disabled={reason.trim().length < 5} onClick={() => mutate(`/api/patients/${p.patient_id}`, { ...form, reason, expectedUpdatedAt: p.registered_at, expected: Object.fromEntries(demographicFields.map(k => [k, p[k] ?? null])) }, "PATCH")}>Save correction</Button>
  </Card>;
}
function StatusCorrections({ resource, mutate }: { resource: "problems" | "allergies"; mutate: Mutate }) {
  const { patient } = usePatient();
  const { data, loading, error } = useFetch<(Problem & Allergy)[]>(`/api/patients/${patient!.patient_id}/${resource}`);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("RESOLVED");
  const [reason, setReason] = useState("");
  const row = data?.find(x => x.id === selected);
  return <Card title={`Correct ${resource}`}>
    {error ? <Empty>{error}</Empty> : loading ? <Empty>Loading…</Empty> : <>
      <label className="block">Record<select className="my-2 block w-full rounded border p-2" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose record…</option>{data?.map(r => <option key={r.id} value={r.id}>{r.problem || r.allergen} · {r.status || "ACTIVE"}</option>)}</select></label>
      <SelectField label="New status" value={status} onChange={setStatus} options={resource === "problems" ? ["ACTIVE","RESOLVED","HISTORICAL","ENTERED_IN_ERROR"] : ["ACTIVE","RESOLVED","ENTERED_IN_ERROR"]} />
      <AreaField label="Reason for status change" value={reason} onChange={setReason} />
      <Button disabled={!row || reason.trim().length < 5 || (row.status || "ACTIVE") === status} onClick={() => mutate(`/api/patients/${patient!.patient_id}/${resource}/${selected}`, { status, reason, expectedStatus: row?.status || "ACTIVE" }, "PATCH")}>Save status correction</Button>
    </>}
  </Card>;
}
function Amendment({ mutate }: { mutate: Mutate }) {
  const { patient } = usePatient();
  const [selected, setSelected] = useState("");
  const records = patient!.clinicalRecords;
  const superseded = new Set(records.map(r => r.amended_from).filter(Boolean));
  const options = records.filter(r => !superseded.has(r.record_id));
  const row = options.find(r => r.record_id === selected);
  return <Card title="Amend a signed clinical record">
    <p className="text-sm text-muted">Choose the latest version. Signing an amendment creates a new version and keeps the original. This is an authenticated author attestation, not a certificate-based digital signature.</p>
    <label>Record<select className="my-2 block w-full rounded border p-2" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose record…</option>{options.map(r => <option key={r.record_id} value={r.record_id}>{r.section.replaceAll("_", " ")} · {fmtDateTime(r.created_at)} · v{r.version || 1}</option>)}</select></label>
    {row && <AmendmentForm key={row.record_id} record={row} mutate={mutate} />}
  </Card>;
}
function AmendmentForm({ record, mutate }: { record: ClinicalRecord; mutate: Mutate }) {
  const { patient } = usePatient();
  const [payload, setPayload] = useState<Record<string, unknown>>(() => structuredClone({ ...record.payload }));
  const [reason, setReason] = useState("");
  const [attest, setAttest] = useState(false);
  const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  const fields = Object.entries(payload).flatMap(([key, value]) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value).map(([child, v]) => ({ key, child, value: v })) : [{ key, child: "", value }]);
  const editable = fields.every(f => typeof f.value === "string" || f.value === null || typeof f.value === "number");
  if (!editable || !fields.length) return <Empty>This record format needs a dedicated correction form. Add a dated explanatory note and refer to the original record ID: {record.record_id}.</Empty>;
  return <>
    {fields.map(f => <AreaField key={`${f.key}.${f.child}`} label={`${label(f.key)}${f.child ? ` — ${label(f.child)}` : ""}`} value={String(f.value ?? "")} onChange={value => setPayload(p => ({ ...p, [f.key]: f.child ? { ...(p[f.key] as object), [f.child]: value } : value }))} />)}
    <AreaField label="Reason for amendment" value={reason} onChange={setReason} />
    <label className="my-3 block"><input type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)} /> I reviewed this amendment and confirm it is accurate for {patient!.name} ({patient!.uhid}).</label>
    <Button variant="primary" disabled={!attest || reason.trim().length < 5} onClick={() => mutate(`/api/patients/${patient!.patient_id}/clinical-records`, { section: record.section, payload, amendedFrom: record.record_id, amendmentReason: reason })}>Sign amendment</Button>
  </>;
}
function CancelPrescription({ mutate }: { mutate: Mutate }) {
  const { patient } = usePatient();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  return <Card title="Cancel an undispensed prescription"><p className="text-sm text-muted">The prescription stays in the chart and leaves the dispensing queue. Issue a new prescription separately if needed. Dispensed prescriptions require clinician and pharmacist review.</p>
    <label>Prescription<select className="my-2 block w-full rounded border p-2" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose prescription…</option>{patient!.prescriptions.filter(r => r.status === "ISSUED").map(r => <option key={r.prescription_id} value={r.prescription_id}>{r.prescription_no} · {fmtDateTime(r.prescribed_at)}</option>)}</select></label>
    <AreaField label="Reason for cancellation" value={reason} onChange={setReason} />
    <Button variant="danger" disabled={!selected || reason.trim().length < 5} onClick={() => mutate(`/api/patients/${patient!.patient_id}/prescriptions/${selected}/cancel`, { reason })}>Cancel prescription</Button>
  </Card>;
}
interface Correction { change_id: string; resource: string; changed_at: string; author_name: string; reason: string; before_data: Record<string, unknown>; after_data: Record<string, unknown> }
function CorrectionHistory() {
  const { patient } = usePatient();
  const { data, error, loading } = useFetch<Correction[]>(`/api/patients/${patient!.patient_id}/corrections`);
  const amendments = patient!.clinicalRecords.filter(r => r.amended_from);
  return <Card title="Correction history">
    {error ? <Empty>{error}</Empty> : loading ? <Empty>Loading…</Empty> : data?.map(c => <div className="my-3 border-b pb-3" key={c.change_id}><b>{c.resource.replaceAll("_", " ")}</b> · {fmtDateTime(c.changed_at)} · {c.author_name}<p>{c.reason}</p>{Object.keys(c.after_data).filter(k => JSON.stringify(c.before_data[k]) !== JSON.stringify(c.after_data[k])).map(k => <p key={k}>{k}: {String(c.before_data[k] ?? "—")} → {String(c.after_data[k] ?? "—")}</p>)}</div>)}
    {amendments.map(r => <div key={r.record_id} className="my-3 border-b pb-3"><b>{r.section.replaceAll("_", " ")} · Version {r.version}</b> · {fmtDateTime(r.created_at)} · {r.author_name}<p>{r.amendment_reason}</p><details><summary>Original and amended record</summary><pre className="whitespace-pre-wrap">{JSON.stringify(patient!.clinicalRecords.find(o => o.record_id === r.amended_from)?.payload, null, 2)}</pre><pre className="whitespace-pre-wrap">{JSON.stringify(r.payload, null, 2)}</pre></details></div>)}
    {!loading && !error && !data?.length && !amendments.length && <Empty>No corrections recorded.</Empty>}
  </Card>;
}
