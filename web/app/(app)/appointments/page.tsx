"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { useToast } from "@/lib/toast";
import { useFetch } from "@/lib/use-fetch";
import type { FollowUp } from "@/lib/types";
import { Select } from "@/components/ui";
import { AppointmentCalendar } from "@/components/appointment-calendar";
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
  const [tab, setTab] = useState<"calendar" | "list">("calendar");
  const [booked, setBooked] = useState<{ id: string; text: string } | null>(null);
  const [onlyThis, setOnlyThis] = useState(true);
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  // Minimum date for the picker. Wall-clock time can't be read during prerender, so it is set once mounted.
  const [today, setToday] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setToday(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)), 0);
    return () => clearTimeout(t);
  }, []);

  const single = onlyThis && !!patient; // one patient's list: the Patient and UHID columns would only repeat the header
  const shown = (list ?? []).filter(x => !(onlyThis && patient) || !x.patient_id || x.patient_id === patient.patient_id);

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
      const when = new Date(`${date}T${time}`);
      const made = await api<{ appointment_id: string }>(`/api/patients/${patient!.patient_id}/appointments`, { body: { appointmentAt: when.toISOString(), type, reason, providerUser: provider || null } });
      const doc = providers?.find(p => p.user_id === provider)?.display_name;
      setBooked({ id: made.appointment_id, text: `${patient!.name} · ${fmtDateTime(when.toISOString())} · ${type.toLowerCase()}${doc ? ` · ${doc}` : ""}` });
      setReason("");
      reload();
      setTimeout(() => confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <>
      <PageHead title="Appointments" subtitle={tab === "calendar" ? "See each doctor's day and week. Click a free slot to book, or an appointment for details." : "Book a visit for the open patient, and see who is coming next."}
        actions={
          <div role="tablist" aria-label="Appointments view" className="flex gap-1 rounded-xl bg-hover p-1">
            {([["calendar", "Calendar"], ["list", "List"]] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-white text-ink shadow-xs" : "text-ink-2 hover:text-ink"}`}>{label}</button>
            ))}
          </div>
        } />
      {tab === "calendar" ? <Card><AppointmentCalendar /></Card> : <>
      <PatientBar />
      {booked && (
        <div ref={confirmRef} role="status" className="mb-5 rounded-2xl bg-good-soft p-5 text-good">
          <div className="font-semibold">Appointment booked</div>
          <div className="mt-1 text-sm">{booked.text}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => { setBooked(null); setDate(""); setTime(""); }}>Book another</Button>
            {can("billing.read") && <Link href="/billing"><Button>Go to Billing</Button></Link>}
          </div>
        </div>
      )}
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
      <Card
        title="Upcoming appointments"
        aside={patient ? <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={onlyThis} onChange={e => setOnlyThis(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" /> Only {patient.name}</label> : undefined}
      >
        {error ? <Empty>Could not load appointments: {error}</Empty> : list === null ? <Empty>Loading…</Empty> : shown.length ? (
          <Table head={[...(single ? ["Date/time"] : ["Date/time", "Patient", "UHID"]), "Type", "Doctor", "Reason", ...(can("appointments.write") ? [""] : [])]}>
            {shown.map((x, i) => (
              <tr key={x.appointment_id ?? i} ref={x.appointment_id === booked?.id ? rowRef : undefined} className={x.appointment_id === booked?.id ? "[&>td]:bg-good-soft" : undefined}>
                <Td>{fmtDateTime(x.appointment_at)}</Td>{!single && <><Td>{x.name}</Td><Td>{x.uhid}</Td></>}<Td>{x.type}</Td><Td>{x.provider_name || "—"}</Td><Td>{x.reason}</Td>
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
        ) : <Empty>{onlyThis && patient ? "No upcoming appointments for this patient." : "No upcoming appointments."}</Empty>}
      </Card>
      </>}
    </>
  );
}
