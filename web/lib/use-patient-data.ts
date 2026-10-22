"use client";
import { useCallback } from "react";
import { api } from "./api";
import { errMsg } from "./format";
import { usePatient } from "./patient";
import { useToast } from "./toast";
import { useFetch } from "./use-fetch";

/**
 * Loads `/api/patients/:id/<suffix>` for the open patient and provides a `post` helper that
 * saves to the same endpoint, toasts, and reloads. Replaces the old loadFullPatientModules().
 */
export function usePatientData<T>(suffix: string) {
  const { patient, refresh } = usePatient();
  const toast = useToast();
  const id = patient?.patient_id ?? null;
  const { data, error, loading, reload } = useFetch<T>(id ? `/api/patients/${id}/${suffix}` : null);

  const post = useCallback(async (body: unknown, successMessage: string) => {
    if (!id) return false;
    try {
      await api(`/api/patients/${id}/${suffix}`, { body });
      toast(successMessage);
      reload();
      // The patient bar carries the allergy warning, so a new allergy must show there at once.
      if (suffix === "allergies") await refresh();
      return true;
    } catch (e) {
      toast(errMsg(e));
      return false;
    }
  }, [id, suffix, reload, toast, refresh]);

  return { data, error, loading, reload, post };
}
