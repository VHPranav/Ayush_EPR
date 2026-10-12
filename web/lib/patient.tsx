"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, PATIENT_KEY } from "./api";
import type { Patient } from "./types";

interface PatientState {
  patient: Patient | null;
  open: (id: string) => Promise<Patient>;
  /** Re-fetches the open patient (clinical records, prescriptions, ...). */
  refresh: () => Promise<void>;
  close: () => void;
}

const PatientContext = createContext<PatientState | null>(null);

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error("usePatient must be used inside <PatientProvider>");
  return ctx;
}

export function PatientProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<Patient | null>(null);

  const open = useCallback(async (id: string) => {
    const p = await api<Patient>(`/api/patients/${id}`);
    setPatient(p);
    try { sessionStorage.setItem(PATIENT_KEY, p.patient_id); } catch {}
    return p;
  }, []);

  const refresh = useCallback(async () => {
    if (!patient) return;
    setPatient(await api<Patient>(`/api/patients/${patient.patient_id}`));
  }, [patient]);

  const close = useCallback(() => {
    setPatient(null);
    try { sessionStorage.removeItem(PATIENT_KEY); } catch {}
  }, []);

  // Restore the open patient after a page reload.
  useEffect(() => {
    let id: string | null = null;
    try { id = sessionStorage.getItem(PATIENT_KEY); } catch {}
    if (!id) return;
    let alive = true;
    api<Patient>(`/api/patients/${id}`)
      .then(p => { if (alive) setPatient(cur => cur ?? p); }) // don't clobber a patient opened meanwhile
      .catch(() => { try { sessionStorage.removeItem(PATIENT_KEY); } catch {} });
    return () => { alive = false; };
  }, []);

  return <PatientContext.Provider value={{ patient, open, refresh, close }}>{children}</PatientContext.Provider>;
}
