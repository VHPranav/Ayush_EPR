"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { afterRegister } from "@/lib/permissions";
import { errMsg, fmtDate } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import type { Patient, PatientSummary } from "@/lib/types";
import { AreaField, Button, Card, Empty, Grid, PageHead, Pill, SelectField, Table, TextField, Td } from "@/components/ui";

const blank = {
  first: "", middle: "", last: "", dob: "", sex: "Female", phone: "", email: "", blood: "", nationality: "",
  referral: "", insurance: "Self-pay", address: "", allergies: "", emergency: "", physician: "",
};

export default function ReceptionPage() {
  const router = useRouter();
  const toast = useToast();
  const { open } = usePatient();
  const { can } = useAuth();
  const [f, setF] = useState(blank);
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
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
    try {
      const p = await api<Patient>("/api/patients", {
        body: {
          name: [f.first, f.middle, f.last].filter(Boolean).join(" "),
          dob: f.dob, sex: f.sex, phone: f.phone, email: f.email, nationality: f.nationality, blood: f.blood,
          insurance: f.insurance, emergency: f.emergency, referral: f.referral, physician: f.physician, address: f.address,
        },
      });
      if (f.allergies.trim()) {
        // The old UI collected this field but never sent it; store it as an allergy record.
        await api(`/api/patients/${p.patient_id}/allergies`, { body: { allergen: f.allergies.trim() } }).catch(() => toast("Patient saved, but the allergy note could not be stored"));
      }
      toast("Patient saved: " + p.uhid);
      await open(p.patient_id);
      router.push(afterRegister(can));
    } catch (e) {
      toast(errMsg(e));
    }
  }

  async function openPatient(id: string) {
    try {
      const p = await open(id);
      toast("Opened " + p.uhid);
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <>
      <PageHead title="Reception" subtitle="Registration is written directly to the central database." actions={can("patients.register") ? <Button variant="primary" onClick={() => setF(blank)}>New patient</Button> : undefined} />
      {can("patients.register") && (
      <Card title="Patient Registration" aside={<Pill>UHID assigned centrally on save</Pill>}>
        <Grid cols={4}>
          <TextField label="First name*" value={f.first} onChange={set("first")} />
          <TextField label="Middle name" value={f.middle} onChange={set("middle")} />
          <TextField label="Last name*" value={f.last} onChange={set("last")} />
          <TextField label="DOB" type="date" value={f.dob} onChange={set("dob")} />
        </Grid>
        <Grid cols={4}>
          <SelectField label="Sex" value={f.sex} onChange={set("sex")} options={["Female", "Male", "Other"]} />
          <TextField label="Phone" value={f.phone} onChange={set("phone")} />
          <TextField label="Email" type="email" value={f.email} onChange={set("email")} />
          <TextField label="Blood group" value={f.blood} onChange={set("blood")} />
        </Grid>
        <Grid cols={3}>
          <TextField label="Nationality" value={f.nationality} onChange={set("nationality")} />
          <TextField label="Referral source" value={f.referral} onChange={set("referral")} />
          <SelectField label="Payment type" value={f.insurance} onChange={set("insurance")} options={["Self-pay", "Insurance"]} />
        </Grid>
        <Grid cols={2}>
          <AreaField label="Address" value={f.address} onChange={set("address")} />
          <AreaField label="Allergies / ADR" value={f.allergies} onChange={set("allergies")} />
        </Grid>
        <Grid cols={2}>
          <TextField label="Emergency contact" value={f.emergency} onChange={set("emergency")} />
          <TextField label="Primary physician" value={f.physician} onChange={set("physician")} />
        </Grid>
        <Button variant="primary" onClick={save}>Save &amp; generate UHID</Button>
      </Card>
      )}

      <Card
        title="Patient Directory"
        aside={<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search UHID / name / phone" className="w-full max-w-[300px] rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring" />}
      >
        {patients === null ? <Empty>Loading…</Empty> : patients.length ? (
          <Table head={["UHID", "Name", "DOB", "Sex", "Phone", ""]}>
            {patients.map(p => (
              <tr key={p.patient_id}>
                <Td>{p.uhid}</Td><Td>{p.name}</Td><Td>{fmtDate(p.dob)}</Td><Td>{p.sex || "—"}</Td><Td>{p.phone || "—"}</Td>
                <Td><Button onClick={() => openPatient(p.patient_id)}>Open</Button></Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No patients found. Click &quot;New patient&quot; above to register one.</Empty>}
      </Card>
    </>
  );
}
