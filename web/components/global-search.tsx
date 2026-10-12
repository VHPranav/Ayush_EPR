"use client";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/format";
import { usePatient } from "@/lib/patient";
import { patientHome } from "@/lib/permissions";
import { useToast } from "@/lib/toast";
import type { PatientSummary } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { Avatar } from "./ui";

/** Top-bar patient search (⌘K / Ctrl+K). Picking a result opens the patient and goes to their first allowed page. */
export function GlobalSearch() {
  const { can } = useAuth();
  const { open } = usePatient();
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const [idx, setIdx] = useState(0);

  // Debounce what we send to the API.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searching = can("patients.view") && term.length >= 2;
  const { data, loading, error } = useFetch<PatientSummary[]>(searching ? `/api/patients?q=${encodeURIComponent(term)}` : null);
  const results = data?.slice(0, 6) ?? [];
  const showPanel = focused && q.trim().length >= 2;

  async function pick(p: PatientSummary) {
    try {
      await open(p.patient_id);
      setQ("");
      setTerm("");
      inputRef.current?.blur();
      router.push(patientHome(can));
    } catch (e) {
      toast(errMsg(e));
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results[idx]) { e.preventDefault(); pick(results[idx]); }
    else if (e.key === "Escape") inputRef.current?.blur();
  }

  if (!can("patients.view")) return <div />;

  return (
    <div className="relative w-full max-w-[380px]">
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={inputRef}
        value={q}
        onChange={e => { setQ(e.target.value); setIdx(0); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        placeholder="Search patients by name, UHID or phone"
        aria-label="Search patients"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        className="w-full rounded-xl border border-line-strong bg-white py-2.5 pl-10 pr-14 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-ring"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md bg-hover px-1.5 py-0.5 text-[11px] font-medium text-muted md:block">⌘ K</kbd>

      {showPanel && (
        <ul id="global-search-results" role="listbox" className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 m-0 list-none overflow-hidden rounded-2xl bg-white p-1.5 shadow-pop">
          {error ? <li className="px-3 py-4 text-center text-sm text-muted">Could not search: {error}</li>
            : loading || term !== q.trim() ? <li className="px-3 py-4 text-center text-sm text-muted">Searching…</li>
            : results.length === 0 ? <li className="px-3 py-4 text-center text-sm text-muted">No patients found</li>
            : results.map((p, i) => (
              <li key={p.patient_id} role="option" aria-selected={i === idx}>
                {/* onMouseDown (not onClick) so the pick happens before the input loses focus and closes the panel */}
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pick(p); }}
                  onMouseEnter={() => setIdx(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === idx ? "bg-subtle" : ""}`}
                >
                  <Avatar name={p.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.uhid}{p.phone ? ` · ${p.phone}` : ""}</span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
