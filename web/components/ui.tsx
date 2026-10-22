"use client";
import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";
import { usePatient } from "@/lib/patient";
import { fmtDate } from "@/lib/format";

const control =
  "w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted";

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="m-0 text-[28px] font-semibold leading-9 tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, aside, children, bodyClass = "p-6" }: { title?: string; aside?: ReactNode; children: ReactNode; bodyClass?: string }) {
  return (
    <section className="mb-5 overflow-hidden rounded-2xl bg-white shadow-card">
      {title && (
        <div className="flex items-center justify-between gap-3 px-6 pb-1 pt-5">
          <h3 className="m-0 text-lg font-semibold text-ink">{title}</h3>
          {aside}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

type Tone = "gray" | "green" | "red" | "amber" | "lavender" | "lime" | "rose" | "sky";
const tones: Record<Tone, string> = {
  gray: "bg-hover text-ink-2",
  green: "bg-good-soft text-good",
  red: "bg-danger-soft text-danger",
  amber: "bg-warn-soft text-warn",
  lavender: "bg-[#ece9fb] text-[#5a49c2]",
  lime: "bg-[#eef5d3] text-[#566b0f]",
  rose: "bg-[#fde8f0] text-[#b0305c]",
  sky: "bg-[#e2f0fd] text-[#23659c]",
};
export function Pill({ children, tone = "green" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function Grid({ cols, children }: { cols: 2 | 3 | 4; children: ReactNode }) {
  // Two columns on medium screens, the full count only on wide ones, so date/time/select boxes stay readable.
  const c = { 2: "md:grid-cols-2", 3: "md:grid-cols-2 xl:grid-cols-3", 4: "md:grid-cols-2 xl:grid-cols-4" }[cols];
  return <div className={`grid grid-cols-1 gap-4 ${c}`}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="my-2 block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

export const Input = ({ className = "", ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={`${control} ${className}`} {...p} />;
export const Select = ({ className = "", ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={`${control} ${className}`} {...p} />;
export const Textarea = ({ className = "", ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={`${control} min-h-[88px] ${className}`} {...p} />;

/** Input / Select / Textarea wrapped with a label, bound to a string. */
export function TextField({ label, value, onChange, ...p }: { label: string; value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return <Field label={label}><Input value={value} onChange={e => onChange(e.target.value)} {...p} /></Field>;
}
export function AreaField({ label, value, onChange, ...p }: { label: string; value: string; onChange: (v: string) => void } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value">) {
  return <Field label={label}><Textarea value={value} onChange={e => onChange(e.target.value)} {...p} /></Field>;
}
export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o}>{o}</option>)}
      </Select>
    </Field>
  );
}

type Variant = "default" | "primary" | "danger";
export function Button({ variant = "default", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v = {
    default: "border-line-strong bg-white text-ink hover:bg-subtle",
    primary: "border-brand bg-brand text-white shadow-xs hover:border-brand-hover hover:bg-brand-hover",
    danger: "border-[#f0c4c1] bg-white text-danger hover:bg-danger-soft",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}
      {...p}
    />
  );
}

/** Rounded header bar and rounded hover rows (border-separate so the corners can be rounded). */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            {head.map(h => (
              <th key={h} className="bg-subtle px-4 py-3 text-left text-sm font-medium text-muted first:rounded-l-xl last:rounded-r-xl">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:hover>td]:bg-subtle [&>tr>td:first-child]:rounded-l-xl [&>tr>td:last-child]:rounded-r-xl">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children }: { children?: ReactNode }) => <td className="px-4 py-3.5 text-left align-middle text-ink-2 first:font-medium first:text-ink">{children}</td>;

const AVATAR_TONES = [
  "bg-[#ece9fb] text-[#5a49c2]", "bg-[#eef5d3] text-[#566b0f]", "bg-[#fde8f0] text-[#b0305c]",
  "bg-[#e2f0fd] text-[#23659c]", "bg-[#fff0d6] text-[#9a5a06]", "bg-brand-soft text-brand",
];
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("");
  const tone = AVATAR_TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length];
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.38 }} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tone}`} aria-hidden>
      {initials || "?"}
    </span>
  );
}

function ageOf(dob: string | null) {
  const m = dob && /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!m) return null;
  const now = new Date();
  let a = now.getFullYear() - +m[1];
  if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) a--;
  return a >= 0 ? a : null;
}

export function PatientBar() {
  const { patient: p } = usePatient();
  if (!p) return null;
  const age = ageOf(p.dob);
  return (
    <div className="mb-5 rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center gap-3.5">
        <Avatar name={p.name} size={44} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-base font-semibold text-ink">{p.name}</b> <Pill>{p.uhid}</Pill>
          </div>
          <div className="mt-0.5 text-sm text-muted">{age !== null ? `${age} yrs · ` : ""}DOB {fmtDate(p.dob)} · {p.sex || "—"} · {p.phone || "—"}</div>
        </div>
      </div>
      {p.allergies?.length ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          <b>Allergies:</b>
          {p.allergies.filter((a, i, all) => all.findIndex(b => b.allergen.toLowerCase() === a.allergen.toLowerCase() && b.severity === a.severity) === i).map(a => <span key={a.id} className="font-medium">{a.allergen}{a.severity ? ` (${a.severity})` : ""}{a.reaction ? ` — ${a.reaction}` : ""}</span>)}
        </div>
      ) : null}
    </div>
  );
}

/** Wraps pages that need an open patient; replaces the old "Open a patient first" toast. */
export function RequirePatient({ children }: { children: ReactNode }) {
  const { patient } = usePatient();
  if (patient) return <><PatientBar />{children}</>;
  return (
    <Card>
      <Empty>
        Open a patient first. Use the search bar above, or{" "}
        <Link href="/reception" className="font-semibold text-brand underline">go to Reception</Link> and choose one from the directory.
      </Empty>
    </Card>
  );
}

/** Renders a loaded list, or the loading / error / empty state. */
export function DataList<T>({ items, loading, error, empty, render }: {
  items: T[] | null; loading: boolean; error: string; empty: string; render: (item: T, i: number) => ReactNode;
}) {
  if (error) return <Empty>Could not load: {error}</Empty>;
  if (loading) return <Empty>Loading…</Empty>;
  if (!items?.length) return <Empty>{empty}</Empty>;
  return <>{items.map((it, i) => render(it, i))}</>;
}

/** Headline-number card: label, big value, optional delta chip and footer content. */
export function StatCard({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-card">
      <div className="text-base font-semibold text-ink">{label}</div>
      <div className="mt-5 text-[32px] font-semibold leading-9 tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-3 flex items-center gap-2 text-sm text-muted">{hint}</div>}
      {children}
    </section>
  );
}

/** Modal dialog built on the native <dialog> element (focus trap, Esc to close). Children mount only while open, so forms reset. */
export function Modal({ open, onClose, title, description, children, footer, width = "max-w-lg" }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-3xl bg-white p-0 text-ink shadow-pop backdrop:bg-ink/40`}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
            <div>
              <h2 className="m-0 text-xl font-semibold text-ink">{title}</h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-m-1 rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-ink"><X size={18} /></button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-6 pb-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
