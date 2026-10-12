"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePatientData } from "@/lib/use-patient-data";
import type { TreatmentSession } from "@/lib/types";
import { Button, Card, DataList, Grid, Input, PageHead, Pill, RequirePatient, Select, Textarea } from "@/components/ui";

const blank = {
  sessionDate: "", startTime: "", endTime: "", status: "COMPLETED", preAssessment: "", procedureNotes: "", materials: "",
  tolerance: "", adverseEvent: "", response: "", postAssessment: "",
};

export default function SessionsPage() {
  return (
    <>
      <PageHead title="Therapy / Panchakarma Sessions" subtitle="Record each treatment session, pre/post assessment, tolerance and adverse events." />
      <RequirePatient><Sessions /></RequirePatient>
    </>
  );
}

function Sessions() {
  const { can } = useAuth();
  const { data, loading, error, post } = usePatientData<TreatmentSession[]>("treatment-sessions");
  const [f, setF] = useState(blank);
  const bind = (k: keyof typeof blank) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value })) });
  async function save() {
    if (await post(f, "Treatment session saved")) setF(blank);
  }
  return (
    <>
      {can("sessions.write") && (
      <Card>
        <div className="space-y-2">
          <Grid cols={4}>
            <Input type="date" aria-label="Session date" {...bind("sessionDate")} />
            <Input type="time" aria-label="Start time" {...bind("startTime")} />
            <Input type="time" aria-label="End time" {...bind("endTime")} />
            <Select aria-label="Status" {...bind("status")}>{["COMPLETED", "PLANNED", "CANCELLED"].map(o => <option key={o}>{o}</option>)}</Select>
          </Grid>
          <Textarea placeholder="Pre-assessment" {...bind("preAssessment")} />
          <Textarea placeholder="Procedure / therapy notes" {...bind("procedureNotes")} />
          <Textarea placeholder="Materials / products" {...bind("materials")} />
          <Grid cols={3}>
            <Input placeholder="Tolerance" {...bind("tolerance")} />
            <Input placeholder="Adverse event" {...bind("adverseEvent")} />
            <Input placeholder="Response" {...bind("response")} />
          </Grid>
          <Textarea placeholder="Post-assessment" {...bind("postAssessment")} />
          <Button variant="primary" onClick={save}>Save Session</Button>
        </div>
      </Card>
      )}
      <Card>
        <DataList items={data} loading={loading} error={error} empty="No therapy sessions." render={x => (
          <p key={x.id} className="my-2"><b>{x.session_date?.slice(0, 10)}</b> {x.start_time}-{x.end_time} <Pill>{x.status}</Pill><br />{x.procedure_notes}</p>
        )} />
      </Card>
    </>
  );
}
