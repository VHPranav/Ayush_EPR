"use client";
// Clinical notes: one signed note per consultation, follow-up visit or contact between visits (phone, Viber /
// WhatsApp, email: the clinic asks patients for a weekly health update). The first visit is the Initial exam;
// these notes record how the patient is doing after it. Saved as clinical records (section NOTE, the same
// section the Doctor page's old notes used, so those show here too). A correction is a signed amendment with
// a reason; the original stays readable. A follow-up date can be booked straight into Appointments.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import type { ClinicalRecord } from "@/lib/types";
import { Button, Card, Empty, Field, Input, PageHead, Pill, RequirePatient, Select, Textarea, ViewOnly } from "@/components/ui";

const TYPES = ["Consultation", "Follow-up", "Weekly update", "Therapy", "Other"] as const;
const CONTACTS = ["In clinic", "Phone", "Viber / WhatsApp", "Email", "Video call"] as const;
const PROGRESS = [["Better", "green"], ["Same", "amber"], ["Worse", "red"]] as const;
type ProgressTone = (typeof PROGRESS)[number][1];

interface Note {
  type: string; contact: string; progress: string; reports: string; observation: string;
  weight: string; bp: string; plan: string; followUp: string; therapyChanged: boolean;
}
const blank = (type: string = "Follow-up"): Note => ({
  type, contact: type === "Weekly update" ? "Viber / WhatsApp" : "In clinic", progress: "", reports: "", observation: "",
  weight: "", bp: "", plan: "", followUp: "", therapyChanged: false,
});

/** A saved note as form values; old notes (type + text only) keep their text in "Patient reports". */
function fromRecord(r: ClinicalRecord): Note {
  const p = (r.payload ?? {}) as Partial<Note> & { text?: string };
  const structured = "reports" in p || "observation" in p || "plan" in p;
  return { ...blank(p.type || "Other"), ...(structured ? p : { reports: p.text ?? "" }), contact: p.contact ?? "", therapyChanged: !!p.therapyChanged };
}

/** The readable text kept with every note (used by the timeline and anything that only reads text). */
function noteText(n: Note) {
  return [
    n.progress && `Progress: ${n.progress}`,
    n.reports.trim() && `Patient reports: ${n.reports.trim()}`,
    n.observation.trim() && `Pulse & observation: ${n.observation.trim()}`,
    (n.weight.trim() || n.bp.trim()) && [n.weight.trim() && `Weight ${n.weight.trim()} kg`, n.bp.trim() && `BP ${n.bp.trim()}`].filter(Boolean).join(", "),
    n.plan.trim() && `Plan / advice: ${n.plan.trim()}`,
    n.therapyChanged && "Therapy changed: new prescription",
    n.followUp && `Next follow-up: ${fmtDate(n.followUp.slice(0, 10))}`,
  ].filter(Boolean).join("\n");
}

const chip = (on: boolean) =>
  `rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${on ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-ink hover:bg-subtle"}`;

export default function NotesPage() {
  return (
    <>
      <PageHead title="Clinical notes" subtitle="Consultations, follow-up visits and updates between visits (phone, Viber / WhatsApp, email). The first visit is written in the Initial exam." />
      <RequirePatient><Notes /></RequirePatient>
    </>
  );
}

function Notes() {
  const { patient } = usePatient();
  const all = patient!.clinicalRecords.filter(r => r.section === "NOTE");
  // Show each note's latest version; versions it replaced are listed under it.
  const replaced = new Set(all.map(r => r.amended_from).filter(Boolean));
  const current = all.filter(r => !replaced.has(r.record_id));
  const [editing, setEditing] = useState<ClinicalRecord | null>(null);
  const [filter, setFilter] = useState("All");
  const shown = filter === "All" ? current : current.filter(r => (r.payload?.type || "Other") === filter);
  return (
    <>
      <Context notes={current} />
      <NoteForm key={(editing?.record_id ?? "new") + patient!.patient_id} editing={editing} onDone={() => setEditing(null)} />
      <Card
        title="Notes"
        aside={
          <Select aria-label="Show" value={filter} onChange={e => setFilter(e.target.value)} className="w-auto">
            <option>All</option>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
        }
      >
        {shown.length ? shown.map(r => <NoteCard key={r.record_id} record={r} all={all} onCorrect={() => { setEditing(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)
          : <Empty>{current.length ? "No notes of this type." : "No notes yet. Write the first consultation or follow-up above."}</Empty>}
      </Card>
    </>
  );
}

/** What the doctor wants in view before writing: diagnosis, last note, last prescription, next appointment. */
function Context({ notes }: { notes: ClinicalRecord[] }) {
  const { patient } = usePatient();
  const exam = patient!.clinicalRecords.find(r => r.section === "INITIAL_EXAM");
  const diagnosis = String((exam?.payload as Record<string, unknown> | null | undefined)?.diagnosis ?? "");
  const rx = patient!.prescriptions?.[0];
  const appts = (patient!.appointments ?? []) as { appointment_at: string; status: string; type: string | null }[];
  const next = appts.filter(a => a.status === "SCHEDULED" && new Date(a.appointment_at) > new Date()).sort((a, b) => a.appointment_at.localeCompare(b.appointment_at))[0];
  const items: [string, ReactNode][] = [
    ["Diagnosis", diagnosis || <Link className="underline" href="/exam">Write the Initial exam</Link>],
    ["Last note", notes[0] ? `${fmtDate(notes[0].created_at)} · ${notes[0].payload?.type || "Note"}` : "—"],
    ["Last prescription", rx ? <Link className="underline" href="/prescription">{fmtDate(rx.prescribed_at)}</Link> : "—"],
    ["Next appointment", next ? `${fmtDateTime(next.appointment_at)}${next.type ? ` · ${next.type.toLowerCase()}` : ""}` : <Link className="underline" href="/appointments">Book</Link>],
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-2xl border border-line bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">{k}</div>
          <div className="mt-1 truncate text-sm font-semibold text-ink">{v}</div>
        </div>
      ))}
    </div>
  );
}

function NoteForm({ editing, onDone }: { editing: ClinicalRecord | null; onDone: () => void }) {
  const { patient, refresh, markDirty } = usePatient();
  const { can } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const canWrite = can("clinical.write");
  const canBook = can("appointments.write");
  const [n, setN] = useState<Note>(() => (editing ? fromRecord(editing) : blank()));
  const [time, setTime] = useState("10:00");
  const [book, setBook] = useState(canBook);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Note>(k: K, v: Note[K]) => { setN(s => ({ ...s, [k]: v })); markDirty(); };

  async function save() {
    const text = noteText(n);
    if (!n.reports.trim() && !n.observation.trim() && !n.plan.trim()) return toast("Write what the patient reports, your observation or the plan");
    let amendmentReason: string | undefined;
    if (editing) {
      amendmentReason = window.prompt("Reason for the correction (kept with the note):")?.trim();
      if (!amendmentReason) return;
      if (amendmentReason.length < 5) return toast("Write a reason of at least 5 characters");
    }
    setBusy(true);
    try {
      const payload = { ...n, text };
      await api(`/api/patients/${patient!.patient_id}/clinical-records`, {
        body: editing
          ? { section: "NOTE", payload, amendedFrom: editing.record_id, amendmentReason }
          : { encounterId: patient!.encounters?.find(e => e.status === "OPEN")?.encounter_id, section: "NOTE", payload },
      });
      let booked = "";
      if (!editing && book && canBook && n.followUp) {
        try {
          await api(`/api/patients/${patient!.patient_id}/appointments`, { body: { appointmentAt: new Date(`${n.followUp}T${time || "10:00"}`).toISOString(), type: "FOLLOW-UP", reason: n.type === "Consultation" ? "Follow-up after consultation" : "Follow-up" } });
          booked = ` · follow-up booked for ${fmtDate(n.followUp)} ${time}`;
        } catch (e) {
          booked = `, but the follow-up was not booked: ${errMsg(e)}`;
        }
      }
      await refresh();
      toast(editing ? "Correction saved" : `Note saved${booked}`);
      setN(blank(n.type));
      onDone();
      if (n.therapyChanged && !editing) router.push("/prescription");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!canWrite) return <ViewOnly what="clinical notes" />;
  return (
    <Card title={editing ? `Correct note of ${fmtDateTime(editing.created_at)}` : "New note"} aside={editing ? <Button onClick={onDone}>Cancel correction</Button> : <Pill tone="gray">{fmtDate(new Date().toISOString().slice(0, 10))}</Pill>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TYPES.map(t => (
          <button key={t} type="button" aria-pressed={n.type === t} className={chip(n.type === t)}
            onClick={() => setN(s => ({ ...s, type: t, contact: t === "Weekly update" && s.contact === "In clinic" ? "Viber / WhatsApp" : s.contact }))}>{t}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-[1fr_auto]">
        <Field label="Contact">
          <Select value={n.contact} onChange={e => set("contact", e.target.value)}>{CONTACTS.map(c => <option key={c}>{c}</option>)}</Select>
        </Field>
        <Field label="Progress since last visit">
          <div className="flex gap-2">
            {PROGRESS.map(([p]) => (
              <button key={p} type="button" aria-pressed={n.progress === p} className={chip(n.progress === p)} onClick={() => set("progress", n.progress === p ? "" : p)}>{p}</button>
            ))}
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-x-4 xl:grid-cols-2">
        <Field label="Patient reports (symptoms, how they feel, the weekly update)">
          <Textarea value={n.reports} onChange={e => set("reports", e.target.value)} className="min-h-[140px] leading-relaxed" placeholder={"• Pain less in the mornings…\n• Sleeping better, 7 hrs"} />
        </Field>
        <Field label="Pulse & observation">
          <Textarea value={n.observation} onChange={e => set("observation", e.target.value)} className="min-h-[140px] leading-relaxed" placeholder={"• Pulse: …\n• Eye closes fully now"} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-x-4 md:grid-cols-4">
        <Field label="Weight (kg)"><Input inputMode="decimal" value={n.weight} onChange={e => set("weight", e.target.value)} /></Field>
        <Field label="BP"><Input value={n.bp} onChange={e => set("bp", e.target.value)} placeholder="120/80" /></Field>
      </div>
      <Field label="Plan / advice">
        <Textarea value={n.plan} onChange={e => set("plan", e.target.value)} placeholder="Continue the same therapy; reduce the powder to 2 times a day; start oil massage…" />
      </Field>
      <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={n.therapyChanged} onChange={e => set("therapyChanged", e.target.checked)} className="h-4 w-4 accent-brand" />
        Therapy changed{!editing && ": open Prescription after saving to write the new one"}
      </label>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-subtle p-4">
        <div className="w-44"><Field label="Next follow-up"><Input type="date" value={n.followUp} min={new Date().toISOString().slice(0, 10)} onChange={e => set("followUp", e.target.value)} /></Field></div>
        {!editing && canBook && n.followUp && (
          <>
            <div className="w-32"><Field label="Time"><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field></div>
            <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={book} onChange={e => setBook(e.target.checked)} className="h-4 w-4 accent-brand" />
              Book it in Appointments
            </label>
          </>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">Saving signs the note under your name. {editing ? "The original stays in the history." : "Corrections keep the original."}</span>
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Sign and save correction" : "Sign and save note"}</Button>
      </div>
    </Card>
  );
}

function NoteCard({ record: r, all, onCorrect }: { record: ClinicalRecord; all: ClinicalRecord[]; onCorrect: () => void }) {
  const { can } = useAuth();
  const n = fromRecord(r);
  const tone: ProgressTone | undefined = PROGRESS.find(([p]) => p === n.progress)?.[1];
  // Earlier versions of this note, newest first.
  const history: ClinicalRecord[] = [];
  for (let id = r.amended_from; id;) {
    const prev = all.find(x => x.record_id === id);
    if (!prev) break;
    history.push(prev);
    id = prev.amended_from;
  }
  const rows: [string, string][] = [["Patient reports", n.reports], ["Pulse & observation", n.observation], ["Plan / advice", n.plan]];
  return (
    <article className="border-b border-line py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-ink">{fmtDateTime(r.created_at)}</b>
        <Pill tone="sky">{n.type}</Pill>
        {n.contact && <Pill tone="gray">{n.contact}</Pill>}
        {tone && <Pill tone={tone}>{n.progress}</Pill>}
        {(r.version ?? 1) > 1 && <Pill tone="amber">Corrected</Pill>}
        <span className="text-sm text-muted">{r.author_name ?? ""}</span>
        {can("clinical.write") && <Button className="ml-auto px-3 py-1.5" onClick={onCorrect}>Correct</Button>}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-ink-2 lg:grid-cols-2">
        {rows.filter(([, v]) => v.trim()).map(([k, v]) => (
          <div key={k}><div className="text-xs font-medium text-muted">{k}</div><p className="m-0 whitespace-pre-wrap">{v}</p></div>
        ))}
      </div>
      {(n.weight || n.bp || n.followUp || n.therapyChanged) && (
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {n.weight && <Pill tone="gray">Weight {n.weight} kg</Pill>}
          {n.bp && <Pill tone="gray">BP {n.bp}</Pill>}
          {n.therapyChanged && <Pill tone="lavender">Therapy changed</Pill>}
          {n.followUp && <Pill tone="lime">Next follow-up {fmtDate(n.followUp)}</Pill>}
        </div>
      )}
      {r.amendment_reason && <p className="mb-0 mt-2 text-xs text-muted">Correction reason: {r.amendment_reason}</p>}
      {history.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted">Earlier version{history.length > 1 ? "s" : ""} ({history.length})</summary>
          {history.map(h => (
            <div key={h.record_id} className="mt-2 rounded-xl bg-subtle p-3">
              <div className="text-xs text-muted">{fmtDateTime(h.created_at)}{h.author_name ? ` · ${h.author_name}` : ""}</div>
              <p className="m-0 whitespace-pre-wrap">{String(h.payload?.text ?? "")}</p>
            </div>
          ))}
        </details>
      )}
    </article>
  );
}
