"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { TreatmentMaster } from "@/lib/types";
import { AreaField, Button, Card, Empty, Input, PageHead, Pill, RequirePatient, Select } from "@/components/ui";

const FREQ = ["Once daily", "Twice daily", "Thrice daily", "As required"];
const DURATION = ["1 day", "3 days", "7 days", "14 days", "21 days", "28 days"];
const MED_FREQ = ["Once daily", "Twice daily", "Thrice daily", "Before meals", "After meals"];
const DOSE = ["0.5 g", "1 g", "2 g", "5 ml", "10 ml", "As prescribed"];

interface TrRow { key: number; treatmentId: string; frequency: string; duration: string }
interface MedRow { key: number; name: string; frequency: string; dose: string; instructions: string }

let keySeq = 0;

export default function PrescriptionPage() {
  return (
    <>
      <PageHead title="Prescription" subtitle="Every save is a separate dated prescription in PostgreSQL." />
      <RequirePatient><Prescription /></RequirePatient>
    </>
  );
}

function Prescription() {
  const { patient, refresh } = usePatient();
  const { can } = useAuth();
  const canWrite = can("prescriptions.write");
  const toast = useToast();
  const { data: masterData } = useFetch<TreatmentMaster[]>(canWrite ? "/api/treatment-master" : null);
  const master = masterData ?? [];
  const [treatments, setTreatments] = useState<TrRow[]>([]);
  const [medicines, setMedicines] = useState<MedRow[]>([]);
  const [notes, setNotes] = useState("");

  const addTreatment = () => {
    if (!master.length) return toast("Add Treatment Master records first in Treatment Master menu");
    setTreatments(r => [...r, { key: ++keySeq, treatmentId: master[0].treatment_id, frequency: FREQ[0], duration: DURATION[0] }]);
  };
  const addMedicine = () => setMedicines(r => [...r, { key: ++keySeq, name: "", frequency: MED_FREQ[0], dose: DOSE[0], instructions: "" }]);
  const patchT = (key: number, p: Partial<TrRow>) => setTreatments(r => r.map(x => (x.key === key ? { ...x, ...p } : x)));
  const patchM = (key: number, p: Partial<MedRow>) => setMedicines(r => r.map(x => (x.key === key ? { ...x, ...p } : x)));

  async function save() {
    const meds = medicines.filter(m => m.name.trim());
    if (!treatments.length && !meds.length) return toast("Add at least one treatment or medicine");
    try {
      await api(`/api/patients/${patient!.patient_id}/prescriptions`, {
        body: {
          treatments: treatments.map(t => ({ name: master.find(m => m.treatment_id === t.treatmentId)?.name ?? "", frequency: t.frequency, duration: t.duration })),
          medicines: meds.map(m => ({ name: m.name, frequency: m.frequency, dose: m.dose, instructions: m.instructions })),
          notes,
        },
      });
      await refresh();
      setTreatments([]);
      setMedicines([]);
      setNotes("");
      toast("Prescription saved centrally");
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <>
      {canWrite && (
      <>
      <Card title="Sheet 1 — Treatments Prescribed">
        {treatments.map(t => (
          <div key={t.key} className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
            <Select aria-label="Treatment" value={t.treatmentId} onChange={e => patchT(t.key, { treatmentId: e.target.value })}>
              {master.map(m => <option key={m.treatment_id} value={m.treatment_id}>{m.name}</option>)}
            </Select>
            <Select aria-label="Frequency" value={t.frequency} onChange={e => patchT(t.key, { frequency: e.target.value })}>{FREQ.map(o => <option key={o}>{o}</option>)}</Select>
            <Select aria-label="Duration" value={t.duration} onChange={e => patchT(t.key, { duration: e.target.value })}>{DURATION.map(o => <option key={o}>{o}</option>)}</Select>
            <Button variant="danger" onClick={() => setTreatments(r => r.filter(x => x.key !== t.key))}>Delete</Button>
          </div>
        ))}
        <Button onClick={addTreatment}>+ Add treatment</Button>
        {!master.length && <span className="ml-3 text-xs text-muted">No treatments yet — add some in <Link href="/treatment-master" className="underline">Treatment Master</Link>.</span>}
      </Card>

      <Card title="Sheet 2 — Internal Medicines">
        {medicines.map(m => (
          <div key={m.key} className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <Input placeholder="Medicine name" aria-label="Medicine name" value={m.name} onChange={e => patchM(m.key, { name: e.target.value })} />
            <Select aria-label="Frequency" value={m.frequency} onChange={e => patchM(m.key, { frequency: e.target.value })}>{MED_FREQ.map(o => <option key={o}>{o}</option>)}</Select>
            <Select aria-label="Dose" value={m.dose} onChange={e => patchM(m.key, { dose: e.target.value })}>{DOSE.map(o => <option key={o}>{o}</option>)}</Select>
            <Input placeholder="Instructions" aria-label="Instructions" value={m.instructions} onChange={e => patchM(m.key, { instructions: e.target.value })} />
            <Button variant="danger" onClick={() => setMedicines(r => r.filter(x => x.key !== m.key))}>Delete</Button>
          </div>
        ))}
        <Button onClick={addMedicine}>+ Add medicine</Button>
      </Card>

      <Card>
        <AreaField label="Prescription notes" value={notes} onChange={setNotes} />
        <Button variant="primary" onClick={save}>Save prescription</Button>
      </Card>
      </>
      )}

      <Card title="Prescription history">
        {patient!.prescriptions.length ? patient!.prescriptions.map(x => (
          <div key={x.prescription_id} className="border-b border-line py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2"><b>{x.prescription_no}</b><span className="text-sm text-muted">{fmtDateTime(x.prescribed_at)}</span><Pill>{x.status}</Pill></div>
            {x.medicines?.length ? (
              <div className="mt-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted">Medicines</div>
                <ul className="m-0 mt-1 list-none p-0 text-sm text-ink-2">
                  {x.medicines.map((m, i) => <li key={i} className="py-0.5"><b className="text-ink">{m.medicine_name}</b>{[m.dose, m.frequency].filter(Boolean).map(v => ` · ${v}`)}{m.instructions ? ` — ${m.instructions}` : ""}</li>)}
                </ul>
              </div>
            ) : null}
            {x.treatments?.length ? (
              <div className="mt-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted">Treatments</div>
                <ul className="m-0 mt-1 list-none p-0 text-sm text-ink-2">
                  {x.treatments.map((t, i) => <li key={i} className="py-0.5"><b className="text-ink">{t.treatment_name}</b>{[t.frequency, t.duration].filter(Boolean).map(v => ` · ${v}`)}</li>)}
                </ul>
              </div>
            ) : null}
            {x.notes ? <p className="mb-0 mt-2 text-sm text-ink-2">Notes: {x.notes}</p> : null}
          </div>
        )) : <Empty>No prescriptions.</Empty>}
      </Card>
    </>
  );
}
