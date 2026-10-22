"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { patientHome } from "@/lib/permissions";
import { useToast } from "@/lib/toast";
import type { CalAppt, PatientSummary } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { Button, Field, Input, Modal, Pill, Select } from "./ui";

const START_H = 7, END_H = 20, HOUR_H = 56;
const TYPES = ["FOLLOW-UP", "CONSULTATION", "THERAPY", "REVIEW"];
const LENGTHS = [15, 30, 45, 60, 90, 120];
const TYPE_STYLE: Record<string, string> = {
  "FOLLOW-UP": "border-[#23659c] bg-[#e2f0fd] text-[#174b78]",
  CONSULTATION: "border-good bg-good-soft text-good",
  THERAPY: "border-[#566b0f] bg-[#eef5d3] text-[#3f500b]",
  REVIEW: "border-[#5a49c2] bg-[#ece9fb] text-[#43379a]",
};

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekStart = (d: Date) => addDays(dayStart(d), -((d.getDay() + 6) % 7)); // Monday
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const endOf = (a: CalAppt) => new Date(new Date(a.appointment_at).getTime() + a.duration_minutes * 60_000);

type View = "day" | "week" | "month";

/** Places overlapping appointments side by side inside one column. */
function layout(items: CalAppt[]) {
  const sorted = [...items].sort((a, b) => +new Date(a.appointment_at) - +new Date(b.appointment_at));
  const out: { a: CalAppt; lane: number; lanes: number }[] = [];
  let cluster: typeof out = [], laneEnds: number[] = [], clusterEnd = 0;
  const close = () => { for (const c of cluster) c.lanes = laneEnds.length; out.push(...cluster); cluster = []; laneEnds = []; };
  for (const a of sorted) {
    const s = +new Date(a.appointment_at), e = +endOf(a);
    if (cluster.length && s >= clusterEnd) close();
    let lane = laneEnds.findIndex(le => le <= s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
    clusterEnd = Math.max(clusterEnd, e);
    cluster.push({ a, lane, lanes: 1 });
  }
  close();
  return out;
}

export function AppointmentCalendar() {
  const { can, user } = useAuth();
  const canWrite = can("appointments.write");
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date(0));
  const [now, setNow] = useState<Date | null>(null);
  const [doctor, setDoctor] = useState("");
  const [selected, setSelected] = useState<CalAppt | null>(null);
  const [slot, setSlot] = useState<{ date: string; time: string; provider: string } | null>(null);

  // Wall-clock time can't be read during prerender: "today" is set once mounted. Doctors start on their own day.
  useEffect(() => {
    const t = setTimeout(() => setNow(new Date()), 0);
    return () => clearTimeout(t);
  }, []);
  const today = now ?? new Date(0);
  const cur = anchor.getTime() === 0 ? today : anchor;

  const range = useMemo(() => {
    if (view === "day") { const s = dayStart(cur); return [s, addDays(s, 1)] as const; }
    if (view === "week") { const s = weekStart(cur); return [s, addDays(s, 7)] as const; }
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1); const s = weekStart(first); return [s, addDays(s, 42)] as const;
  }, [view, cur]);

  const ready = now !== null;
  const { data, error, reload } = useFetch<CalAppt[]>(ready ? `/api/appointments?from=${encodeURIComponent(range[0].toISOString())}&to=${encodeURIComponent(range[1].toISOString())}` : null);
  const { data: providers } = useFetch<{ user_id: string; display_name: string }[]>(canWrite ? "/api/providers" : null);
  const docs = useMemo(() => {
    const m = new Map<string, string>();
    providers?.forEach(p => m.set(p.user_id, p.display_name));
    data?.forEach(a => { if (a.provider_user && !m.has(a.provider_user)) m.set(a.provider_user, a.provider_name ?? "Doctor"); });
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [providers, data]);

  // A signed-in doctor sees their own appointments first: preselect them once the list of doctors is known.
  const [didPreselect, setDidPreselect] = useState(false);
  useEffect(() => {
    if (didPreselect || !user || !docs.length) return;
    const t = setTimeout(() => { if (docs.some(d => d.id === user.id)) { setDoctor(user.id); setView("day"); } setDidPreselect(true); }, 0);
    return () => clearTimeout(t);
  }, [didPreselect, user, docs]);

  const shown = (data ?? []).filter(a => !doctor || a.provider_user === doctor);
  const move = (dir: -1 | 1) => setAnchor(view === "month" ? new Date(cur.getFullYear(), cur.getMonth() + dir, 1) : addDays(cur, dir * (view === "week" ? 7 : 1)));
  const title = view === "day" ? cur.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : view === "week" ? `${range[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${addDays(range[1], -1).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
    : cur.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function book(date: Date, minutes: number, provider: string) {
    if (!canWrite) return;
    const start = new Date(date); start.setHours(START_H, 0, 0, 0); start.setMinutes(minutes);
    if (now && start.getTime() < now.getTime() - 5 * 60_000) return; // the server re-checks
    setSlot({ date: ymd(start), time: hhmm(start), provider });
  }

  const days = view === "day" ? [dayStart(cur)] : Array.from({ length: 7 }, (_, i) => addDays(range[0], i));
  // Day view: one column per doctor (plus anyone unassigned); week view: one column per day.
  const dayCols = view === "day"
    ? [...(doctor ? docs.filter(d => d.id === doctor) : docs).map(d => ({ key: d.id, label: d.name, provider: d.id })), ...(shown.some(a => !a.provider_user) ? [{ key: "none", label: "No doctor set", provider: "" }] : [])]
    : [];
  const columns = view === "day"
    ? (dayCols.length ? dayCols : [{ key: "none", label: "Appointments", provider: "" }]).map(c => ({ ...c, date: days[0], items: shown.filter(a => sameDay(new Date(a.appointment_at), days[0]) && (c.key === "none" ? !a.provider_user : a.provider_user === c.provider)) }))
    : days.map(d => ({ key: ymd(d), label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }), provider: doctor, date: d, items: shown.filter(a => sameDay(new Date(a.appointment_at), d)) }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setAnchor(new Date())}>Today</Button>
        <Button aria-label="Previous" onClick={() => move(-1)}><ChevronLeft size={16} /></Button>
        <Button aria-label="Next" onClick={() => move(1)}><ChevronRight size={16} /></Button>
        <h2 className="m-0 mx-2 text-lg font-semibold text-ink">{ready ? title : "…"}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label="View" className="flex gap-1 rounded-xl bg-hover p-1">
            {(["day", "week", "month"] as View[]).map(v => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${view === v ? "bg-white text-ink shadow-xs" : "text-ink-2 hover:text-ink"}`}>{v}</button>
            ))}
          </div>
          {docs.length > 0 && (
            <Select aria-label="Doctor" className="!w-auto" value={doctor} onChange={e => setDoctor(e.target.value)}>
              <option value="">All doctors</option>
              {docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          )}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {TYPES.map(t => <span key={t} className={`rounded-md border-l-4 px-2 py-0.5 ${TYPE_STYLE[t]}`}>{t.toLowerCase()}</span>)}
        {canWrite && <span className="text-muted">Click an empty slot to book.</span>}
      </div>
      {error ? <p className="text-sm text-danger">Could not load appointments: {error}</p> : null}

      {view === "month" ? (
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-line text-sm">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <div key={d} className="bg-subtle px-2 py-2 text-center text-xs font-medium text-muted">{d}</div>)}
          {Array.from({ length: 42 }, (_, i) => addDays(range[0], i)).map(d => {
            const items = shown.filter(a => sameDay(new Date(a.appointment_at), d) && a.status !== "CANCELLED");
            return (
              <button key={ymd(d)} type="button" onClick={() => { setAnchor(d); setView("day"); }}
                className={`min-h-[92px] border-t border-l border-line p-1.5 text-left align-top hover:bg-subtle ${d.getMonth() !== cur.getMonth() ? "bg-subtle/60 text-muted" : ""}`}>
                <span className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${ready && sameDay(d, today) ? "bg-brand text-white" : ""}`}>{d.getDate()}</span>
                {items.slice(0, 3).map(a => <span key={a.appointment_id} className={`mb-0.5 block truncate rounded border-l-2 px-1 text-[11px] ${TYPE_STYLE[a.type ?? ""] ?? "border-line-strong bg-hover"}`}>{hhmm(new Date(a.appointment_at))} {a.name}</span>)}
                {items.length > 3 && <span className="text-[11px] text-muted">+{items.length - 3} more</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <div style={{ minWidth: 56 + columns.length * (view === "day" ? 170 : 120) }}>
            <div className="flex border-b border-line bg-subtle">
              <div className="w-14 shrink-0" />
              {columns.map(c => (
                <div key={c.key} className={`flex-1 px-2 py-2 text-center text-sm font-medium ${view === "week" && ready && sameDay(c.date, today) ? "text-brand" : "text-ink-2"}`}>{ready ? c.label : "\u00a0"}</div>
              ))}
            </div>
            <div className="flex">
              <div className="w-14 shrink-0">
                {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} style={{ height: HOUR_H }} className="pr-2 text-right text-[11px] text-muted"><span className="relative -top-2">{String(START_H + i).padStart(2, "0")}:00</span></div>)}
              </div>
              {columns.map(c => (
                <div key={c.key} role="presentation" style={{ height: (END_H - START_H) * HOUR_H, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_H / 2 - 1}px, var(--color-line) ${HOUR_H / 2 - 1}px, var(--color-line) ${HOUR_H / 2}px)` }}
                  className={`relative flex-1 border-l border-line ${canWrite ? "cursor-pointer hover:bg-subtle/50" : ""}`}
                  onClick={e => { const r = e.currentTarget.getBoundingClientRect(); const mins = Math.floor(((e.clientY - r.top) / HOUR_H) * 2) * 30; book(c.date, mins, c.provider); }}>
                  {ready && sameDay(c.date, today) && today.getHours() >= START_H && today.getHours() < END_H && (
                    <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-danger" style={{ top: ((today.getHours() * 60 + today.getMinutes() - START_H * 60) / 60) * HOUR_H }} />
                  )}
                  {layout(c.items).map(({ a, lane, lanes }) => {
                    const s = new Date(a.appointment_at);
                    const top = ((s.getHours() * 60 + s.getMinutes() - START_H * 60) / 60) * HOUR_H;
                    if (top < -HOUR_H || top > (END_H - START_H) * HOUR_H) return null;
                    return (
                      <button key={a.appointment_id} type="button" onClick={e => { e.stopPropagation(); setSelected(a); }}
                        style={{ top: Math.max(top, 0), height: Math.max((a.duration_minutes / 60) * HOUR_H - 2, 22), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                        className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs leading-tight ${TYPE_STYLE[a.type ?? ""] ?? "border-line-strong bg-hover text-ink-2"} ${a.status === "CANCELLED" ? "opacity-40 line-through" : a.status === "COMPLETED" ? "opacity-70" : ""}`}>
                        <b className="block truncate">{hhmm(s)} {a.name}</b>
                        {a.duration_minutes >= 30 && <span className="block truncate opacity-80">{[a.type?.toLowerCase(), view === "week" ? a.provider_name : null].filter(Boolean).join(" · ")}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <DetailsModal appt={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload(); }} docs={docs} />
      <BookingModal slot={slot} onClose={() => setSlot(null)} onSaved={() => { setSlot(null); reload(); }} docs={docs} />
    </div>
  );
}

/** Calls the API and, when the server reports a double-booking, asks before repeating the call with confirmClash. */
async function withClashCheck<T>(send: (confirmClash: boolean) => Promise<T>): Promise<T | undefined> {
  try {
    return await send(false);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && window.confirm(e.message)) return send(true);
    throw e;
  }
}

function DetailsModal({ appt, onClose, onChanged, docs }: { appt: CalAppt | null; onClose: () => void; onChanged: () => void; docs: { id: string; name: string }[] }) {
  const { can } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { open } = usePatient();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ date: "", time: "", minutes: "30", provider: "" });
  const canWrite = can("appointments.write") && appt?.status === "SCHEDULED";

  useEffect(() => {
    if (!appt) return;
    const s = new Date(appt.appointment_at);
    const t = setTimeout(() => { setEditing(false); setF({ date: ymd(s), time: hhmm(s), minutes: String(appt.duration_minutes), provider: appt.provider_user ?? "" }); }, 0);
    return () => clearTimeout(t);
  }, [appt]);

  async function put(body: Record<string, unknown>, message: string) {
    try {
      await withClashCheck(c => api(`/api/appointments/${appt!.appointment_id}`, { method: "PUT", body: { ...body, confirmClash: c } }));
      toast(message);
      onChanged();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  async function openPatient() {
    try { await open(appt!.patient_id); onClose(); router.push(patientHome(can)); } catch (e) { toast(errMsg(e)); }
  }

  if (!appt) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const s = new Date(appt.appointment_at);
  return (
    <Modal open onClose={onClose} title={appt.name} description={`${appt.uhid} · ${s.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}, ${hhmm(s)}–${hhmm(endOf(appt))}`}
      footer={<>
        {can("patients.view") && <Button onClick={openPatient}>Open patient</Button>}
        {canWrite && !editing && <Button onClick={() => setEditing(true)}>Reschedule</Button>}
        {canWrite && <Button onClick={() => put({ status: "COMPLETED" }, "Marked as completed")}>Complete</Button>}
        {canWrite && <Button variant="danger" onClick={() => { if (window.confirm(`Cancel the appointment for ${appt.name}?`)) put({ status: "CANCELLED" }, "Appointment cancelled"); }}>Cancel appointment</Button>}
      </>}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone={appt.status === "SCHEDULED" ? "green" : appt.status === "COMPLETED" ? "gray" : "amber"}>{appt.status}</Pill>
        {appt.type && <Pill tone="sky">{appt.type.toLowerCase()}</Pill>}
        <span className="text-ink-2">{appt.provider_name ? `with ${appt.provider_name}` : "No doctor set"} · {appt.duration_minutes} min</span>
      </div>
      {appt.reason && <p className="mb-0 mt-3 text-sm text-ink-2">Reason: {appt.reason}</p>}
      {editing && canWrite && (
        <div className="mt-4 rounded-xl bg-subtle p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={f.date} onChange={e => setF(x => ({ ...x, date: e.target.value }))} /></Field>
            <Field label="Time"><Input type="time" value={f.time} onChange={e => setF(x => ({ ...x, time: e.target.value }))} /></Field>
            <Field label="Length"><Select value={f.minutes} onChange={e => setF(x => ({ ...x, minutes: e.target.value }))}>{LENGTHS.map(m => <option key={m} value={m}>{m} min</option>)}</Select></Field>
            <Field label="Doctor"><Select value={f.provider} onChange={e => setF(x => ({ ...x, provider: e.target.value }))}><option value="">No doctor set</option>{docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => {
              if (!f.date || !f.time) return toast("Choose a date and time");
              put({ appointmentAt: new Date(`${f.date}T${f.time}`).toISOString(), durationMinutes: Number(f.minutes), providerUser: f.provider || null }, "Appointment moved");
            }}>Save changes</Button>
            <Button onClick={() => setEditing(false)}>Back</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BookingModal({ slot, onClose, onSaved, docs }: { slot: { date: string; time: string; provider: string } | null; onClose: () => void; onSaved: () => void; docs: { id: string; name: string }[] }) {
  const { can } = useAuth();
  const toast = useToast();
  const { patient } = usePatient();
  const [picked, setPicked] = useState<{ id: string; name: string; uhid: string } | null>(null);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [f, setF] = useState({ date: "", time: "", minutes: "30", type: "CONSULTATION", provider: "", reason: "" });

  useEffect(() => {
    if (!slot) return;
    const t = setTimeout(() => {
      setF({ date: slot.date, time: slot.time, minutes: "30", type: "CONSULTATION", provider: slot.provider, reason: "" });
      setPicked(patient ? { id: patient.patient_id, name: patient.name, uhid: patient.uhid } : null);
      setQ(""); setTerm("");
    }, 0);
    return () => clearTimeout(t);
  }, [slot, patient]);
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data: results } = useFetch<PatientSummary[]>(slot && !picked && can("patients.view") && term.length >= 2 ? `/api/patients?q=${encodeURIComponent(term)}` : null);

  async function save() {
    if (!picked) return toast("Choose the patient");
    if (!f.date || !f.time) return toast("Choose a date and time");
    const when = new Date(`${f.date}T${f.time}`);
    if (when.getTime() < Date.now() - 5 * 60_000) return toast("The appointment cannot be in the past");
    try {
      await withClashCheck(c => api(`/api/patients/${picked.id}/appointments`, { body: { appointmentAt: when.toISOString(), durationMinutes: Number(f.minutes), type: f.type, reason: f.reason, providerUser: f.provider || null, confirmClash: c } }));
      toast(`Booked ${picked.name} · ${f.time}`);
      onSaved();
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <Modal open={!!slot} onClose={onClose} title="Book an appointment" description="Fill in the details; the slot you clicked is already chosen."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Book</Button></>}>
      <Field label="Patient">
        {picked ? (
          <div className="flex items-center gap-2"><b className="text-sm">{picked.name}</b><Pill>{picked.uhid}</Pill><Button onClick={() => setPicked(null)}>Change</Button></div>
        ) : (
          <>
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, UHID or phone" aria-label="Search patient" autoFocus />
            {results && results.length > 0 && (
              <ul className="m-0 mt-1 max-h-44 list-none overflow-y-auto rounded-xl border border-line p-1">
                {results.slice(0, 6).map(p => <li key={p.patient_id}><button type="button" onClick={() => setPicked({ id: p.patient_id, name: p.name, uhid: p.uhid })} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle"><b>{p.name}</b> <span className="text-muted">{p.uhid}</span></button></li>)}
              </ul>
            )}
            {results && !results.length && term.length >= 2 && <p className="mt-1 text-xs text-muted">No patients found.</p>}
          </>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={f.date} onChange={e => setF(x => ({ ...x, date: e.target.value }))} /></Field>
        <Field label="Time"><Input type="time" value={f.time} onChange={e => setF(x => ({ ...x, time: e.target.value }))} /></Field>
        <Field label="Length"><Select value={f.minutes} onChange={e => setF(x => ({ ...x, minutes: e.target.value }))}>{LENGTHS.map(m => <option key={m} value={m}>{m} min</option>)}</Select></Field>
        <Field label="Type"><Select value={f.type} onChange={e => setF(x => ({ ...x, type: e.target.value }))}>{TYPES.map(t => <option key={t}>{t}</option>)}</Select></Field>
      </div>
      <Field label="Doctor"><Select value={f.provider} onChange={e => setF(x => ({ ...x, provider: e.target.value }))}><option value="">Any available doctor</option>{docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      <Field label="Reason"><Input value={f.reason} onChange={e => setF(x => ({ ...x, reason: e.target.value }))} /></Field>
    </Modal>
  );
}
