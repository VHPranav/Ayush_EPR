"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import type { ClinicalPayload, ClinicalRecord, Patient } from "@/lib/types";
import { AreaField, Button, Card, Empty, Grid, PageHead, Pill, RequirePatient, SelectField, TextField, ViewOnly } from "@/components/ui";

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
    // No silent defaults: a constitution the doctor did not choose must not be recorded.
    prakriti: p.prakriti ?? "", vikriti: p.vikriti ?? "", agni: p.agni ?? "", ama: p.ama ?? "",
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
  const nurseVitals = patient!.clinicalRecords.find(r => r.section === "VITALS");
  // Re-key so the form re-initialises when another patient is opened or a new assessment is saved.
  return (
    <>
      <AssessmentForm key={patient!.patient_id + (latest?.record_id ?? "") + (nurseVitals?.record_id ?? "")} latest={latest} nurseVitals={nurseVitals} patient={patient!} />
      <PreviousAssessments />
      <Notes />
    </>
  );
}

function AssessmentForm({ latest, nurseVitals, patient }: { latest?: ClinicalRecord; nurseVitals?: ClinicalRecord; patient: Patient }) {
  const { refresh } = usePatient();
  const { can } = useAuth();
  const canWrite = can("clinical.write");
  const toast = useToast();
  // Vitals a nurse recorded after the last assessment pre-fill the form (the doctor can still edit them).
  const [f, setF] = useState<Form>(() => {
    const base = fromRecord(latest?.payload ?? {});
    if (nurseVitals && (!latest || nurseVitals.created_at > latest.created_at)) {
      const v = (nurseVitals.payload ?? {}) as Record<string, string>;
      for (const k of ["bp", "pulse", "temp", "spo2", "height", "weight", "bmi", "rr"] as const) if (v[k]) base[k] = v[k];
    }
    return base;
  });
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const set = (k: keyof Form) => (v: string) => {
    setDirty(true);
    setF(s => {
      const n = { ...s, [k]: v };
      // BMI follows height (cm) and weight (kg) so it never has to be typed.
      if (k === "height" || k === "weight") {
        const h = Number(n.height) / 100, w = Number(n.weight);
        n.bmi = h > 0 && w > 0 ? (w / (h * h)).toFixed(1) : "";
      }
      return n;
    });
  };

  async function save() {
    try {
      await api(`/api/patients/${patient.patient_id}/clinical-records`, { body: { encounterId: patient!.encounters?.find(e => e.status === "OPEN")?.encounter_id, section: "INTEGRATED_CLINICAL_ASSESSMENT", payload: toPayload(f) } });
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }));
      await refresh();
      toast("Clinical record saved centrally");
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <fieldset disabled={!canWrite} className="m-0 min-w-0 border-0 p-0">
      {!canWrite && <ViewOnly what="the clinical record" />}
      <Card title="Modern Clinical Assessment">
        <Grid cols={3}>
          <AreaField label="Chief complaints" value={f.cc} onChange={set("cc")} />
          <AreaField label="HPI" value={f.hpi} onChange={set("hpi")} />
          <AreaField label="Past medical/surgical history" value={f.past} onChange={set("past")} />
        </Grid>
        <Grid cols={4}>
          {VITALS.map(([k, label]) => <TextField key={k} label={k === "height" ? "Height (cm)" : k === "weight" ? "Weight (kg)" : k === "bmi" ? "BMI (auto)" : label} value={f[k]} onChange={set(k)} readOnly={k === "bmi"} />)}
        </Grid>
        <Grid cols={2}>
          <AreaField label="Family/social/lifestyle" value={f.family} onChange={set("family")} />
          <AreaField label="Modern diagnosis / assessment" value={f.modernDx} onChange={set("modernDx")} />
        </Grid>
      </Card>

      <Card title="Ayurveda Assessment">
        <Grid cols={4}>
          <SelectField label="Prakriti" value={f.prakriti} onChange={set("prakriti")} options={PRAKRITI} placeholder="Select…" />
          <TextField label="Vikriti" value={f.vikriti} onChange={set("vikriti")} />
          <SelectField label="Agni" value={f.agni} onChange={set("agni")} options={AGNI} placeholder="Select…" />
          <SelectField label="Ama" value={f.ama} onChange={set("ama")} options={AMA} placeholder="Select…" />
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
      </Card>
      {canWrite && (
        <div className="sticky bottom-0 z-10 -mx-1 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 px-5 py-3 shadow-pop backdrop-blur">
          <span className="text-sm text-muted">
            {dirty ? <b className="text-warn">Unsaved changes</b> : savedAt ? <>Saved at {savedAt}</> : latest ? <>Last saved {fmtDateTime(latest.created_at)}{latest.author_name ? ` by ${latest.author_name}` : ""}</> : "Not saved yet"}
          </span>
          <Button variant="primary" onClick={save}>Sign and save clinical record</Button>
        </div>
      )}
    </fieldset>
  );
}

function PreviousAssessments() {
  const { patient } = usePatient();
  const all = patient!.clinicalRecords.filter(r => r.section === "INTEGRATED_CLINICAL_ASSESSMENT");
  const older = all.slice(1); // the newest is the one shown in the form above
  if (!older.length) return null;
  return (
    <Card title="Previous assessments" aside={<Pill tone="gray">{older.length}</Pill>}>
      {older.map(r => (
        <details key={r.record_id} className="border-b border-line py-2 last:border-0">
          <summary className="cursor-pointer text-sm"><b>{fmtDateTime(r.created_at)}</b>{r.author_name ? ` · ${r.author_name}` : ""}{r.payload?.modernDiagnosis ? ` — ${r.payload.modernDiagnosis}` : ""}</summary>
          <dl className="m-0 mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-ink-2 md:grid-cols-2">
            {([["Chief complaints", r.payload?.chiefComplaints], ["HPI", r.payload?.hpi], ["Modern diagnosis", r.payload?.modernDiagnosis], ["Prakriti", r.payload?.prakriti], ["Agni", r.payload?.agni], ["Ama", r.payload?.ama], ["Ayurvedic diagnosis", r.payload?.ayurvedaDiagnosis], ["Integrated impression", r.payload?.integratedImpression], ["Goals / safety", r.payload?.goalsSafety]] as const)
              .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="inline font-medium text-ink">{k}: </dt><dd className="inline">{v}</dd></div>)}
          </dl>
        </details>
      ))}
    </Card>
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
      await api(`/api/patients/${patient!.patient_id}/clinical-records`, { body: { encounterId: patient!.encounters?.find(e => e.status === "OPEN")?.encounter_id, section: "NOTE", payload: { type, text } } });
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
          <p className="text-sm text-muted">Saving attests to this note under your signed-in identity. Amendments preserve the original.</p><Button variant="primary" onClick={save}>Sign and save note</Button>
        </>
      )}
      {notes.length ? notes.map(n => (
        <div key={n.record_id} className="border-b border-line p-2">
          <b>{n.payload?.type || "Note"}</b> • {fmtDateTime(n.created_at)}{n.author_name ? ` • ${n.author_name}` : ""}<br />{n.payload?.text || ""}
        </div>
      )) : <Empty>No notes.</Empty>}
    </Card>
  );
}
