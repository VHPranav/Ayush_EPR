"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { FollowUp } from "@/lib/types";
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

  async function save() {
    if (!date || !time) return toast("Choose a date and time");
    try {
      await api(`/api/patients/${patient!.patient_id}/appointments`, { body: { appointmentAt: `${date}T${time}`, type, reason } });
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
            <TextField label="Date" type="date" value={date} onChange={setDate} />
            <TextField label="Time" type="time" value={time} onChange={setTime} />
            <SelectField label="Type" value={type} onChange={setType} options={["FOLLOW-UP", "CONSULTATION", "THERAPY", "REVIEW"]} />
            <TextField label="Reason" value={reason} onChange={setReason} />
          </Grid>
          <Button variant="primary" onClick={save}>Save &amp; book</Button>
        </Card>
      ) : (
        <Card><Empty>Open a patient in Reception to book an appointment.</Empty></Card>
      )}
      <Card title="Upcoming appointments">
        {error ? <Empty>Could not load appointments: {error}</Empty> : list === null ? <Empty>Loading…</Empty> : list.length ? (
          <Table head={["Date/time", "Patient", "UHID", "Type", "Reason"]}>
            {list.map((x, i) => (
              <tr key={i}><Td>{fmtDateTime(x.appointment_at)}</Td><Td>{x.name}</Td><Td>{x.uhid}</Td><Td>{x.type}</Td><Td>{x.reason}</Td></tr>
            ))}
          </Table>
        ) : <Empty>No upcoming appointments.</Empty>}
      </Card>
    </>
  );
}
