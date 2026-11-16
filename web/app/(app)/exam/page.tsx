"use client";
// Initial exam notes, laid out like the doctor's own Word notes: diagnosis; symptoms, pulse notes & observation;
// existing medicines (as written by the other doctor, with the chemical / generic name); diet; exercise.
// Saved as a signed clinical record (section INITIAL_EXAM); every save is a new version, older ones stay readable.
import { useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import type { ClinicalRecord } from "@/lib/types";
import { Button, Card, Field, Input, PageHead, Pill, RequirePatient, Select, Textarea, ViewOnly } from "@/components/ui";

const KINDS = ["Medicine", "Supplement", "Therapy"] as const;
interface Med { kind: string; name: string; generic: string; reason: string; prescribedBy: string }
interface Exam { diagnosis: string; observations: string; medicines: Med[]; diet: string; exercise: string; notes: string }

const blankMed = (kind = "Medicine"): Med => ({ kind, name: "", generic: "", reason: "", prescribedBy: "" });
const blankExam = (): Exam => ({ diagnosis: "", observations: "", medicines: [blankMed()], diet: "", exercise: "", notes: "" });

function fromRecord(r?: ClinicalRecord): Exam {
  if (!r) return blankExam();
  const p = (r.payload ?? {}) as Partial<Exam>;
  const meds = Array.isArray(p.medicines) && p.medicines.length ? p.medicines.map(m => ({ ...blankMed(), ...m })) : [blankMed()];
  return { diagnosis: p.diagnosis ?? "", observations: p.observations ?? "", medicines: meds, diet: p.diet ?? "", exercise: p.exercise ?? "", notes: p.notes ?? "" };
}

/** Turns the patient's intake answers into note lines, in the order and wording the doctor uses. */
function fromIntake(a: Record<string, string>): Partial<Exam> {
  const yes = (k: string) => a[k] === "YES", no = (k: string) => a[k] === "NO";
  const lines: string[] = [];
  for (const k of ["symptoms", "additional"]) if (a[k]) lines.push(a[k]);
  if (a.history) lines.push(`History: ${a.history}`);
  if (a.surgeries) lines.push(`Surgery: ${a.surgeries}`);
  if (a.hereditary) lines.push(`Hereditary: ${a.hereditary}`);
  if (yes("allergiesAny")) lines.push(`Allergies: ${a.allergies || "yes"}`);
  const habits = [["smoking", "cig", "smokingAmount"], ["alcohol", "drinks", "alcoholAmount"], ["drugs", "drugs", "drugsAmount"]] as const;
  const noTo = habits.filter(([k]) => no(k)).map(([, w]) => w);
  if (noTo.length) lines.push(`NO to ${noTo.join(" and ")}`);
  for (const [k, w, amount] of habits) if (yes(k)) lines.push(`YES to ${w}${a[amount] ? `: ${a[amount]}` : ""}`);
  if (a.sleepHours || a.sleepInterrupted) lines.push(`Sleeps about ${a.sleepHours || "?"} hrs${yes("sleepInterrupted") ? ", with interruptions" : no("sleepInterrupted") ? ", no interruptions" : ""}`);
  if (a.bowelDaily) lines.push(yes("bowelDaily") ? "Daily bowels" : "No to daily bowels");
  const split = (s: string) => s.split(/\r?\n|,|;/).map(x => x.trim()).filter(Boolean);
  const medicines = [...split(a.therapies ?? "").map(name => ({ ...blankMed("Medicine"), name })), ...split(a.supplements ?? "").map(name => ({ ...blankMed("Supplement"), name }))];
  return { diagnosis: a.diagnosis ?? "", observations: lines.map(l => `• ${l}`).join("\n"), ...(medicines.length ? { medicines } : {}) };
}

export default function ExamPage() {
  return (
    <>
      <PageHead title="Initial exam" subtitle="Diagnosis, symptoms, pulse notes and observation; existing medicines with their chemical names; diet and exercise." />
      <RequirePatient><ExamRecord /></RequirePatient>
    </>
  );
}

function ExamRecord() {
  const { patient } = usePatient();
  const exams = patient!.clinicalRecords.filter(r => r.section === "INITIAL_EXAM");
  return (
    <>
      <ExamForm key={patient!.patient_id + (exams[0]?.record_id ?? "")} latest={exams[0]} />
      <PreviousExams exams={exams.slice(1)} />
    </>
  );
}

function ExamForm({ latest }: { latest?: ClinicalRecord }) {
  const { patient, refresh, markDirty } = usePatient();
  const { can } = useAuth();
  const toast = useToast();
  const canWrite = can("clinical.write");
  const [f, setF] = useState<Exam>(() => fromRecord(latest));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const intake = patient!.clinicalRecords.find(r => r.section === "INTAKE_FORM");

  const edit = (next: (e: Exam) => Exam) => { setF(next); setDirty(true); markDirty(); };
  const set = (k: Exclude<keyof Exam, "medicines">) => (v: string) => edit(e => ({ ...e, [k]: v }));
  const setMed = (i: number, k: keyof Med, v: string) => edit(e => ({ ...e, medicines: e.medicines.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));

  function prefill() {
    const p = fromIntake((intake!.payload ?? {}) as Record<string, string>);
    const empty = !f.diagnosis.trim() && !f.observations.trim() && !f.medicines.some(m => m.name.trim());
    if (!empty && !window.confirm("Replace the diagnosis, observations and medicines below with the patient's intake answers?")) return;
    edit(e => ({ ...e, ...p }));
  }

  async function save() {
    const medicines = f.medicines.map(m => ({ ...m, name: m.name.trim(), generic: m.generic.trim(), reason: m.reason.trim(), prescribedBy: m.prescribedBy.trim() })).filter(m => m.name || m.generic);
    if (!f.diagnosis.trim() && !f.observations.trim() && !medicines.length) return toast("Write a diagnosis or observation first");
    setBusy(true);
    try {
      await api(`/api/patients/${patient!.patient_id}/clinical-records`, {
        body: { encounterId: patient!.encounters?.find(e => e.status === "OPEN")?.encounter_id, section: "INITIAL_EXAM", payload: { ...f, medicines } },
      });
      setDirty(false);
      await refresh();
      toast("Initial exam saved");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset disabled={!canWrite} className="m-0 min-w-0 border-0 p-0">
      {!canWrite && <ViewOnly what="the initial exam" />}
      <Card
        title={`Exam · ${fmtDate(new Date().toISOString().slice(0, 10))}`}
        aside={canWrite && intake ? <Button onClick={prefill}><Wand2 size={16} /> Fill from intake form</Button> : undefined}
      >
        <Field label="Diagnosis">
          <Input value={f.diagnosis} onChange={e => set("diagnosis")(e.target.value)} placeholder="e.g. Pareza facialis" />
        </Field>
        <Field label="Symptoms, pulse notes & observation">
          <Textarea value={f.observations} onChange={e => set("observations")(e.target.value)} className="min-h-[220px] leading-relaxed" placeholder={"• Closed right eye, lips going to the side…\n• Pulse: …"} />
        </Field>
      </Card>

      <Card title="Existing medicines" aside={<Pill tone="gray">As prescribed by other doctors</Pill>}>
        <p className="mb-3 text-sm text-muted">Write the name as it is on the box or the other doctor&apos;s note, and the chemical (generic) name next to it, e.g. Rapten duo → diclofenac sodium.</p>
        <div className="space-y-3">
          {f.medicines.map((m, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-xl bg-subtle p-3 md:grid-cols-[130px_1fr_1fr] xl:grid-cols-[130px_1.2fr_1.2fr_1fr_1fr_auto] xl:items-center">
              <Select aria-label="Type" value={m.kind} onChange={e => setMed(i, "kind", e.target.value)}>{KINDS.map(k => <option key={k}>{k}</option>)}</Select>
              <Input aria-label="Name as written" placeholder="Name as written (e.g. Bensedin)" value={m.name} onChange={e => setMed(i, "name", e.target.value)} />
              <Input aria-label="Chemical / generic name" placeholder="Chemical / generic name" value={m.generic} onChange={e => setMed(i, "generic", e.target.value)} />
              <Input aria-label="Reason / dose" placeholder="Reason / dose (e.g. due to pain)" value={m.reason} onChange={e => setMed(i, "reason", e.target.value)} />
              <Input aria-label="Prescribed by" placeholder="Prescribed by" value={m.prescribedBy} onChange={e => setMed(i, "prescribedBy", e.target.value)} />
              <Button aria-label="Remove row" onClick={() => edit(e => ({ ...e, medicines: e.medicines.length > 1 ? e.medicines.filter((_, j) => j !== i) : [blankMed()] }))}><Trash2 size={16} /></Button>
            </div>
          ))}
        </div>
        <Button className="mt-3" onClick={() => edit(e => ({ ...e, medicines: [...e.medicines, blankMed()] }))}><Plus size={16} /> Add medicine</Button>
      </Card>

      <div className="grid grid-cols-1 gap-x-5 xl:grid-cols-2">
        <Card title="Diet"><Textarea aria-label="Diet" value={f.diet} onChange={e => set("diet")(e.target.value)} className="min-h-[140px]" /></Card>
        <Card title="Exercise"><Textarea aria-label="Exercise" value={f.exercise} onChange={e => set("exercise")(e.target.value)} className="min-h-[140px]" /></Card>
      </div>
      <Card title="Other notes"><Textarea aria-label="Other notes" value={f.notes} onChange={e => set("notes")(e.target.value)} /></Card>

      {canWrite && (
        <div className="sticky bottom-0 z-10 -mx-1 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 px-5 py-3 shadow-pop backdrop-blur">
          <span className="text-sm text-muted">
            {dirty ? <b className="text-warn">Unsaved changes</b> : latest ? <>Last saved {fmtDateTime(latest.created_at)}{latest.author_name ? ` by ${latest.author_name}` : ""}</> : "Not saved yet"}
          </span>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Sign and save exam"}</Button>
        </div>
      )}
    </fieldset>
  );
}

function PreviousExams({ exams }: { exams: ClinicalRecord[] }) {
  if (!exams.length) return null;
  return (
    <Card title="Earlier exams" aside={<Pill tone="gray">{exams.length}</Pill>}>
      {exams.map(r => {
        const e = fromRecord(r);
        return (
          <details key={r.record_id} className="border-b border-line py-2 last:border-0">
            <summary className="cursor-pointer text-sm"><b>{fmtDateTime(r.created_at)}</b>{r.author_name ? ` · ${r.author_name}` : ""}{e.diagnosis ? ` — ${e.diagnosis}` : ""}</summary>
            <div className="mt-2 space-y-2 text-sm text-ink-2">
              {e.observations && <p className="m-0 whitespace-pre-wrap">{e.observations}</p>}
              {e.medicines.some(m => m.name || m.generic) && (
                <ul className="m-0 pl-5">{e.medicines.filter(m => m.name || m.generic).map((m, i) => <li key={i}>{m.name}{m.generic ? ` (${m.generic})` : ""}{m.reason ? ` — ${m.reason}` : ""}{m.prescribedBy ? ` · ${m.prescribedBy}` : ""}</li>)}</ul>
              )}
              {e.diet && <p className="m-0"><b>Diet:</b> {e.diet}</p>}
              {e.exercise && <p className="m-0"><b>Exercise:</b> {e.exercise}</p>}
              {e.notes && <p className="m-0"><b>Notes:</b> {e.notes}</p>}
            </div>
          </details>
        );
      })}
    </Card>
  );
}
