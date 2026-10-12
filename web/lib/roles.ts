/** Display names and one-line summaries for the role picker. What each role may actually do is decided by server/permissions.js. */
export const ROLE_INFO: Record<string, { label: string; blurb: string }> = {
  SUPER_ADMIN: { label: "Super Administrator", blurb: "Full access, including user management." },
  MEDICAL_DIRECTOR: { label: "Medical Director", blurb: "Clinical oversight: reads the chart and audit log, edits nothing." },
  DOCTOR: { label: "Doctor", blurb: "Assesses, prescribes, discharges; registers patients." },
  AYURVEDA_PHYSICIAN: { label: "Ayurvedic Doctor", blurb: "Assesses, prescribes, discharges; registers patients." },
  MODERN_MEDICAL_CONSULTANT: { label: "Modern Medical Consultant", blurb: "Assesses, prescribes, discharges; registers patients." },
  NURSE: { label: "Nurse / Clinical Assistant", blurb: "Observations, notes, medication administration, documents." },
  PANCHAKARMA_THERAPIST: { label: "Panchakarma Therapist", blurb: "Therapy sessions, outcomes and notes." },
  YOGA_THERAPIST: { label: "Yoga Therapist", blurb: "Therapy sessions, outcomes and notes." },
  PHYSIOTHERAPIST: { label: "Physiotherapist", blurb: "Therapy sessions, outcomes and notes." },
  DIETITIAN: { label: "Dietitian", blurb: "Reads the chart; adds notes and outcomes." },
  PHARMACIST: { label: "Pharmacist", blurb: "Dispensing and stock; sees prescriptions and allergies." },
  RECEPTION: { label: "Reception", blurb: "Registration, appointments, billing, documents." },
  FINANCE: { label: "Finance", blurb: "Invoices and payments." },
  MANAGER: { label: "Management", blurb: "Operational dashboards, billing, audit log." },
  AUDITOR: { label: "Auditor", blurb: "Audit log only." },
};

export const ROLE_ORDER = Object.keys(ROLE_INFO);
export const roleLabel = (r: string) => ROLE_INFO[r]?.label ?? r.replaceAll("_", " ").toLowerCase();
