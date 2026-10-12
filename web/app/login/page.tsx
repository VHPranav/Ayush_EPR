"use client";
import { Eye, EyeOff, ScrollText, ShieldCheck, Stethoscope } from "lucide-react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DottedGlobe } from "@/components/dotted-globe";
import { Button, Field, Input } from "@/components/ui";
import { DEMO, checkHealth } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/format";

// Only the static demo build gets the role picker; `DEMO` is a build-time constant, so real builds drop it.
const DemoRolePicker = DEMO ? dynamic(() => import("@/components/demo-role-picker")) : null;

type Health = "checking" | "online" | "db-down" | "offline";

const HEALTH_TEXT: Record<Health, string> = {
  checking: "Checking server…",
  online: "All systems operational",
  "db-down": "Database unavailable",
  offline: "Server offline",
};
const DOT: Record<Health, string> = { checking: "bg-line-strong", online: "bg-good", "db-down": "bg-danger", offline: "bg-danger" };

const REMEMBER_KEY = "AYUSH_REMEMBER_USERNAME";

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Health>("checking");

  // Pre-fill the username remembered on this device (only the username is ever stored, never the password).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(REMEMBER_KEY);
        if (saved) setUsername(saved);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const check = async () => setHealth(await checkHealth());
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {}
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      {/* ---- Left: sign in ---- */}
      <div className="flex min-h-screen flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl object-contain" priority />
          <div className="leading-tight">
            <div className="text-base font-semibold text-ink">Ayush EPR</div>
            <div className="text-xs text-muted">Ayurveda &amp; Yoga Therapy Centre</div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <form onSubmit={submit} className="w-full max-w-[400px]">
            <h1 className="m-0 text-center text-[30px] font-semibold tracking-tight text-ink">Sign in to Ayush EPR</h1>
            <p className="mb-8 mt-2 text-center text-sm text-muted">Enter your staff username and password to continue.</p>

            <Field label="Username">
              <Input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required className="py-3" />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required className="py-3 pr-12" />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:bg-hover hover:text-ink"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>

            <label className="mb-5 mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              Remember my username on this device
            </label>

            {error && (
              <div role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</div>
            )}

            <Button variant="primary" type="submit" className="w-full py-3 text-[15px]" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>

            <p className="mt-6 text-center text-sm text-muted">
              {DEMO ? "Demo build: use the role cards below, or any username above with the password demo." : "Forgot your password? Ask your administrator to reset it."}
            </p>
            {DemoRolePicker && <DemoRolePicker />}
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span className="flex items-center gap-2" role="status"><span className={`h-2 w-2 rounded-full ${DOT[health]}`} aria-hidden /> {HEALTH_TEXT[health]}</span>
          <span>Authorised staff only. Access is logged.</span>
        </div>
      </div>

      {/* ---- Right: brand panel with the dotted globe ---- */}
      <aside className="relative isolate hidden overflow-hidden bg-[linear-gradient(155deg,#0b3326_0%,#12493a_52%,#1b6a4f_100%)] text-white lg:block" aria-hidden={false}>
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.03)_0_1px,transparent_1px_8px)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0b3326] via-[#0b3326]/70 to-transparent" />

        <div className="absolute -right-[22%] -top-[2%] aspect-square w-[118%]">
          <DottedGlobe className="h-full w-full" />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-16">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#9fe3c0]">Ayush &amp; Vivum · Central EPR</div>
          <h2 className="m-0 mt-4 max-w-[520px] text-[40px] font-semibold leading-[1.1] tracking-tight">Integrative care, on one secure record.</h2>
          <p className="mt-4 max-w-[480px] text-base leading-relaxed text-[#cfeee0]">
            Assessments, therapies, prescriptions, pharmacy and billing for Ayurveda, yoga and physiotherapy — in one place for every team.
          </p>
          <ul className="m-0 mt-8 flex list-none flex-wrap gap-3 p-0 text-sm">
            {[
              { icon: ShieldCheck, label: "Role-based access" },
              { icon: ScrollText, label: "Full audit trail" },
              { icon: Stethoscope, label: "One central patient record" },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 backdrop-blur-sm">
                <Icon size={16} className="text-[#9fe3c0]" aria-hidden /> {label}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
