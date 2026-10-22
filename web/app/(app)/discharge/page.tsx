"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePatientData } from "@/lib/use-patient-data";
import type { Discharge } from "@/lib/types";
import { AreaField, Button, Card, DataList, PageHead, RequirePatient, ViewOnly } from "@/components/ui";

const blank = {
  admissionSummary: "", diagnoses: "", procedures: "", medicines: "", treatmentCourse: "",
  conditionAtDischarge: "", followupPlan: "", warnings: "",
};
const FIELDS: [keyof typeof blank, string][] = [
  ["admissionSummary", "Admission / presenting summary"], ["diagnoses", "Diagnoses"], ["procedures", "Procedures / treatments"],
  ["medicines", "Medicines on discharge"], ["treatmentCourse", "Treatment course"], ["conditionAtDischarge", "Condition at discharge"],
  ["followupPlan", "Follow-up plan"], ["warnings", "Warnings / safety advice"],
];

export default function DischargePage() {
  return (
    <>
      <PageHead title="Discharge Summary & Clinical Letters" subtitle="Versioned clinical discharge documentation stored centrally." />
      <RequirePatient><DischargeForm /></RequirePatient>
    </>
  );
}

function DischargeForm() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<Discharge[]>("discharge");
  const [f, setF] = useState(blank);
  async function save() {
    if (await post(f, "Discharge summary signed and saved")) setF(blank);
  }
  return (
    <>
      {!can("discharge.write") && <ViewOnly what="discharge summaries" />}
      {can("discharge.write") && (
      <Card>
        {FIELDS.map(([k, label]) => <AreaField key={k} label={label} value={f[k]} onChange={v => setF(s => ({ ...s, [k]: v }))} />)}
        <Button variant="primary" onClick={save}>Sign &amp; Save Discharge Summary</Button>
      </Card>
      )}
      <Card>
        <DataList items={data} loading={loading} error={error} empty="No discharge summaries." render={(x, i) => (
          <p key={x.id ?? i} className="my-2"><b>{(x.summary_date || x.discharge_date)?.slice(0, 10)}</b> — {x.followup_plan}</p>
        )} />
      </Card>
    </>
  );
}
