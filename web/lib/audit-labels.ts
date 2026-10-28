/** Plain-language names for audit action codes (the code itself is kept in the CSV export). */
export const AUDIT_ACTIONS: Record<string, string> = {
  VIEW_PATIENT: "Opened patient chart", VIEW_PATIENT_MODULE: "Viewed patient module",
  VIEW_CORRECTIONS: "Viewed correction history", VIEW_ENCOUNTERS: "Viewed visits",
  CORRECT_CHART: "Corrected chart", AMEND_CLINICAL_RECORD: "Signed record amendment",
  START_VISIT: "Started visit", CLOSE_VISIT: "Closed visit", CANCEL_PRESCRIPTION: "Cancelled prescription",
  LOGIN_SUCCESS: "Signed in", LOGIN_FAILURE: "Failed sign-in", SESSION_CREATED: "Session started", LOGOUT: "Signed out",
  PASSWORD_CHANGED: "Changed own password", RESET_PASSWORD: "Reset a user's password",
  CREATE_USER: "Created user", UPDATE_USER: "Updated user", DEACTIVATE_USER: "Deactivated user", ACTIVATE_USER: "Reactivated user",
  CREATE_PATIENT: "Registered patient", VIEW_TIMELINE: "Viewed patient timeline",
  CREATE_CLINICAL_RECORD: "Saved clinical record", CREATE_PROBLEM: "Added problem", CREATE_ALLERGY: "Added allergy",
  RECONCILE_MEDICATION: "Reconciled medication", CREATE_OUTCOME: "Recorded outcome", CREATE_INVESTIGATION: "Recorded investigation",
  CREATE_EXAM: "Recorded examination", CREATE_EXAM_TEMPLATE: "Created examination template", CREATE_REFERRAL: "Created referral",
  CREATE_CARE_PLAN: "Created care plan", CREATE_TREATMENT_SESSION: "Recorded therapy session",
  CREATE_MEDICATION_ADMINISTRATION: "Recorded medication administration", CREATE_CONTACT: "Recorded patient contact",
  ISSUE_PRESCRIPTION: "Issued prescription", DISPENSE_PRESCRIPTION: "Dispensed prescription",
  UPLOAD_DOCUMENT: "Uploaded document", DOWNLOAD_DOCUMENT: "Downloaded document",
  CREATE_APPOINTMENT: "Booked appointment", UPDATE_APPOINTMENT: "Changed appointment",
  RESCHEDULE_APPOINTMENT: "Rescheduled appointment",
  CREATE_INVOICE: "Created invoice", UPDATE_INVOICE_STATUS: "Changed invoice status",
  CREATE_STOCK: "Added stock", UPDATE_STOCK: "Edited stock", DELETE_STOCK: "Removed stock",
  CREATE_TREATMENT: "Added treatment", UPDATE_TREATMENT: "Edited treatment", DELETE_TREATMENT: "Removed treatment",
  CREATE_LETTER: "Wrote letter", CREATE_DISCHARGE: "Wrote discharge summary",
};
export const actionLabel = (a: string) => AUDIT_ACTIONS[a] ?? a.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());

/** A short human summary of an entry's details (username, UHID, invoice number, ...). */
export function detailText(d: Record<string, unknown> | null | undefined) {
  if (!d) return "";
  return Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
}
