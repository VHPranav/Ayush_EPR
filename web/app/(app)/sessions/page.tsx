"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { usePatientData } from "@/lib/use-patient-data";
import type { TreatmentSession } from "@/lib/types";
import { AreaField, Button, Card, DataList, Grid, PageHead, Pill, RequirePatient, SelectField, TextField, Field, Select, ViewOnly } from "@/components/ui";

const blank = {
  prescriptionTreatmentId: "", sessionDate: "", startTime: "", endTime: "", status: "COMPLETED", preAssessment: "", procedureNotes: "", materials: "",
  tolerance: "", adverseEvent: "", response: "", postAssessment: "",
};

export default function SessionsPage() {
  return (
    <>
      <PageHead title="Therapy / Panchakarma Sessions" subtitle="See what was prescribed, then record each session: assessment before and after, tolerance and any adverse event." />
      <RequirePatient><Sessions /></RequirePatient>
    </>
  );
}

function Sessions() {
  const { can } = useAuth();
  const toast = useToast();
  const { patient } = usePatient();
  const { data, loading, error, post } = usePatientData<TreatmentSession[]>("treatment-sessions");
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (v: string) => setF(s => ({ ...s, [k]: v }));
  // Today's date is filled in once mounted (wall-clock time can't be read during prerender); it can still be changed.
  useEffect(() => {
    const t = setTimeout(() => setF(s => s.sessionDate ? s : { ...s, sessionDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10) }), 0);
    return () => clearTimeout(t);
  }, []);
  const prescribed = (patient!.prescriptions ?? []).filter(rx => rx.status !== "CANCELLED").flatMap(rx => (rx.treatments ?? []).map(t => ({ ...t, rx: rx.prescription_no })));

  async function save() {
    if (f.status === "COMPLETED" && !f.procedureNotes.trim()) return toast("Describe the procedure that was done");
    if (f.startTime && f.endTime && f.endTime < f.startTime) return toast("The end time is before the start time");
    const body = { ...f, prescriptionTreatmentId: f.prescriptionTreatmentId || null };
    if (await post(body, "Treatment session saved")) setF({ ...blank, sessionDate: f.sessionDate, prescriptionTreatmentId: f.prescriptionTreatmentId });
  }

  return (
    <>
      {!can("sessions.write") && <ViewOnly what="therapy sessions" />}
      {prescribed.length > 0 && (
        <Card title="Prescribed treatments">
          <ul className="m-0 list-none divide-y divide-line p-0 text-sm">
            {prescribed.map((t, i) => (
              <li key={t.row_id ?? i} className="flex flex-wrap items-center gap-2 py-2">
                <b className="text-ink">{t.treatment_name}</b>
                <span className="text-ink-2">{[t.frequency, t.duration].filter(Boolean).join(" · ")}</span>
                <span className="ml-auto text-xs text-muted">{t.rx}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Previous sessions">
        <DataList items={data} loading={loading} error={error} empty="No therapy sessions yet." render={x => (
          <div key={x.id} className="border-b border-line py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <b>{fmtDate(x.session_date)}</b>
              {(x.start_time || x.end_time) && <span className="text-sm text-muted">{[x.start_time, x.end_time].map(t => t?.slice(0, 5)).filter(Boolean).join("–")}</span>}
              <Pill tone={x.status === "COMPLETED" ? "green" : x.status === "CANCELLED" ? "gray" : "amber"}>{x.status}</Pill>
              {x.treatment_name && <Pill tone="sky">{x.treatment_name}</Pill>}
              {x.practitioner_name && <span className="text-sm text-muted">· {x.practitioner_name}</span>}
            </div>
            {x.adverse_event && <div role="alert" className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger"><b>Adverse event:</b> {x.adverse_event}</div>}
            <dl className="m-0 mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-ink-2 md:grid-cols-2">
              {([["Procedure", x.procedure_notes], ["Before", x.pre_assessment], ["After", x.post_assessment], ["Tolerance", x.tolerance], ["Response", x.response], ["Materials", x.materials]] as const)
                .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="inline font-medium text-ink">{k}: </dt><dd className="inline">{v}</dd></div>)}
            </dl>
          </div>
        )} />
      </Card>

      {can("sessions.write") && (
        <Card title="Record a session">
          {prescribed.length > 0 && (
            <Field label="Prescribed treatment (optional)">
              <Select aria-label="Prescribed treatment" value={f.prescriptionTreatmentId} onChange={e => set("prescriptionTreatmentId")(e.target.value)}>
                <option value="">Not linked to a prescription</option>
                {prescribed.map((t, i) => <option key={t.row_id ?? i} value={t.row_id}>{t.treatment_name}{t.frequency ? ` · ${t.frequency}` : ""} ({t.rx})</option>)}
              </Select>
            </Field>
          )}
          <Grid cols={4}>
            <TextField label="Date" type="date" value={f.sessionDate} onChange={set("sessionDate")} />
            <TextField label="Start time" type="time" value={f.startTime} onChange={set("startTime")} />
            <TextField label="End time" type="time" value={f.endTime} onChange={set("endTime")} />
            <SelectField label="Status" value={f.status} onChange={set("status")} options={["COMPLETED", "PLANNED", "CANCELLED"]} />
          </Grid>
          <AreaField label="Assessment before" value={f.preAssessment} onChange={set("preAssessment")} />
          <AreaField label="Procedure / therapy done*" value={f.procedureNotes} onChange={set("procedureNotes")} />
          <AreaField label="Materials / products used" value={f.materials} onChange={set("materials")} />
          <Grid cols={3}>
            <TextField label="Tolerance" value={f.tolerance} onChange={set("tolerance")} />
            <TextField label="Adverse event (if any)" value={f.adverseEvent} onChange={set("adverseEvent")} />
            <TextField label="Response" value={f.response} onChange={set("response")} />
          </Grid>
          <AreaField label="Assessment after" value={f.postAssessment} onChange={set("postAssessment")} />
          <Button variant="primary" onClick={save}>Save session</Button>
        </Card>
      )}
    </>
  );
}
