"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { afterRegister, patientHome } from "@/lib/permissions";
import { errMsg, fmtDate } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import type { Patient, PatientSummary } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";

interface PatientNumbers { next: number; highestUsed: number; year: number }
import { AreaField, Button, Card, Empty, Field, Grid, PageHead, Pill, Select, SelectField, Table, TextField, Td } from "@/components/ui";

// ── Constants ────────────────────────────────────────────────────────────────

const BLOOD_GROUPS = ["", "A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"];

const NATIONALITIES = [
  "", "Indian", "Afghan", "Bangladeshi", "Bhutanese", "Chinese", "Nepalese",
  "Pakistani", "Sri Lankan", "American", "Australian", "British", "Canadian",
  "French", "German", "Japanese", "Russian", "Other",
];

const REFERRAL_SOURCES = [
  "", "Walk-in", "Doctor referral", "Hospital referral", "Online / Website",
  "Social media", "Friend / Family", "Camp / Health drive", "Other",
];

const MONTHS = [
  { v: "", l: "Month" },
  { v: "01", l: "January" }, { v: "02", l: "February" }, { v: "03", l: "March" },
  { v: "04", l: "April" },  { v: "05", l: "May" },       { v: "06", l: "June" },
  { v: "07", l: "July" },   { v: "08", l: "August" },    { v: "09", l: "September" },
  { v: "10", l: "October" },{ v: "11", l: "November" },  { v: "12", l: "December" },
];

const DAYS  = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
const CY    = new Date().getFullYear();
const YEARS = Array.from({ length: 121 }, (_, i) => String(CY - i));

// ── Blank form state ─────────────────────────────────────────────────────────

const blank = {
  first: "", middle: "", last: "",
  dobDay: "", dobMonth: "", dobYear: "",
  sex: "Female", phone: "", email: "",
  blood: "", nationality: "",
  referral: "", insurance: "Self-pay",
  address: "", allergies: "",
  emergencyName: "", emergencyPhone: "",
  physician: "",
};

function buildDob(day: string, month: string, year: string): string {
  if (!day || !month || !year) return "";
  return `${year}-${month}-${day}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReceptionPage() {
  const router = useRouter();
  const toast = useToast();
  const { open } = usePatient();
  const { can } = useAuth();
  const [f, setF] = useState(blank);
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
  const { data: numbers, reload: reloadNumbers } = useFetch<PatientNumbers>("/api/settings/patient-number");
  const set = (k: keyof typeof blank) => (v: string) => setF(s => ({ ...s, [k]: v }));

  const load = useCallback(async () => {
    try {
      setPatients(await api<PatientSummary[]>("/api/patients?q=" + encodeURIComponent(q)));
    } catch (e) {
      toast(errMsg(e));
    }
  }, [q, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search-as-you-type
    return () => clearTimeout(t);
  }, [load]);

  async function save() {
    if (!f.first.trim() || !f.last.trim()) return toast("First and last name are required");
    const fullName = [f.first, f.middle, f.last].filter(Boolean).join(" ").trim();
    const dob = buildDob(f.dobDay, f.dobMonth, f.dobYear);
    const emergency = [f.emergencyName, f.emergencyPhone].filter(Boolean).join(" — ");
    try {
      // Warn before creating a second record for the same person (same name + date of birth, or same phone).
      const found = await api<PatientSummary[]>("/api/patients?q=" + encodeURIComponent(f.phone.trim() || f.last.trim()));
      const dup = found.find(p => (f.phone.trim() && p.phone === f.phone.trim()) || (p.name.toLowerCase() === fullName.toLowerCase() && !!dob && p.dob === dob));
      if (dup && !window.confirm(`${dup.name} (${dup.uhid}) looks like the same person. Register a new record anyway?`)) return;
      const p = await api<Patient>("/api/patients", {
        body: {
          name: [f.first, f.middle, f.last].filter(Boolean).join(" "),
          dob, sex: f.sex, phone: f.phone, email: f.email,
          nationality: f.nationality, blood: f.blood,
          insurance: f.insurance, emergency, referral: f.referral,
          physician: f.physician, address: f.address,
        },
      });
      if (f.allergies.trim()) {
        // The old UI collected this field but never sent it; store it as an allergy record.
        await api(`/api/patients/${p.patient_id}/allergies`, { body: { allergen: f.allergies.trim() } })
          .catch(() => toast("Patient saved, but the allergy note could not be stored"));
      }
      toast("Patient saved: " + p.uhid);
      reloadNumbers();
      await open(p.patient_id);
      router.push(afterRegister(can));
    } catch (e) {
      toast(errMsg(e));
    }
  }

  /** Opens the patient and continues to their chart, or to Appointments to book a visit. */
  async function openPatient(id: string, to: string) {
    try {
      const p = await open(id);
      toast("Opened " + p.name + " (" + p.uhid + ")");
      router.push(to);
    } catch (e) {
      toast(errMsg(e));
    }
  }

  // Shared class for raw <input type="tel"> — matches the `control` string in ui.tsx
  const telClass =
    "w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm text-ink " +
    "placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring";

  return (
    <>
      <PageHead title="Patients" subtitle={can("patients.register") ? "Register a new patient, or search the directory and open an existing record." : "Search the directory and open a patient's record."} actions={can("patients.register") ? <Button variant="primary" onClick={() => { setF(blank); window.scrollTo({ top: 0, behavior: "smooth" }); }}>New patient</Button> : undefined} />

      {can("patients.register") && (
        <Card title="Patient Registration" aside={<Pill>{numbers ? `Next patient number: ${numbers.next}/${numbers.year}` : "Patient number assigned on save"}</Pill>}>
          {/* Its own <form>: the browser's autofill then fills only these fields, never the search boxes. */}
          <form autoComplete="on" onSubmit={e => { e.preventDefault(); save(); }}>

          {/* Name + DOB on one row */}
          <Grid cols={4}>
            <TextField label="First name *" name="given-name" autoComplete="given-name" value={f.first} onChange={set("first")} placeholder="Given name" />
            <TextField label="Middle name" name="additional-name" autoComplete="additional-name" value={f.middle} onChange={set("middle")} placeholder="Optional" />
            <TextField label="Last name *" name="family-name" autoComplete="family-name" value={f.last}  onChange={set("last")}  placeholder="Family / surname" />
            {/* DOB — compact Day / Month / Year inline */}
            <Field label="Date of birth">
              <div className="grid grid-cols-3 gap-1.5">
                <Select value={f.dobDay}   onChange={e => set("dobDay")(e.target.value)}   aria-label="Day">
                  <option value="">DD</option>
                  {DAYS.map(d => <option key={d} value={d}>{parseInt(d, 10)}</option>)}
                </Select>
                <Select value={f.dobMonth} onChange={e => set("dobMonth")(e.target.value)} aria-label="Month">
                  {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </Select>
                <Select value={f.dobYear}  onChange={e => set("dobYear")(e.target.value)}  aria-label="Year">
                  <option value="">YYYY</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </Select>
              </div>
            </Field>
          </Grid>

          {/* Sex / Phone / Email / Blood group */}
          <Grid cols={4}>
            <SelectField label="Sex" value={f.sex} onChange={set("sex")} options={["Female", "Male", "Other"]} />
            <Field label="Phone">
              <input type="tel" name="tel" autoComplete="tel" value={f.phone} onChange={e => set("phone")(e.target.value)}
                placeholder="Enter your phone number" className={telClass} />
            </Field>
            <TextField label="Email" type="email" name="email" autoComplete="email" value={f.email} onChange={set("email")} placeholder="patient@email.com" />
            <Field label="Blood group">
              <Select value={f.blood} onChange={e => set("blood")(e.target.value)} aria-label="Blood group">
                {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g === "" ? "— Select —" : g}</option>)}
              </Select>
            </Field>
          </Grid>

          {/* Nationality / Referral source / Payment type */}
          <Grid cols={3}>
            <Field label="Nationality">
              <Select value={f.nationality} onChange={e => set("nationality")(e.target.value)} aria-label="Nationality">
                {NATIONALITIES.map(n => <option key={n} value={n}>{n === "" ? "— Select —" : n}</option>)}
              </Select>
            </Field>
            <Field label="Referral source">
              <Select value={f.referral} onChange={e => set("referral")(e.target.value)} aria-label="Referral source">
                {REFERRAL_SOURCES.map(r => <option key={r} value={r}>{r === "" ? "— Select —" : r}</option>)}
              </Select>
            </Field>
            <SelectField label="Payment type" value={f.insurance} onChange={set("insurance")} options={["Self-pay", "Insurance"]} />
          </Grid>

          {/* Address / Allergies */}
          <Grid cols={2}>
            <AreaField label="Address" name="street-address" autoComplete="street-address" value={f.address} onChange={set("address")} placeholder="Street, city, state, PIN code" />
            <AreaField label="Allergies / ADR" name="allergies" autoComplete="off" value={f.allergies} onChange={set("allergies")} placeholder="Known drug or food allergies…" />
          </Grid>

          {/* Emergency contact (name + phone) / Physician */}
          <Grid cols={4}>
            <TextField label="Emergency contact name" name="emergency-name" autoComplete="off" value={f.emergencyName}  onChange={set("emergencyName")}  placeholder="Full name" />
            <Field label="Emergency contact phone">
              <input type="tel" name="emergency-phone" autoComplete="off" value={f.emergencyPhone} onChange={e => set("emergencyPhone")(e.target.value)}
                placeholder="Enter emergency contact phone" className={telClass} />
            </Field>
            <TextField label="Primary physician" name="physician" autoComplete="off" value={f.physician} onChange={set("physician")} placeholder="Assigned doctor" />
            <div /> {/* spacer */}
          </Grid>

          <div className="mt-2">
            <Button variant="primary" type="submit">Save &amp; generate UHID</Button>
          </div>
          </form>
        </Card>
      )}

      {/* Patient directory */}
      <Card
        title="Patient Directory"
        aside={
          <input type="search" name="directory-search" autoComplete="off" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search UHID / name / phone" aria-label="Search the patient directory"
            className="w-full max-w-[300px] rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring"
          />
        }
      >
        {patients === null ? <Empty>Loading…</Empty> : patients.length ? (
          <Table head={["UHID", "Name", "DOB", "Sex", "Phone", ""]}>
            {patients.map(p => (
              <tr key={p.patient_id}>
                <Td>{p.uhid}</Td><Td>{p.name}</Td><Td>{fmtDate(p.dob)}</Td><Td>{p.sex || "—"}</Td><Td>{p.phone || "—"}</Td>
                <Td>
                  <span className="flex justify-end gap-1.5">
                    <Button variant="primary" onClick={() => openPatient(p.patient_id, patientHome(can))}>Open</Button>
                    {can("appointments.write") && <Button onClick={() => openPatient(p.patient_id, "/appointments")}>Book visit</Button>}
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No patients found.{can("patients.register") ? " Use the form above to register one." : ""}</Empty>}
      </Card>

      {can("users.manage") && numbers && <PatientNumberCard numbers={numbers} onSaved={reloadNumbers} />}
    </>
  );
}

/** Super Admin: where the running patient number continues (e.g. after the last number in the paper records). */
function PatientNumberCard({ numbers, onSaved }: { numbers: PatientNumbers; onSaved: () => void }) {
  const toast = useToast();
  const [next, setNext] = useState("");
  async function save() {
    try {
      const r = await api<PatientNumbers>("/api/settings/patient-number", { method: "PUT", body: { next: Number(next) } });
      toast(`The next patient will be ${r.next}/${r.year}`);
      setNext("");
      onSaved();
    } catch (e) {
      toast(errMsg(e));
    }
  }
  return (
    <Card title="Patient numbers">
      <p className="mt-0 text-sm text-ink-2">
        Patients are numbered <b>running number / year they started</b>: the next new patient gets <b>{numbers.next}/{numbers.year}</b>.
        The number keeps counting across years; only the year changes. {numbers.highestUsed ? `Highest number in use: ${numbers.highestUsed}.` : ""}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48"><TextField label="Continue from number" type="number" min={numbers.highestUsed + 1} value={next} onChange={setNext} placeholder={String(numbers.next)} /></div>
        <Button variant="primary" onClick={save} disabled={!next} className="mb-2">Set next number</Button>
      </div>
    </Card>
  );
}
