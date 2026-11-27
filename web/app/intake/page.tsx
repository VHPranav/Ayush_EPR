"use client";
// Tablet intake form (SAGLASNOST). Staff pick the patient (or "new patient"), then hand the tablet over.
// While the patient fills it in there is no navigation to the rest of the EPR: leaving needs the staff password.
// On submit the server stores the answers on the patient record and files the signed PDF under Documents.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, Search, UserPlus } from "lucide-react";
import { api, PATIENT_KEY } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { patientHome } from "@/lib/permissions";
import { errMsg, fmtDateEU } from "@/lib/format";
import { amountValue, blankAnswers, COUNTRY_CODES, INTAKE_STEPS, joinPhone, MONTHS, parseAmount, PERIODS, splitPhone, T, visibleAnswers, type Amount, type IntakeAnswers, type IntakeField } from "@/lib/intake-form";
import type { Patient, PatientSummary } from "@/lib/types";
import { Button, Modal } from "@/components/ui";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";

type Stage = "setup" | "form" | "done";
interface Target { patientId: string | null; label: string }
interface Result { patientId: string; uhid: string; fileName: string; newPatient: boolean }

/** English line with the Montenegrin translation underneath. */
function Bi({ t, className = "" }: { t: readonly [string, string]; className?: string }) {
  return (
    <span className={`block ${className}`}>
      <span className="block">{t[0]}</span>
      <span className="block text-[0.85em] font-normal text-muted">{t[1]}</span>
    </span>
  );
}

const big = "w-full rounded-2xl border border-line-strong bg-white px-4 py-4 text-lg text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-ring";

export default function IntakePage() {
  const { user, ready, can } = useAuth();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("setup");
  const [target, setTarget] = useState<Target | null>(null);
  const [answers, setAnswers] = useState<IntakeAnswers>(blankAnswers);
  const [result, setResult] = useState<Result | null>(null);
  const [unlock, setUnlock] = useState<null | "exit" | "done" | "back">(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  // While the tablet is with the patient, the browser Back button stays on this page.
  useEffect(() => {
    if (stage === "setup") return;
    const stay = () => window.history.pushState(null, "", window.location.href);
    stay();
    window.addEventListener("popstate", stay);
    const warn = (e: BeforeUnloadEvent) => { if (stage === "form") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("popstate", stay); window.removeEventListener("beforeunload", warn); };
  }, [stage]);

  const restart = useCallback(() => {
    setStage("setup");
    setTarget(null);
    setAnswers(blankAnswers());
    setResult(null);
  }, []);

  if (!ready || !user) return null;
  if (!can("intake.write")) {
    return (
      <Shell>
        <div className="rounded-3xl bg-white p-8 text-center shadow-card">
          <h1 className="text-xl font-semibold">You don&apos;t have access to the intake form</h1>
          <p className="mt-2 text-muted">Ask an administrator if you think this is a mistake.</p>
          <Button className="mt-6" onClick={() => router.push("/dashboard")}>Back to the EPR</Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {stage === "setup" && (
        <StaffSetup
          canRegister={can("patients.register")}
          onStart={(t, prefill) => { setTarget(t); setAnswers({ ...blankAnswers(), ...prefill }); setStage("form"); }}
          onLeave={() => router.push("/dashboard")}
        />
      )}
      {stage === "form" && target && (
        <PatientForm
          target={target}
          answers={answers}
          setAnswers={setAnswers}
          onExit={() => setUnlock("exit")}
          onDone={r => { setResult(r); setStage("done"); }}
        />
      )}
      {stage === "done" && (
        <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-good-soft text-good"><Check size={52} strokeWidth={2.5} /></div>
          <h1 className="text-4xl font-semibold text-ink"><Bi t={T.thanks} /></h1>
          <p className="mt-4 max-w-xl text-xl text-ink-2"><Bi t={T.thanksHint} /></p>
          {/* Both need the staff password: the tablet may still be in the patient's hands. */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => setUnlock("back")} className="px-5 py-3"><ArrowLeft size={18} /> Back to the EPR</Button>
            <Button onClick={() => setUnlock("done")} className="px-5 py-3"><Lock size={16} /> Next form</Button>
          </div>
        </div>
      )}

      <StaffUnlock
        open={unlock !== null}
        username={user.username}
        purpose={unlock === "exit" ? "Leave the form without saving? The patient's answers will be discarded."
          : unlock === "back" ? "Unlock the tablet to go back to the EPR with this patient open."
          : "Unlock the tablet to fill in a form for the next patient."}
        onClose={() => setUnlock(null)}
        onUnlocked={() => {
          const was = unlock;
          setUnlock(null);
          if (was === "exit") restart();
          if (was === "done") setStage("setup");
          // Back to the EPR with this patient open, on their chart (the intake answers are at the top of the Doctor page).
          if (was === "back" && result) {
            try { sessionStorage.setItem(PATIENT_KEY, result.patientId); } catch {}
            window.location.assign(patientHome(can));
          }
        }}
      >
        {unlock !== "exit" && result && (
          <p className="mb-3 rounded-xl bg-good-soft px-3.5 py-2.5 text-sm text-good">
            Saved {result.newPatient ? "and registered " : ""}<b>{result.uhid}</b>: answers on the patient record, <b>{result.fileName}</b> in Documents.
          </p>
        )}
      </StaffUnlock>

      {/* After unlocking from the thank-you screen staff land back on setup; offer the record from there. */}
      {stage === "setup" && result && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white px-4 py-3 shadow-pop">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
            <span className="text-sm text-ink-2">Last form saved for <b>{result.uhid}</b>.</span>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => setResult(null)}>Dismiss</Button>
              <Button variant="primary" onClick={() => { try { sessionStorage.setItem(PATIENT_KEY, result.patientId); } catch {} router.push("/documents"); }}>Open patient record</Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-panel">
      <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 md:px-8 md:pt-10">{children}</div>
    </div>
  );
}

// ── Staff: choose the patient ───────────────────────────────────────────────

function StaffSetup({ canRegister, onStart, onLeave }: {
  canRegister: boolean;
  onStart: (t: Target, prefill: IntakeAnswers) => void;
  onLeave: () => void;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PatientSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api<PatientSummary[]>("/api/patients?q=" + encodeURIComponent(q))
        .then(r => { if (live) { setList(r.slice(0, 20)); setError(""); } })
        .catch(e => { if (live) setError(errMsg(e)); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  async function choose(p: PatientSummary) {
    setBusy(p.patient_id);
    try {
      const full = await api<Patient>(`/api/patients/${p.patient_id}`);
      onStart({ patientId: full.patient_id, label: `${full.name} · ${full.uhid}` }, {
        name: full.name ?? "",
        dob: full.dob?.slice(0, 10) ?? "",
        phone: full.phone ?? "",
        email: full.email ?? "",
        address: full.address ?? "",
      });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-semibold leading-9 tracking-tight text-ink">Patient intake form</h1>
          <p className="mt-1 text-sm text-muted">Choose who is filling in the form, then hand the tablet to the patient. The signed form is saved to their record and Documents.</p>
        </div>
        <Button onClick={onLeave}><ArrowLeft size={16} /> Back to the EPR</Button>
      </div>

      {canRegister && (
        <button
          type="button"
          onClick={() => onStart({ patientId: null, label: "New patient" }, {})}
          className="mb-5 flex w-full items-center gap-4 rounded-2xl bg-brand px-6 py-5 text-left text-white shadow-card hover:bg-brand-hover"
        >
          <UserPlus size={28} />
          <span>
            <span className="block text-lg font-semibold">New patient</span>
            <span className="block text-sm text-white/80">The patient is registered from the form when they submit it.</span>
          </span>
          <ArrowRight className="ml-auto" />
        </button>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-card">
        <h2 className="m-0 mb-3 text-lg font-semibold">Existing patient</h2>
        <label className="relative block">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone or UHID" className={`${big} pl-11`} aria-label="Search patients" />
        </label>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-3 divide-y divide-line">
          {list === null ? <p className="py-6 text-center text-sm text-muted">Loading…</p> : list.length ? list.map(p => (
            <button
              key={p.patient_id}
              type="button"
              disabled={busy !== null}
              onClick={() => choose(p)}
              className="flex w-full items-center gap-3 px-2 py-4 text-left hover:bg-subtle disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{p.name}</span>
                <span className="block text-sm text-muted">{p.uhid} · DOB {fmtDateEU(p.dob)} · {p.phone || "no phone"}</span>
              </span>
              <span className="ml-auto text-sm font-semibold text-brand">{busy === p.patient_id ? "Opening…" : "Start form"}</span>
            </button>
          )) : <p className="py-6 text-center text-sm text-muted">No patients found.</p>}
        </div>
      </section>
    </>
  );
}

// ── Patient: the form ───────────────────────────────────────────────────────

function PatientForm({ target, answers, setAnswers, onExit, onDone }: {
  target: Target;
  answers: IntakeAnswers;
  setAnswers: (f: (a: IntakeAnswers) => IntakeAnswers) => void;
  onExit: () => void;
  onDone: (r: Result) => void;
}) {
  const REVIEW = INTAKE_STEPS.length;
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<readonly [string, string] | string | null>(null);
  const [signed, setSigned] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const top = useRef<HTMLDivElement>(null);
  const set = (k: string) => (v: string) => setAnswers(a => ({ ...a, [k]: v }));

  const go = (n: number) => {
    setProblem(null);
    setStep(n);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function check(n: number): readonly [string, string] | null {
    if (n !== 0) return null;
    if (!answers.name.trim()) return T.needName;
    if (answers.dob === "invalid") return T.badDate;
    if (answers.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email.trim())) return T.badEmail;
    return null;
  }

  function next() {
    const p = check(step);
    if (p) return setProblem(p);
    go(step + 1);
  }

  async function submit() {
    for (let i = 0; i < REVIEW; i++) { const p = check(i); if (p) { go(i); setProblem(p); return; } }
    if (!consent) return setProblem(T.needConsent);
    const signature = pad.current?.toDataUrl();
    if (!signature) return setProblem(T.needSign);
    setSending(true);
    setProblem(null);
    try {
      const r = await api<Result>("/api/intake-forms", { body: { patientId: target.patientId, answers: visibleAnswers(answers), signature } });
      onDone(r);
    } catch (e) {
      setProblem(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  const current = INTAKE_STEPS[step];
  return (
    <div ref={top} className="scroll-mt-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-muted">{T.title[0]} / {T.title[1]}</div>
        <button type="button" onClick={onExit} aria-label="Staff: leave the form" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-hover">
          <Lock size={14} /> Staff
        </button>
      </div>

      {/* Progress: one segment per step; earlier steps can be revisited by tapping them. */}
      <div className="mb-6 flex gap-1.5" aria-label={`${T.step[0]} ${step + 1} ${T.of[0]} ${REVIEW + 1}`}>
        {[...INTAKE_STEPS.map(s => s.en), T.review[0]].map((name, i) => (
          <button
            key={name}
            type="button"
            title={name}
            disabled={i > step}
            onClick={() => go(i)}
            className={`h-2.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-line-strong"} ${i < step ? "cursor-pointer" : ""}`}
          />
        ))}
      </div>
      <div className="mb-1 text-sm font-medium text-brand">{T.step[0]} {step + 1} {T.of[0]} {REVIEW + 1} · {T.step[1]} {step + 1} {T.of[1]} {REVIEW + 1}</div>
      <h1 className="mb-6 text-3xl font-semibold leading-tight text-ink">
        <Bi t={step < REVIEW ? [current.en, current.me] : T.review} />
      </h1>

      {step < REVIEW ? (
        <div className="space-y-6">
          {current.fields.filter(f => !f.showIf || answers[f.showIf] === "YES").map(f => (
            <Question key={f.key} field={f} value={answers[f.key]} onChange={set(f.key)} />
          ))}
          {step > 0 && <p className="text-sm text-muted"><Bi t={T.optional} /></p>}
        </div>
      ) : (
        <Review answers={answers} onEdit={go} />
      )}

      {step === REVIEW && (
        <div className="mt-8 space-y-5">
          <label className="flex cursor-pointer items-start gap-4 rounded-2xl bg-white p-5 shadow-card">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-7 w-7 shrink-0 accent-[var(--color-brand)]" />
            <span className="text-lg font-medium text-ink"><Bi t={T.consent} /></span>
          </label>
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <div className="mb-3 flex items-end justify-between gap-3">
              <span className="text-lg font-semibold text-ink"><Bi t={T.sign} /></span>
              <Button onClick={() => pad.current?.clear()} disabled={!signed}>{T.clear[0]} / {T.clear[1]}</Button>
            </div>
            <SignaturePad ref={pad} onChange={setSigned} label="Signature / Potpis" />
            <div className="mt-3 text-base text-ink-2">{T.date[0]} / {T.date[1]}: <b>{fmtDateEU(new Date())}</b></div>
          </div>
        </div>
      )}

      {/* Large, fixed navigation within thumb reach on a tablet. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {problem && (
            <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-3 text-base font-medium text-danger">
              {typeof problem === "string" ? problem : <Bi t={problem} />}
            </p>
          )}
          <div className="flex gap-3">
            {step > 0 && (
              <button type="button" onClick={() => go(step - 1)} className="inline-flex h-16 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-white px-6 text-lg font-semibold text-ink hover:bg-subtle">
                <ArrowLeft /> <span className="hidden sm:inline">{T.back[0]} / {T.back[1]}</span>
              </button>
            )}
            {step < REVIEW ? (
              <button type="button" onClick={next} className="inline-flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand text-lg font-semibold text-white hover:bg-brand-hover">
                {step === REVIEW - 1 ? `${T.review[0]} / ${T.review[1]}` : `${T.next[0]} / ${T.next[1]}`} <ArrowRight />
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={sending} className="inline-flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand text-lg font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
                {sending ? `${T.sending[0]} / ${T.sending[1]}` : <><Check /> {T.submit[0]} / {T.submit[1]}</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Question({ field: f, value, onChange }: { field: IntakeField; value: string; onChange: (v: string) => void }) {
  const label = <span className="mb-2 block text-lg font-semibold text-ink"><Bi t={[f.en, f.me]} /></span>;
  if (f.kind === "yesno") {
    return (
      <fieldset>
        <legend className="w-full">{label}</legend>
        <div className="grid grid-cols-2 gap-3">
          {(["YES", "NO"] as const).map(v => (
            <button
              key={v}
              type="button"
              aria-pressed={value === v}
              onClick={() => onChange(value === v ? "" : v)}
              className={`h-16 rounded-2xl border-2 text-lg font-semibold transition-colors ${value === v ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-ink hover:bg-subtle"}`}
            >
              {v === "YES" ? `${T.yes[0]} / ${T.yes[1]}` : `${T.no[0]} / ${T.no[1]}`}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  if (f.kind === "date") return <fieldset><legend className="w-full">{label}</legend><DateInput value={value} onChange={onChange} /></fieldset>;
  if (f.kind === "tel") return <fieldset><legend className="w-full">{label}</legend><PhoneInput value={value} onChange={onChange} placeholder={f.placeholder} /></fieldset>;
  if (f.kind === "amount") return <fieldset><legend className="w-full">{label}</legend><AmountInput field={f} value={value} onChange={onChange} /></fieldset>;
  return (
    <label className="block">
      {label}
      {f.kind === "long" ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className={`${big} min-h-[120px]`} />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={f.placeholder}
          type={f.kind === "email" ? "email" : "text"}
          inputMode={f.kind === "number" ? "decimal" : f.kind === "email" ? "email" : undefined}
          autoComplete={f.key === "name" ? "name" : f.kind === "email" ? "email" : "off"}
          className={big}
        />
      )}
    </label>
  );
}

/** Country code (Montenegro by default) + the number. Saved as one value: "+382 69123456". */
function PhoneInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [parts, setParts] = useState(() => splitPhone(value));
  const update = (k: "code" | "number", v: string) => {
    const p = { ...parts, [k]: v };
    setParts(p);
    onChange(joinPhone(p.code, p.number));
  };
  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] gap-3">
      <select aria-label={`${T.countryCode[0]} / ${T.countryCode[1]}`} value={parts.code} onChange={e => update("code", e.target.value)} className={big}>
        {COUNTRY_CODES.map(c => <option key={c.code + c.en} value={c.code}>{c.code}  {c.en}{c.me !== c.en ? ` / ${c.me}` : ""}</option>)}
      </select>
      <input
        value={parts.number}
        onChange={e => update("number", e.target.value)}
        placeholder={placeholder}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-label={`${T.phoneNumber[0]} / ${T.phoneNumber[1]}`}
        className={big}
      />
    </div>
  );
}

/** How much: a number, its unit (cigarettes, glasses …) and per day / week / month, plus "which?" where it applies. */
function AmountInput({ field: f, value, onChange }: { field: IntakeField; value: string; onChange: (v: string) => void }) {
  const [a, setA] = useState<Amount>(() => parseAmount(value, f));
  const update = (patch: Partial<Amount>) => {
    const next = { ...a, ...patch };
    setA(next);
    onChange(amountValue(next));
  };
  const chip = (on: boolean) => `h-14 rounded-2xl border-2 px-4 text-base font-semibold transition-colors ${on ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-ink hover:bg-subtle"}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={a.n}
          onChange={e => update({ n: e.target.value.replace(/[^\d.,]/g, "") })}
          inputMode="decimal"
          placeholder="0"
          aria-label={`${T.amount[0]} / ${T.amount[1]}`}
          className={`${big} w-28 text-center`}
        />
        {(f.units ?? []).map(([en, me]) => (
          <button key={en} type="button" aria-pressed={a.unit === en} onClick={() => update({ unit: en })} className={chip(a.unit === en)}>
            {en === me ? en : `${en} / ${me}`}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {PERIODS.map(([en, me]) => (
          <button key={en} type="button" aria-pressed={a.period === en} onClick={() => update({ period: en })} className={chip(a.period === en)}>
            {T.per[0]} {en} / {me}
          </button>
        ))}
      </div>
      {f.note && (
        <input value={a.note} onChange={e => update({ note: e.target.value })} placeholder={`${f.note[0]} / ${f.note[1]}`} aria-label={`${f.note[0]} / ${f.note[1]}`} className={big} />
      )}
    </div>
  );
}

/** Day / month / year pickers: quicker than a calendar for a birth date. Partial dates are held as "invalid". */
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [parts, setParts] = useState(() => (m ? { y: m[1], m: m[2], d: m[3] } : { y: "", m: "", d: "" }));
  const update = (k: "y" | "m" | "d", v: string) => {
    const p = { ...parts, [k]: v };
    setParts(p);
    if (!p.y && !p.m && !p.d) return onChange("");
    const ok = p.y && p.m && p.d && new Date(+p.y, +p.m - 1, +p.d).getDate() === +p.d;
    onChange(ok ? `${p.y}-${p.m}-${p.d}` : "invalid");
  };
  const cy = new Date().getFullYear();
  return (
    <div className="grid grid-cols-[1fr_2fr_1.3fr] gap-3">
      <select aria-label="Day / Dan" value={parts.d} onChange={e => update("d", e.target.value)} className={big}>
        <option value="">{T.day[0]} / {T.day[1]}</option>
        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map(d => <option key={d} value={d}>{+d}</option>)}
      </select>
      <select aria-label="Month / Mjesec" value={parts.m} onChange={e => update("m", e.target.value)} className={big}>
        <option value="">{T.month[0]} / {T.month[1]}</option>
        {MONTHS.map(([en, me], i) => <option key={en} value={String(i + 1).padStart(2, "0")}>{String(i + 1).padStart(2, "0")} · {en} / {me}</option>)}
      </select>
      <select aria-label="Year / Godina" value={parts.y} onChange={e => update("y", e.target.value)} className={big}>
        <option value="">{T.year[0]} / {T.year[1]}</option>
        {Array.from({ length: 111 }, (_, i) => String(cy - i)).map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

function Review({ answers, onEdit }: { answers: IntakeAnswers; onEdit: (step: number) => void }) {
  const show = (f: IntakeField) => {
    const v = answers[f.key];
    if (f.kind === "yesno") return v === "YES" ? `${T.yes[0]} / ${T.yes[1]}` : v === "NO" ? `${T.no[0]} / ${T.no[1]}` : "—";
    if (f.kind === "date" && v) return fmtDateEU(v);
    return v.trim() || "—";
  };
  return (
    <div className="space-y-4">
      <p className="text-base text-ink-2"><Bi t={T.reviewHint} /></p>
      {INTAKE_STEPS.map((s, i) => (
        <section key={s.en} className="rounded-2xl bg-white p-5 shadow-card">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h2 className="m-0 text-lg font-semibold text-ink"><Bi t={[s.en, s.me]} /></h2>
            <Button onClick={() => onEdit(i)}>{T.edit[0]} / {T.edit[1]}</Button>
          </div>
          <dl className="divide-y divide-line">
            {s.fields.filter(f => !f.showIf || answers[f.showIf] === "YES").map(f => (
              <div key={f.key} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[2fr_3fr] sm:gap-4">
                <dt className="text-sm font-medium text-muted">{f.en} / {f.me}</dt>
                <dd className="m-0 whitespace-pre-wrap break-words text-base text-ink">{show(f)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

// ── Staff password gate ─────────────────────────────────────────────────────

function StaffUnlock({ open, username, purpose, onClose, onUnlocked, children }: {
  open: boolean; username: string; purpose: string; onClose: () => void; onUnlocked: () => void; children?: ReactNode;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/verify-password", { body: { password } });
      setPassword("");
      onUnlocked();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { setPassword(""); setError(""); onClose(); }}
      title="Staff only"
      description={purpose}
      footer={<>
        <Button onClick={() => { setPassword(""); setError(""); onClose(); }}>Cancel</Button>
        <Button variant="primary" onClick={confirm} disabled={busy || !password}>{busy ? "Checking…" : "Unlock"}</Button>
      </>}
    >
      {children}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-2">Password for {username}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && password) confirm(); }}
          className="w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring"
        />
      </label>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
