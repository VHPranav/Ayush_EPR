"use client";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import { useAuth } from "@/lib/auth";
import { usePatientData } from "@/lib/use-patient-data";
import type { Administration, Allergy, CarePlan, ClinicalRecord, Investigation, MedRec, Outcome, Problem, Referral } from "@/lib/types";
import { Button, Card, DataList, Grid, Input, PageHead, Pill, RequirePatient, Select, Textarea, ViewOnly } from "@/components/ui";

export default function ClinicalPage() {
  return (
    <>
      <PageHead title="Clinical Modules" subtitle="Problems, allergies, medication reconciliation, investigations, outcomes, referrals and integrated care plans." />
      <RequirePatient>
        <ClinicalViewOnly />
        {/* Single column until there is room for two cards side by side, so inputs stay readable. */}
        <div className="grid grid-cols-1 gap-x-5 xl:grid-cols-2 xl:items-start"><VitalsCard /><AdministrationCard /></div>
        <div className="grid grid-cols-1 gap-x-5 xl:grid-cols-2 xl:items-start"><ProblemsCard /><AllergiesCard /></div>
        <div className="grid grid-cols-1 gap-x-5 xl:grid-cols-2 xl:items-start"><ReconciliationCard /><InvestigationsCard /></div>
        <div className="grid grid-cols-1 gap-x-5 xl:grid-cols-2 xl:items-start"><OutcomesCard /><ReferralsCard /></div>
        <CarePlanCard />
      </RequirePatient>
    </>
  );
}

function ClinicalViewOnly() {
  const { can } = useAuth();
  return can("clinical.write") || can("chart.write") || can("allergies.write") ? null : <ViewOnly what="these records" />;
}

const Item = ({ children }: { children: ReactNode }) => <p className="my-2">{children}</p>;
const Stack = ({ children }: { children: ReactNode }) => <div className="space-y-2">{children}</div>;

const VITAL_FIELDS = [["bp", "BP (mmHg)"], ["pulse", "Pulse (/min)"], ["temp", "Temp (°C)"], ["spo2", "SpO₂ (%)"], ["rr", "Resp. rate"], ["height", "Height (cm)"], ["weight", "Weight (kg)"]] as const;

/** Quick observations for nurses: saved as their own dated entries, separate from the doctor's assessment. */
function VitalsCard() {
  const { can } = useAuth();
  const { patient, refresh } = usePatient();
  const toast = useToast();
  const blank = { bp: "", pulse: "", temp: "", spo2: "", rr: "", height: "", weight: "" };
  const [f, setF] = useState(blank);
  const h = Number(f.height) / 100, w = Number(f.weight);
  const bmi = h > 0 && w > 0 ? (w / (h * h)).toFixed(1) : "";
  const recent = (patient!.clinicalRecords as ClinicalRecord[]).filter(r => r.section === "VITALS").slice(0, 5);
  async function save() {
    if (!Object.values(f).some(v => v.trim())) return toast("Enter at least one reading");
    try {
      await api(`/api/patients/${patient!.patient_id}/clinical-records`, { body: { section: "VITALS", payload: { ...f, bmi } } });
      setF(blank);
      await refresh();
      toast("Vitals saved");
    } catch (e) {
      toast(errMsg(e));
    }
  }
  return (
    <Card title="Vitals / observations">
      {can("clinical.write") && (
        <Stack>
          <Grid cols={4}>
            {VITAL_FIELDS.map(([k, label]) => (
              <label key={k} className="block"><span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
                <Input value={f[k]} onChange={e => setF(s => ({ ...s, [k]: e.target.value }))} /></label>
            ))}
            <label className="block"><span className="mb-1 block text-xs font-medium text-ink-2">BMI (auto)</span><Input value={bmi} readOnly /></label>
          </Grid>
          <Button variant="primary" onClick={save}>Save vitals</Button>
        </Stack>
      )}
      {recent.length ? recent.map(r => {
        const v = (r.payload ?? {}) as Record<string, string>;
        const parts = [["BP", v.bp], ["Pulse", v.pulse], ["Temp", v.temp], ["SpO₂", v.spo2], ["RR", v.rr], ["Ht", v.height], ["Wt", v.weight], ["BMI", v.bmi]].filter(([, x]) => x);
        return <Item key={r.record_id}><b>{fmtDateTime(r.created_at)}</b>{r.author_name ? ` · ${r.author_name}` : ""}<br />{parts.map(([k, x]) => `${k} ${x}`).join(" · ")}</Item>;
      }) : <p className="my-3 text-sm text-muted">No vitals recorded yet.</p>}
    </Card>
  );
}

/** Medication round: records what was given, refused or held, against the patient's prescribed medicines. */
function AdministrationCard() {
  const { can } = useAuth();
  const { patient } = usePatient();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Administration[]>(`/api/patients/${patient!.patient_id}/administrations`);
  const meds = (patient!.prescriptions ?? []).flatMap(rx => (rx.medicines ?? []).map(m => ({ ...m, rx: rx.prescription_no })));
  const [medId, setMedId] = useState("");
  const [status, setStatus] = useState("GIVEN");
  const [notes, setNotes] = useState("");
  const [adverse, setAdverse] = useState("");
  async function save() {
    const m = meds.find(x => x.row_id === medId);
    if (!m) return toast("Choose the medicine");
    try {
      await api(`/api/patients/${patient!.patient_id}/administrations`, { body: { prescriptionMedicineId: m.row_id, dose: m.dose, status, notes, adverseEvent: adverse } });
      setMedId(""); setNotes(""); setAdverse(""); setStatus("GIVEN");
      toast("Medication record saved");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }
  return (
    <Card title="Medication given">
      {can("chart.write") && (meds.length ? (
        <Stack>
          <Select aria-label="Medicine" value={medId} onChange={e => setMedId(e.target.value)}>
            <option value="">Choose a prescribed medicine…</option>
            {meds.map(m => <option key={m.row_id} value={m.row_id}>{m.medicine_name}{m.dose ? ` · ${m.dose}` : ""}{m.frequency ? ` · ${m.frequency}` : ""} ({m.rx})</option>)}
          </Select>
          <Grid cols={2}>
            <Select aria-label="Outcome" value={status} onChange={e => setStatus(e.target.value)}>{["GIVEN", "REFUSED", "HELD"].map(o => <option key={o}>{o}</option>)}</Select>
            <Input placeholder="Adverse reaction (if any)" aria-label="Adverse reaction" value={adverse} onChange={e => setAdverse(e.target.value)} />
          </Grid>
          <Textarea placeholder="Notes" aria-label="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          <Button variant="primary" onClick={save}>Record</Button>
        </Stack>
      ) : <p className="my-2 text-sm text-muted">No prescribed medicines for this patient yet.</p>)}
      <DataList items={data} loading={loading} error={error} empty="Nothing recorded yet." render={x => (
        <Item key={x.id}><b>{x.medicine_name ?? "Medicine"}</b> <Pill tone={x.status === "GIVEN" ? "green" : "amber"}>{x.status}</Pill> <span className="text-sm text-muted">{fmtDateTime(x.administered_at)}{x.administered_by_name ? ` · ${x.administered_by_name}` : ""}</span>{x.adverse_event ? <><br /><span className="text-danger">Reaction: {x.adverse_event}</span></> : null}{x.notes ? <><br />{x.notes}</> : null}</Item>
      )} />
    </Card>
  );
}

function ProblemsCard() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<Problem[]>("problems");
  const [problem, setProblem] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [notes, setNotes] = useState("");
  async function save() {
    if (await post({ problem, status, notes }, "Problem saved")) { setProblem(""); setNotes(""); }
  }
  return (
    <Card title="Problems">
      {can("chart.write") && (
      <Stack>
        <Grid cols={2}>
          <Input placeholder="Problem / diagnosis" value={problem} onChange={e => setProblem(e.target.value)} />
          <Select value={status} onChange={e => setStatus(e.target.value)}>{["ACTIVE", "RESOLVED", "HISTORICAL"].map(o => <option key={o}>{o}</option>)}</Select>
        </Grid>
        <Textarea placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
        <Button variant="primary" onClick={save}>Add Problem</Button>
      </Stack>
      )}
      <DataList items={data} loading={loading} error={error} empty="No problems recorded." render={x => (
        <Item key={x.id}><b>{x.problem}</b> <Pill>{x.status}</Pill><br />{x.notes}</Item>
      )} />
    </Card>
  );
}

function AllergiesCard() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<Allergy[]>("allergies");
  const [allergen, setAllergen] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState("");
  const toast = useToast();
  async function save() {
    if (!allergen.trim()) return toast("Enter the allergen");
    if (await post({ allergen: allergen.trim(), reaction, severity }, "Allergy saved")) { setAllergen(""); setReaction(""); setSeverity(""); }
  }
  return (
    <Card title="Allergies / ADR">
      {can("allergies.write") && (
      <Stack>
        <Grid cols={3}>
          <Input placeholder="Allergen" value={allergen} onChange={e => setAllergen(e.target.value)} />
          <Input placeholder="Reaction" value={reaction} onChange={e => setReaction(e.target.value)} />
          <Select aria-label="Severity" value={severity} onChange={e => setSeverity(e.target.value)}><option value="">Severity…</option>{["Mild", "Moderate", "Severe"].map(o => <option key={o}>{o}</option>)}</Select>
        </Grid>
        <Button variant="primary" onClick={save}>Add Allergy</Button>
      </Stack>
      )}
      <DataList items={data} loading={loading} error={error} empty="No allergies recorded." render={x => (
        <Item key={x.id}><b>{x.allergen}</b>{x.reaction ? ` — ${x.reaction}` : ""}{x.severity ? ` (${x.severity})` : ""}</Item>
      )} />
    </Card>
  );
}

function ReconciliationCard() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<MedRec[]>("medication-reconciliation");
  const [f, setF] = useState({ medicineName: "", dose: "", route: "", frequency: "", source: "" });
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value })) });
  async function save() {
    if (await post(f, "Medication reconciliation saved")) setF({ medicineName: "", dose: "", route: "", frequency: "", source: "" });
  }
  return (
    <Card title="Medication Reconciliation">
      {can("chart.write") && (
      <Stack>
        <Grid cols={4}>
          <Input placeholder="Medicine" {...bind("medicineName")} />
          <Input placeholder="Dose" {...bind("dose")} />
          <Input placeholder="Route" {...bind("route")} />
          <Input placeholder="Frequency" {...bind("frequency")} />
        </Grid>
        <Input placeholder="Source" {...bind("source")} />
        <Button variant="primary" onClick={save}>Add Medication</Button>
      </Stack>
      )}
      <DataList items={data} loading={loading} error={error} empty="No reconciled medicines." render={x => (
        <Item key={x.id}><b>{x.medicine_name}</b> {x.dose} {x.route} {x.frequency}</Item>
      )} />
    </Card>
  );
}

function InvestigationsCard() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<Investigation[]>("investigations");
  const [f, setF] = useState({ type: "", testName: "", requestedDate: "", summary: "" });
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value })) });
  async function save() {
    if (await post(f, "Investigation saved")) setF(s => ({ ...s, testName: "", summary: "" }));
  }
  return (
    <Card title="Investigation / Results">
      {can("chart.write") && (
      <Stack>
        <Grid cols={3}>
          <Input placeholder="Type e.g. MRI" {...bind("type")} />
          <Input placeholder="Test name" {...bind("testName")} />
          <Input type="date" aria-label="Requested date" {...bind("requestedDate")} />
        </Grid>
        <Textarea placeholder="Result summary" {...bind("summary")} />
        <Button variant="primary" onClick={save}>Save Investigation</Button>
      </Stack>
      )}
      <DataList items={data} loading={loading} error={error} empty="No investigations." render={x => (
        <Item key={x.id}><b>{x.test_name}</b> — {x.result_summary || "Pending"}</Item>
      )} />
    </Card>
  );
}

function OutcomesCard() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<Outcome[]>("outcomes");
  const [f, setF] = useState({ domain: "", scaleName: "", score: "", date: "", narrative: "" });
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value })) });
  async function save() {
    if (await post(f, "Outcome saved")) setF({ domain: "", scaleName: "", score: "", date: "", narrative: "" });
  }
  return (
    <Card title="Outcome Measurement">
      {can("outcomes.write") && (
      <Stack>
        <Grid cols={4}>
          <Input placeholder="Domain" {...bind("domain")} />
          <Input placeholder="Scale" {...bind("scaleName")} />
          <Input placeholder="Score" type="number" step="0.01" {...bind("score")} />
          <Input type="date" aria-label="Assessment date" {...bind("date")} />
        </Grid>
        <Textarea placeholder="Clinical narrative" {...bind("narrative")} />
        <Button variant="primary" onClick={save}>Save Outcome</Button>
      </Stack>
      )}
      <DataList items={data} loading={loading} error={error} empty="No outcomes." render={x => (
        <Item key={x.id}><b>{x.domain}</b> {x.scale_name}: {x.score ?? ""} — {x.narrative}</Item>
      )} />
    </Card>
  );
}

function ReferralsCard() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<Referral[]>("referrals");
  const [f, setF] = useState({ referredTo: "", specialty: "", urgency: "ROUTINE", reason: "" });
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value })) });
  async function save() {
    if (await post(f, "Referral saved")) setF(s => ({ ...s, referredTo: "", specialty: "", reason: "" }));
  }
  return (
    <Card title="Referral">
      {can("chart.write") && (
      <Stack>
        <Grid cols={3}>
          <Input placeholder="Referred to" {...bind("referredTo")} />
          <Input placeholder="Specialty" {...bind("specialty")} />
          <Select {...bind("urgency")}>{["ROUTINE", "URGENT", "EMERGENCY"].map(o => <option key={o}>{o}</option>)}</Select>
        </Grid>
        <Textarea placeholder="Reason" {...bind("reason")} />
        <Button variant="primary" onClick={save}>Create Referral</Button>
      </Stack>
      )}
      <DataList items={data} loading={loading} error={error} empty="No referrals." render={x => (
        <Item key={x.id}><b>{x.specialty}</b> → {x.referred_to} <Pill>{x.status}</Pill><br />{x.reason}</Item>
      )} />
    </Card>
  );
}

function CarePlanCard() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<CarePlan[]>("care-plans");
  const [f, setF] = useState({ planType: "INTEGRATED", reviewDate: "", status: "ACTIVE", goals: "", interventions: "", monitoring: "" });
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value })) });
  async function save() {
    if (await post(f, "Care plan saved")) setF(s => ({ ...s, goals: "", interventions: "", monitoring: "" }));
  }
  return (
    <Card title="Integrated Care Plan">
      {can("chart.write") && (
      <Stack>
        <Grid cols={3}>
          <Input aria-label="Plan type" {...bind("planType")} />
          <Input type="date" aria-label="Review date" {...bind("reviewDate")} />
          <Select aria-label="Status" {...bind("status")}>{["ACTIVE", "COMPLETED", "ON HOLD"].map(o => <option key={o}>{o}</option>)}</Select>
        </Grid>
        <Grid cols={3}>
          <Textarea placeholder="Goals" {...bind("goals")} />
          <Textarea placeholder="Interventions" {...bind("interventions")} />
          <Textarea placeholder="Monitoring" {...bind("monitoring")} />
        </Grid>
        <Button variant="primary" onClick={save}>Save Care Plan</Button>
      </Stack>
      )}
      <DataList items={data} loading={loading} error={error} empty="No care plans." render={x => (
        <Item key={x.id}><b>{x.plan_type}</b> — review {x.review_date || "—"} <Pill>{x.status}</Pill></Item>
      )} />
    </Card>
  );
}
