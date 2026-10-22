"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { FollowUp } from "@/lib/types";
import { Select } from "@/components/ui";
import { Button, Card, Empty, Grid, PageHead, PatientBar, SelectField, Table, TextField, Td } from "@/components/ui";

export default function AppointmentsPage() {
  const { patient } = usePatient();
  const { can } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState("FOLLOW-UP");
  const [reason, setReason] = useState("");
  const { data: list, error, reload } = useFetch<FollowUp[]>("/api/reception/followups?days=365");
  const { data: providers } = useFetch<{ user_id: string; display_name: string }[]>(can("appointments.write") ? "/api/providers" : null);
  const [provider, setProvider] = useState("");
  // Minimum date for the picker. Wall-clock time can't be read during prerender, so it is set once mounted.
  const [today, setToday] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setToday(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)), 0);
    return () => clearTimeout(t);
  }, []);

  async function setStatus(x: FollowUp, status: "COMPLETED" | "CANCELLED") {
    if (!x.appointment_id) return;
    if (status === "CANCELLED" && !window.confirm(`Cancel the appointment for ${x.name}?`)) return;
    try {
      await api(`/api/appointments/${x.appointment_id}`, { method: "PUT", body: { status } });
      toast(status === "COMPLETED" ? "Marked as completed" : "Appointment cancelled");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  async function save() {
    if (!date || !time) return toast("Choose a date and time");
    if (new Date(`${date}T${time}`).getTime() < Date.now() - 5 * 60_000) return toast("The appointment cannot be in the past");
    try {
      await api(`/api/patients/${patient!.patient_id}/appointments`, { body: { appointmentAt: new Date(`${date}T${time}`).toISOString(), type, reason, providerUser: provider || null } });
      setReason("");
      toast("Appointment saved centrally");
      reload();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <>
      <PageHead title="Appointments / Follow-up" subtitle="Appointments are saved centrally and visible to Reception." />
      <PatientBar />
      {!can("appointments.write") ? null : patient ? (
        <Card>
          <Grid cols={4}>
            <TextField label="Date" type="date" min={today || undefined} value={date} onChange={setDate} />
            <TextField label="Time" type="time" value={time} onChange={setTime} />
            <SelectField label="Type" value={type} onChange={setType} options={["FOLLOW-UP", "CONSULTATION", "THERAPY", "REVIEW"]} />
            <TextField label="Reason" value={reason} onChange={setReason} />
          </Grid>
          {providers?.length ? (
            <div className="max-w-sm">
              <label className="my-2 block"><span className="mb-1.5 block text-sm font-medium text-ink-2">Doctor (optional)</span>
                <Select aria-label="Doctor" value={provider} onChange={e => setProvider(e.target.value)}>
                  <option value="">Any available doctor</option>
                  {providers.map(p => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
                </Select>
              </label>
            </div>
          ) : null}
          <Button variant="primary" onClick={save}>Save &amp; book</Button>
        </Card>
      ) : (
        <Card><Empty>Open a patient in Reception to book an appointment.</Empty></Card>
      )}
      <Card title="Upcoming appointments">
        {error ? <Empty>Could not load appointments: {error}</Empty> : list === null ? <Empty>Loading…</Empty> : list.length ? (
          <Table head={can("appointments.write") ? ["Date/time", "Patient", "UHID", "Type", "Reason", ""] : ["Date/time", "Patient", "UHID", "Type", "Reason"]}>
            {list.map((x, i) => (
              <tr key={x.appointment_id ?? i}>
                <Td>{fmtDateTime(x.appointment_at)}</Td><Td>{x.name}</Td><Td>{x.uhid}</Td><Td>{x.type}</Td><Td>{x.reason}</Td>
                {can("appointments.write") && (
                  <Td>
                    <span className="flex gap-1.5">
                      <Button onClick={() => setStatus(x, "COMPLETED")}>Complete</Button>
                      <Button variant="danger" onClick={() => setStatus(x, "CANCELLED")}>Cancel</Button>
                    </span>
                  </Td>
                )}
              </tr>
            ))}
          </Table>
        ) : <Empty>No upcoming appointments.</Empty>}
      </Card>
    </>
  );
}
