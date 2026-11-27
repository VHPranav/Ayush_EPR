"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { Prescription as Rx, PrescriptionSettings, RxMedicine as RxLine, StockItem, TreatmentMaster } from "@/lib/types";
import { printPrescription } from "@/lib/print";
import { doseValue, FORMS, formOf, medicineSentence, parseDose, TIMINGS, UNITS, type Lang } from "@/lib/prescription-text";
import { TherapyLabels } from "@/components/therapy-labels";
import { AreaField, Button, Card, Empty, Field, Input, Modal, PageHead, Pill, RequirePatient, Select, TextField, ViewOnly } from "@/components/ui";

const FREQ = ["Once daily", "Twice daily", "Thrice daily", "As required"];
const DURATION = ["1 day", "3 days", "7 days", "14 days", "21 days", "28 days"];
const LANGS: [Lang, string][] = [["en", "English"], ["me", "Crnogorski (Montenegrin)"]];

interface TrRow { key: number; treatmentId: string; frequency: string; duration: string }
interface MedRow { key: number; form: string; name: string; amount: string; unit: string; timing: string; customTiming: string; mix: string; instructions: string }

let keySeq = 0;

export default function PrescriptionPage() {
  const { can } = useAuth();
  const canWriteHead = can("prescriptions.write");
  return (
    <>
      <PageHead title="Prescription" subtitle={canWriteHead ? "Write the therapy; it prints in the clinic's format in English or Montenegrin. Each save creates a new dated prescription." : "Prescriptions issued to this patient."} />
      <RequirePatient><Prescription /></RequirePatient>
      <PrescriptionSettingsCard />
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
  const { data: stockData } = useFetch<StockItem[]>(can("pharmacy.read") ? "/api/pharmacy/stock" : null);
  const { data: settings } = useFetch<PrescriptionSettings>("/api/settings/prescription");
  const stockNames = [...new Set((stockData ?? []).map(s => s.medicine_name))];
  // The diagnosis and diet the doctor wrote in the initial exam start the prescription off.
  const exam = (patient!.clinicalRecords.find(r => r.section === "INITIAL_EXAM")?.payload ?? {}) as Record<string, unknown>;
  const [justSaved, setJustSaved] = useState<Rx | null>(null);
  const [treatments, setTreatments] = useState<TrRow[]>([]);
  const [medicines, setMedicines] = useState<MedRow[]>([]);
  const [language, setLanguage] = useState<Lang>("en");
  const [diagnosis, setDiagnosis] = useState(typeof exam.diagnosis === "string" ? exam.diagnosis : "");
  const [changes, setChanges] = useState("");
  const [diet, setDiet] = useState(typeof exam.diet === "string" ? exam.diet : "");
  const [notes, setNotes] = useState("");
  const [shipping, setShipping] = useState<Rx | null>(null);
  const [labelsRx, setLabelsRx] = useState<Rx | null>(null);

  const addTreatment = () => {
    if (!master.length) return toast("Add Treatment Master records first in Treatment Master menu");
    setTreatments(r => [...r, { key: ++keySeq, treatmentId: master[0].treatment_id, frequency: "", duration: "" }]);
  };
  // Dose and timing start empty on purpose: a prescription must never carry a value the doctor did not pick.
  const addMedicine = (form = "ELIXIR") => setMedicines(r => [...r, { key: ++keySeq, form, name: "", amount: "", unit: form === "ELIXIR" ? "ml" : form === "POWDER" ? "gr" : form.includes("CAPSULE") ? "capsule" : form === "OIL" ? "drop" : "ml", timing: "", customTiming: "", mix: "", instructions: "" }]);
  const patchT = (key: number, p: Partial<TrRow>) => setTreatments(r => r.map(x => (x.key === key ? { ...x, ...p } : x)));
  const patchM = (key: number, p: Partial<MedRow>) => setMedicines(r => r.map(x => (x.key === key ? { ...x, ...p } : x)));

  const toLine = (m: MedRow) => ({
    name: m.name.trim(), form: m.form, dose: doseValue(m.amount, m.unit),
    frequency: m.timing === "CUSTOM" ? m.customTiming.trim() : TIMINGS.find(t => t.key === m.timing)?.text.en ?? "",
    timing: m.timing, anupana: m.mix.trim(), route: formOf(m.form).oral ? "Oral" : "External", instructions: m.instructions.trim(),
  });

  async function save() {
    const meds = medicines.filter(m => m.name.trim());
    if (!treatments.length && !meds.length) return toast("Add at least one therapy or treatment");
    if (medicines.some(m => !m.name.trim())) return toast("Fill in or delete the empty therapy row");
    if (meds.some(m => !m.amount.trim() || !m.timing || (m.timing === "CUSTOM" && !m.customTiming.trim()))) return toast("Enter the dose and choose when to take it for every therapy");
    if (treatments.some(t => !t.frequency || !t.duration)) return toast("Choose a frequency and duration for every treatment");
    try {
      await api(`/api/patients/${patient!.patient_id}/prescriptions`, {
        body: {
          encounterId: patient!.encounters?.find(e => e.status === "OPEN")?.encounter_id,
          treatments: treatments.map(t => ({ name: master.find(m => m.treatment_id === t.treatmentId)?.name ?? "", frequency: t.frequency, duration: t.duration })),
          medicines: meds.map(toLine),
          language, diagnosis, medicationChanges: changes, diet, notes,
        },
      });
      const fresh = await api<{ prescriptions: Rx[] }>(`/api/patients/${patient!.patient_id}`);
      setJustSaved(fresh.prescriptions[0] ?? null);
      await refresh();
      setTreatments([]);
      setMedicines([]);
      setChanges("");
      setNotes("");
      toast("Prescription saved centrally");
    } catch (e) {
      toast(errMsg(e));
    }
  }

  const print = (rx: Rx, lang?: Lang) => {
    if (!settings) return toast("Prescription settings are still loading");
    if (lang && lang !== (rx.language ?? "en") && !window.confirm("The therapy sentences will be printed in the other language, but anything the doctor typed (instructions, diet, changes) stays as written. Continue?")) return;
    if (!printPrescription(patient!, rx, settings, lang)) toast("Allow pop-ups for this site to print");
  };

  return (
    <>
      {!canWrite && <ViewOnly what="prescriptions" />}
      {justSaved && (
        <div role="status" className="mb-5 rounded-2xl bg-good-soft p-5 text-good">
          <div className="font-semibold">Prescription {justSaved.prescription_no} saved</div>
          <div className="mt-1 text-sm">{[...(justSaved.medicines ?? []).map(m => m.medicine_name), ...(justSaved.treatments ?? []).map(t => t.treatment_name)].join(", ")}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => print(justSaved)}>Print</Button>
            <Button onClick={() => setJustSaved(null)}>Write another</Button>
          </div>
        </div>
      )}
      {canWrite && (
      <>
      <Card title="Prescription">
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-[220px_1fr]">
          <Field label="Language of the printout">
            <Select value={language} onChange={e => setLanguage(e.target.value as Lang)}>{LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Diagnosis"><Input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="e.g. GENERAL HEALTH" /></Field>
        </div>
        <p className="mb-0 text-xs text-muted">Write the instructions, diet and medicine changes in the language you choose; the therapy sentences are generated in it.</p>
      </Card>

      <Card title="Herbal therapy">
        <div className="space-y-3">
          {medicines.map(m => {
            const preview = medicineSentence({ ...toLine(m), medicine_name: m.name || "…", dose: m.amount ? doseValue(m.amount, m.unit) : "…", instructions: m.instructions }, language);
            const f = formOf(m.form);
            return (
              <div key={m.key} className="rounded-xl bg-subtle p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1.3fr_2fr_0.7fr_0.9fr_1.6fr_auto]">
                  <Select aria-label="Form" value={m.form} onChange={e => patchM(m.key, { form: e.target.value })}>
                    {FORMS.map(x => <option key={x.key} value={x.key}>{x.short}</option>)}
                  </Select>
                  <Input placeholder="Formula / name, e.g. 3(1) + 14(1) + 15(3)" aria-label="Formula or name" list="stock-medicines" value={m.name} onChange={e => patchM(m.key, { name: e.target.value })} />
                  <Input placeholder="Dose" aria-label="Dose amount" inputMode="decimal" value={m.amount} onChange={e => patchM(m.key, { amount: e.target.value })} />
                  <Select aria-label="Unit" value={m.unit} onChange={e => patchM(m.key, { unit: e.target.value })}>{UNITS.map(u => <option key={u.key} value={u.key}>{u.en[1]}</option>)}</Select>
                  <Select aria-label="When" value={m.timing} onChange={e => patchM(m.key, { timing: e.target.value })}>
                    <option value="">When…</option>{TIMINGS.map(t => <option key={t.key} value={t.key}>{t.text.en}</option>)}
                  </Select>
                  <Button variant="danger" onClick={() => setMedicines(r => r.filter(x => x.key !== m.key))}>Delete</Button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {m.timing === "CUSTOM" && <Input placeholder={language === "me" ? "Kada, npr. svako veče u 20.00h" : "When, e.g. at 8pm every night"} aria-label="When (custom)" value={m.customTiming} onChange={e => patchM(m.key, { customTiming: e.target.value })} />}
                  {f.oral && f.key !== "CAPSULE" && f.key !== "OIL_CAPSULE" && <Input placeholder={language === "me" ? "Pomiješati sa… (npr. eliksirom)" : "Mix with… (e.g. elixir)"} aria-label="Mix with" value={m.mix} onChange={e => patchM(m.key, { mix: e.target.value })} />}
                  <Input placeholder={language === "me" ? "Dodatna uputstva" : f.key === "OIL" ? "e.g. use on the vertex/crown of the head; wash or wipe in the morning" : "Extra instructions"} aria-label="Instructions" value={m.instructions} onChange={e => patchM(m.key, { instructions: e.target.value })} className="md:col-span-1" />
                </div>
                <p className="mb-0 mt-2 text-sm text-ink-2"><b>{preview.heading}:</b> {preview.text}</p>
              </div>
            );
          })}
        </div>
        <datalist id="stock-medicines">{stockNames.map(n => <option key={n} value={n} />)}</datalist>
        <div className="mt-3 flex flex-wrap gap-2">
          {FORMS.filter(x => x.key !== "OTHER").map(x => <Button key={x.key} onClick={() => addMedicine(x.key)}>+ {x.short}</Button>)}
          <Button onClick={() => addMedicine("OTHER")}>+ Other</Button>
        </div>
      </Card>

      <Card title="Treatments">
        {treatments.map(t => (
          <div key={t.key} className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
            <Select aria-label="Treatment" value={t.treatmentId} onChange={e => patchT(t.key, { treatmentId: e.target.value })}>
              {master.map(m => <option key={m.treatment_id} value={m.treatment_id}>{m.name}</option>)}
            </Select>
            <Select aria-label="Frequency" value={t.frequency} onChange={e => patchT(t.key, { frequency: e.target.value })}><option value="">Frequency…</option>{FREQ.map(o => <option key={o}>{o}</option>)}</Select>
            <Select aria-label="Duration" value={t.duration} onChange={e => patchT(t.key, { duration: e.target.value })}><option value="">Duration…</option>{DURATION.map(o => <option key={o}>{o}</option>)}</Select>
            <Button variant="danger" onClick={() => setTreatments(r => r.filter(x => x.key !== t.key))}>Delete</Button>
          </div>
        ))}
        <Button onClick={addTreatment}>+ Add treatment</Button>
        {!master.length && <span className="ml-3 text-xs text-muted">No treatments yet — add some in <Link href="/treatment-master" className="underline">Treatment Master</Link>.</span>}
      </Card>

      <Card>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <AreaField label={language === "me" ? "Promjene u postojećim ljekovima (prazno = Nema)" : "Changes to existing medications (empty = None)"} value={changes} onChange={setChanges} />
          <AreaField label={language === "me" ? "Preporuka za ishranu (prazno = Nema)" : "Dietary recommendations (empty = None)"} value={diet} onChange={setDiet} />
        </div>
        <AreaField label="Internal notes (not printed)" value={notes} onChange={setNotes} />
        <Button variant="primary" onClick={save}>Save prescription</Button>
      </Card>
      </>
      )}

      <Card title="Prescription history">
        {patient!.prescriptions.length ? patient!.prescriptions.map(x => (
          <div key={x.prescription_id} className="border-b border-line py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <b>{x.prescription_no}</b><span className="text-sm text-muted">{fmtDateTime(x.prescribed_at)}</span>
              <Pill tone={x.status === "DISPENSED" ? "gray" : "green"}>{x.status === "DISPENSED" ? "Dispensed" : "Issued"}</Pill>
              <Pill tone="sky">{x.language === "me" ? "Crnogorski" : "English"}</Pill>
              {x.diagnosis && <span className="text-sm text-ink-2">{x.diagnosis}</span>}
              <span className="ml-auto flex gap-1.5">
                {!!x.medicines?.length && <Button onClick={() => setLabelsRx(x)}>Labels</Button>}
                {can("products.read") && can("documents.write") && !!x.medicines?.length && <Button onClick={() => setShipping(x)}>DHL documents</Button>}
                <Button variant="primary" onClick={() => print(x)}>Print</Button>
                <Button onClick={() => print(x, x.language === "me" ? "en" : "me")}>{x.language === "me" ? "Print in English" : "Print in Montenegrin"}</Button>
              </span>
            </div>
            {x.medicines?.length ? (
              <ol className="m-0 mt-2 pl-5 text-sm text-ink-2">
                {x.medicines.map((m, i) => { const s = medicineSentence(m, x.language ?? "en"); return <li key={i} className="py-0.5"><b className="text-ink">{s.heading}:</b> {s.text}</li>; })}
              </ol>
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
      <Modal open={labelsRx !== null} onClose={() => setLabelsRx(null)} title="Labels for making the therapy" width="max-w-3xl"
        description="One label per powder / elixir for the label maker: the total at the top and the weight of each part.">
        {labelsRx && <TherapyLabels key={labelsRx.prescription_id} rx={labelsRx} patientName={patient!.name} onDone={() => setLabelsRx(null)} />}
      </Modal>
      <Modal open={shipping !== null} onClose={() => setShipping(null)} title="DHL documents" width="max-w-3xl"
        description="Product declaration, an MSDS per product and the product info sheets, as one PDF saved to this patient's Documents.">
        {shipping && <ShippingForm key={shipping.prescription_id} rx={shipping} onDone={() => setShipping(null)} />}
      </Modal>
    </>
  );
}

/** Parcel quantity suggested from the prescription: dose × doses a day × days (ml, gr, capsules; otherwise left to type). */
function suggestQuantity(m: RxLine, days: number) {
  const { amount, unit } = parseDose(m.dose);
  const perDay = { "4X": 4, "3X": 3, "2X": 2, "1X_AM": 1, NIGHT: 1 }[m.timing ?? ""] ?? 0;
  const n = Number(amount.replace(",", "."));
  if (!perDay || !n || !["ml", "gr", "capsule", "tablet"].includes(unit)) return "";
  const total = Math.round(n * perDay * days * 100) / 100;
  return `${total} ${unit === "capsule" ? "capsules" : unit === "tablet" ? "tablets" : unit}`;
}

function ShippingForm({ rx, onDone }: { rx: Rx; onDone: () => void }) {
  const { patient } = usePatient();
  const toast = useToast();
  const router = useRouter();
  const lines = rx.medicines ?? [];
  const [days, setDays] = useState("30");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [since, setSince] = useState(() => String(patient!.registered_at ? new Date(patient!.registered_at).getFullYear() : new Date().getFullYear()));
  const [distributor, setDistributor] = useState("Datha Ayuryoga International Health Institute d.o.o. Podgorica");
  const [items, setItems] = useState(() => lines.map(m => ({ lineId: m.row_id!, include: true, quantity: suggestQuantity(m, 30), touched: false, mfgDate: "", bestBefore: "" })));
  const [busy, setBusy] = useState(false);
  const patch = (i: number, p: Partial<(typeof items)[number]>) => setItems(s => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  // Untouched quantities follow the number of days.
  const changeDays = (v: string) => { setDays(v); setItems(s => s.map((x, i) => (x.touched ? x : { ...x, quantity: suggestQuantity(lines[i], Number(v) || 0) }))); };

  async function make() {
    const chosen = items.filter(x => x.include);
    if (!chosen.length) return toast("Choose at least one product for the parcel");
    if (chosen.some(x => !x.quantity.trim())) return toast("Enter the quantity in the parcel for every product");
    setBusy(true);
    try {
      const r = await api<{ fileName: string; pages: number }>(`/api/patients/${patient!.patient_id}/prescriptions/${rx.prescription_id}/shipping-documents`, {
        body: { days: Number(days), date, sinceYear: Number(since), distributor, items: chosen.map(({ lineId, quantity, mfgDate, bestBefore }) => ({ lineId, quantity, mfgDate, bestBefore })) },
      });
      toast(`${r.fileName} saved (${r.pages} pages). Opening Documents…`);
      onDone();
      router.push("/documents");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
        <Field label="Therapy period (days)"><Input type="number" min={1} max={730} value={days} onChange={e => changeDays(e.target.value)} /></Field>
        <Field label="Date on the documents"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="In therapy with us since (year)"><Input type="number" min={2000} max={2100} value={since} onChange={e => setSince(e.target.value)} /></Field>
      </div>
      <div className="mt-2 space-y-2">
        {lines.map((m, i) => (
          <div key={m.row_id} className={`rounded-xl p-3 ${items[i].include ? "bg-subtle" : "bg-white opacity-60"}`}>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={items[i].include} onChange={e => patch(i, { include: e.target.checked })} />
              {formOf(m.form).label.en}: {m.medicine_name} <span className="font-normal text-muted">· {m.dose} · {m.frequency}</span>
            </label>
            {items[i].include && (
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                <Input aria-label="Quantity in the parcel" placeholder="Quantity in parcel, e.g. 3600 ml" value={items[i].quantity} onChange={e => patch(i, { quantity: e.target.value, touched: true })} />
                <Input aria-label="Manufacture date" placeholder="Manufacture date (optional)" value={items[i].mfgDate} onChange={e => patch(i, { mfgDate: e.target.value })} />
                <Input aria-label="Best before" placeholder="Best before (optional)" value={items[i].bestBefore} onChange={e => patch(i, { bestBefore: e.target.value })} />
              </div>
            )}
          </div>
        ))}
      </div>
      <TextField label="Distributor for Montenegro (info sheet)" value={distributor} onChange={setDistributor} />
      <p className="text-xs text-muted">Ingredients, use and manufacturer come from <Link href="/products" className="underline">Herbal products</Link>. A product that is not there yet is named in the error, so it can be added.</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={make} disabled={busy}>{busy ? "Making documents…" : "Make DHL documents"}</Button>
      </div>
    </>
  );
}

/** Super Admin: letterhead, doctor block and standing advice printed on prescriptions, per language. */
function PrescriptionSettingsCard() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, reload } = useFetch<PrescriptionSettings>(can("users.manage") ? "/api/settings/prescription" : null);
  const [f, setF] = useState<PrescriptionSettings | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  if (!can("users.manage") || !data) return null;
  const set = (k: keyof PrescriptionSettings["en"]) => (v: string) => setF(s => ({ ...s!, [lang]: { ...s![lang], [k]: v } }));
  async function save() {
    try {
      await api("/api/settings/prescription", { method: "PUT", body: f });
      toast("Prescription settings saved");
      setF(null);
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }
  return (
    <Card title="Prescription settings" aside={<Button onClick={() => setF(f ? null : data)}>{f ? "Close" : "Edit letterhead and advice"}</Button>}>
      {!f ? <p className="m-0 text-sm text-muted">{data.en.letterhead.split("\n")[0]} · {data.en.doctor.split("\n")[1]} · {data.en.advice.split("\n").filter(Boolean).length} standing advice lines</p> : (
        <>
          <div className="mb-3 flex gap-2" role="group" aria-label="Language">
            {LANGS.map(([k, l]) => <button key={k} type="button" aria-pressed={lang === k} onClick={() => setLang(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${lang === k ? "bg-brand text-white" : "bg-hover text-ink-2"}`}>{l}</button>)}
          </div>
          <AreaField label="Letterhead (one line per row; the first is the large title)" value={f[lang].letterhead} onChange={set("letterhead")} rows={4} />
          <AreaField label="Doctor (one line per row; the second is the name)" value={f[lang].doctor} onChange={set("doctor")} rows={5} />
          <Field label="Title"><Input value={f[lang].title} onChange={e => set("title")(e.target.value)} /></Field>
          <AreaField label="Added after the first oral therapy" value={f[lang].oralNote} onChange={set("oralNote")} />
          <AreaField label="Standing advice (one numbered item per row, printed at the end)" value={f[lang].advice} onChange={set("advice")} rows={7} />
          <Button variant="primary" onClick={save}>Save settings</Button>
        </>
      )}
    </Card>
  );
}
