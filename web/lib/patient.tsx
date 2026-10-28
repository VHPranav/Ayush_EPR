"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, PATIENT_KEY } from "./api";
import { PatientRequests } from "./patient-requests";
import type { Patient } from "./types";

interface PatientState {
  patient: Patient | null;
  switching: boolean;
  open: (id: string) => Promise<Patient>;
  /** Re-fetches the open patient (clinical records, prescriptions, ...). */
  refresh: () => Promise<void>;
  close: () => void;
  markDirty: () => void;
}

const PatientContext = createContext<PatientState | null>(null);

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error("usePatient must be used inside <PatientProvider>");
  return ctx;
}

export function PatientProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [switching, setSwitching] = useState(false);

  const requests = useRef(new PatientRequests());
  const dirty = useRef(false);
  const markDirty = useCallback(() => { dirty.current = true; }, []);
  const allowLeave = useCallback(() => !dirty.current || window.confirm("Leave this patient? Unsaved entries will be discarded. Saved records are kept."), []);

  const open = useCallback(async (id: string) => {
    if (!switching && !allowLeave()) throw new Error("Patient change cancelled");
    const current = requests.current.select(id);
    setSwitching(true);
    try {
      const p = await api<Patient>(`/api/patients/${id}`);
      if (!current()) throw new Error("Patient request superseded");
      requests.current.select(p.patient_id);
      dirty.current = false;
      setPatient(p);
      setSwitching(false);
      try { sessionStorage.setItem(PATIENT_KEY, p.patient_id); } catch {}
      return p;
    } catch (error) {
      if (current()) {
        requests.current.select(patient?.patient_id ?? null);
        setSwitching(false);
      }
      throw error;
    }
  }, [allowLeave, patient, switching]);

  const refresh = useCallback(async () => {
    if (!patient) return;
    const current = requests.current.refresh(patient.patient_id);
    const p = await api<Patient>(`/api/patients/${patient.patient_id}`);
    if (current()) setPatient(p);
  }, [patient]);

  const close = useCallback(() => {
    if (!allowLeave()) return;
    requests.current.select(null);
    setSwitching(false);
    dirty.current = false;
    setPatient(null);
    try { sessionStorage.removeItem(PATIENT_KEY); } catch {}
  }, [allowLeave]);

  useEffect(() => {
    let id: string | null = null;
    try { id = sessionStorage.getItem(PATIENT_KEY); } catch {}
    if (!id) return;
    const tracker = requests.current;
    const current = tracker.select(id);
    api<Patient>(`/api/patients/${id}`)
      .then(p => { if (current()) setPatient(p); })
      .catch(() => { if (current()) { try { sessionStorage.removeItem(PATIENT_KEY); } catch {} } });
    return () => { tracker.select(null); };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return <PatientContext.Provider value={{ patient, switching, open, refresh, close, markDirty }}>{children}</PatientContext.Provider>;
}
