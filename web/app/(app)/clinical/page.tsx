"use client";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { usePatientData } from "@/lib/use-patient-data";
import type { Allergy, CarePlan, Investigation, MedRec, Outcome, Problem, Referral } from "@/lib/types";
import { Button, Card, DataList, Grid, Input, PageHead, Pill, RequirePatient, Select, Textarea } from "@/components/ui";

export default function ClinicalPage() {
  return (
    <>
      <PageHead title="Clinical Modules" subtitle="Problems, allergies, medication reconciliation, investigations, outcomes, referrals and integrated care plans." />
      <RequirePatient>
        <Grid cols={2}><ProblemsCard /><AllergiesCard /></Grid>
        <Grid cols={2}><ReconciliationCard /><InvestigationsCard /></Grid>
        <Grid cols={2}><OutcomesCard /><ReferralsCard /></Grid>
        <CarePlanCard />
      </RequirePatient>
    </>
  );
}

const Item = ({ children }: { children: ReactNode }) => <p className="my-2">{children}</p>;
const Stack = ({ children }: { children: ReactNode }) => <div className="space-y-2">{children}</div>;

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
  const [severity, setSeverity] = useState("Mild");
  async function save() {
    if (await post({ allergen, reaction, severity }, "Allergy saved")) { setAllergen(""); setReaction(""); }
  }
  return (
    <Card title="Allergies / ADR">
      {can("allergies.write") && (
      <Stack>
        <Grid cols={3}>
          <Input placeholder="Allergen" value={allergen} onChange={e => setAllergen(e.target.value)} />
          <Input placeholder="Reaction" value={reaction} onChange={e => setReaction(e.target.value)} />
          <Select value={severity} onChange={e => setSeverity(e.target.value)}>{["Mild", "Moderate", "Severe"].map(o => <option key={o}>{o}</option>)}</Select>
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
