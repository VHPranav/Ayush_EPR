"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import type { ClinicalPayload, ClinicalRecord, Patient } from "@/lib/types";
import { AreaField, Button, Card, Empty, Grid, PageHead, Pill, RequirePatient, SelectField, TextField } from "@/components/ui";

const PRAKRITI = ["Vata", "Pitta", "Kapha", "Vata-Pitta", "Pitta-Kapha", "Vata-Kapha", "Tridoshic"];
const AGNI = ["Sama", "Manda", "Tikshna", "Vishama"];
const AMA = ["Present", "Absent", "Uncertain"];
const NOTE_TYPES = ["Consultation", "Progress / SOAP", "Ayurveda", "Panchakarma", "Yoga", "Dietitian", "Administrative"];
const VITALS = [["bp", "BP"], ["pulse", "Pulse"], ["temp", "Temperature"], ["spo2", "SpO₂"], ["height", "Height"], ["weight", "Weight"], ["bmi", "BMI"], ["rr", "Respiratory rate"]] as const;

type Form = ReturnType<typeof fromRecord>;

// Maps the latest saved INTEGRATED_CLINICAL_ASSESSMENT payload to form state (blank when none).
function fromRecord(p: ClinicalPayload = {}) {
  const v = p.vitals ?? {};
  return {
    cc: p.chiefComplaints ?? "", hpi: p.hpi ?? "", past: p.pastHistory ?? "", family: p.familyHistory ?? "",
    bp: v.bp ?? "", pulse: v.pulse ?? "", temp: v.temp ?? "", spo2: v.spo2 ?? "",
    height: v.height ?? "", weight: v.weight ?? "", bmi: v.bmi ?? "", rr: v.rr ?? "",
    modernDx: p.modernDiagnosis ?? "",
    prakriti: p.prakriti ?? "Vata", vikriti: p.vikriti ?? "", agni: p.agni ?? "Sama", ama: p.ama ?? "Present",
    ashta: p.ashtavidha ?? "", ayurDx: p.ayurvedaDiagnosis ?? "",
    modernFind: p.modernFindings ?? "", ayurFind: p.ayurvedaFindings ?? "", corr: p.correlation ?? "",
    impression: p.integratedImpression ?? "", goals: p.goalsSafety ?? "",
  };
}

function toPayload(f: Form) {
  return {
    chiefComplaints: f.cc, hpi: f.hpi, pastHistory: f.past, familyHistory: f.family,
    vitals: { bp: f.bp, pulse: f.pulse, temp: f.temp, spo2: f.spo2, height: f.height, weight: f.weight, bmi: f.bmi, rr: f.rr },
    modernDiagnosis: f.modernDx, prakriti: f.prakriti, vikriti: f.vikriti, agni: f.agni, ama: f.ama,
    ashtavidha: f.ashta, ayurvedaDiagnosis: f.ayurDx, modernFindings: f.modernFind, ayurvedaFindings: f.ayurFind,
    correlation: f.corr, integratedImpression: f.impression, goalsSafety: f.goals,
  };
}

export default function DoctorPage() {
  return (
    <>
      <PageHead title="Doctor — Complete Clinical Record" subtitle="Modern assessment + Ayurveda assessment + clinician-authored integrated correlation." />
      <RequirePatient><Record /></RequirePatient>
    </>
  );
}

function Record() {
  const { patient } = usePatient();
  const latest = patient!.clinicalRecords.find(r => r.section === "INTEGRATED_CLINICAL_ASSESSMENT");
  // Re-key so the form re-initialises when another patient is opened or a new assessment is saved.
  return (
    <>
      <AssessmentForm key={patient!.patient_id + (latest?.record_id ?? "")} latest={latest} patient={patient!} />
      <Notes />
    </>
  );
}

function AssessmentForm({ latest, patient }: { latest?: ClinicalRecord; patient: Patient }) {
  const { refresh } = usePatient();
  const { can } = useAuth();
  const canWrite = can("clinical.write");
  const toast = useToast();
  const [f, setF] = useState<Form>(() => fromRecord(latest?.payload ?? {}));
  const set = (k: keyof Form) => (v: string) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    try {
      await api(`/api/patients/${patient.patient_id}/clinical-records`, { body: { section: "INTEGRATED_CLINICAL_ASSESSMENT", payload: toPayload(f) } });
      await refresh();
      toast("Clinical record saved centrally");
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <fieldset disabled={!canWrite} className="m-0 min-w-0 border-0 p-0">
      <Card title="Modern Clinical Assessment">
        <Grid cols={3}>
          <AreaField label="Chief complaints" value={f.cc} onChange={set("cc")} />
          <AreaField label="HPI" value={f.hpi} onChange={set("hpi")} />
          <AreaField label="Past medical/surgical history" value={f.past} onChange={set("past")} />
        </Grid>
        <Grid cols={4}>
          {VITALS.map(([k, label]) => <TextField key={k} label={label} value={f[k]} onChange={set(k)} />)}
        </Grid>
        <Grid cols={2}>
          <AreaField label="Family/social/lifestyle" value={f.family} onChange={set("family")} />
          <AreaField label="Modern diagnosis / assessment" value={f.modernDx} onChange={set("modernDx")} />
        </Grid>
      </Card>

      <Card title="Ayurveda Assessment">
        <Grid cols={4}>
          <SelectField label="Prakriti" value={f.prakriti} onChange={set("prakriti")} options={PRAKRITI} />
          <TextField label="Vikriti" value={f.vikriti} onChange={set("vikriti")} />
          <SelectField label="Agni" value={f.agni} onChange={set("agni")} options={AGNI} />
          <SelectField label="Ama" value={f.ama} onChange={set("ama")} options={AMA} />
        </Grid>
        <Grid cols={2}>
          <AreaField label="Ashtavidha Pariksha" value={f.ashta} onChange={set("ashta")} />
          <AreaField label="Ayurvedic diagnosis / assessment" value={f.ayurDx} onChange={set("ayurDx")} />
        </Grid>
      </Card>

      <Card title="Integrated Clinical Correlation" aside={<Pill>Clinician authored</Pill>}>
        <Grid cols={2}>
          <AreaField label="Modern findings" value={f.modernFind} onChange={set("modernFind")} />
          <AreaField label="Ayurveda findings" value={f.ayurFind} onChange={set("ayurFind")} />
        </Grid>
        <AreaField label="Correlation" value={f.corr} onChange={set("corr")} />
        <Grid cols={2}>
          <AreaField label="Integrated impression" value={f.impression} onChange={set("impression")} />
          <AreaField label="Goals / safety / monitoring" value={f.goals} onChange={set("goals")} />
        </Grid>
        {canWrite && <Button variant="primary" onClick={save}>Save clinical record</Button>}
      </Card>
    </fieldset>
  );
}

function Notes() {
  const { patient, refresh } = usePatient();
  const { can } = useAuth();
  const toast = useToast();
  const [type, setType] = useState(NOTE_TYPES[0]);
  const [text, setText] = useState("");
  const notes = patient!.clinicalRecords.filter(r => r.section === "NOTE");

  async function save() {
    try {
      await api(`/api/patients/${patient!.patient_id}/clinical-records`, { body: { section: "NOTE", payload: { type, text } } });
      setText("");
      await refresh();
      toast("Note saved centrally");
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <Card title="Notes">
      {can("clinical.write") && (
        <>
          <Grid cols={2}>
            <SelectField label="Type" value={type} onChange={setType} options={NOTE_TYPES} />
            <AreaField label="Note" value={text} onChange={setText} />
          </Grid>
          <Button variant="primary" onClick={save}>Save note</Button>
        </>
      )}
      {notes.length ? notes.map(n => (
        <div key={n.record_id} className="border-b border-line p-2">
          <b>{n.payload?.type || "Note"}</b> • {fmtDateTime(n.created_at)}<br />{n.payload?.text || ""}
        </div>
      )) : <Empty>No notes.</Empty>}
    </Card>
  );
}
