import type { Perm } from "./types";

type Can = (perm: Perm) => boolean;

/** Where to send a user after opening a patient: the first patient screen they are allowed to use. */
export function patientHome(can: Can): string {
  if (can("clinical.read")) return "/doctor";
  if (can("prescriptions.read")) return "/prescription";
  if (can("billing.read")) return "/billing";
  if (can("documents.read")) return "/documents";
  return "/dashboard";
}

/** After registering a patient: clinicians continue to the chart; front desk goes on to book an appointment. */
export function afterRegister(can: Can): string {
  if (can("clinical.read")) return "/doctor";
  if (can("appointments.write")) return "/appointments";
  return patientHome(can);
}
