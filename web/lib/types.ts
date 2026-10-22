/** Permission keys; the role lists live only on the server (server/permissions.js). */
export type Perm =
  | "patients.view" | "patients.register" | "clinical.read" | "clinical.write" | "chart.write" | "outcomes.write"
  | "sessions.write" | "allergies.read" | "allergies.write" | "medrec.read" | "prescriptions.read" | "prescriptions.write"
  | "discharge.write" | "templates.write" | "documents.read" | "documents.write" | "appointments.read" | "appointments.write"
  | "billing.read" | "billing.write" | "contacts.read" | "contacts.write" | "pharmacy.read" | "pharmacy.write"
  | "treatments.read" | "treatments.write" | "treatments.delete" | "users.manage" | "audit.read";

export type Role =
  | "SUPER_ADMIN" | "DOCTOR" | "AYURVEDA_PHYSICIAN" | "RECEPTION" | "PHARMACIST" | "NURSE"
  | "PANCHAKARMA_THERAPIST" | "YOGA_THERAPIST" | "DIETITIAN" | "MANAGER" | "AUDITOR"
  | "MEDICAL_DIRECTOR" | "MODERN_MEDICAL_CONSULTANT" | "PHYSIOTHERAPIST" | "FINANCE";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  roles: string[];
  permissions: Perm[];
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

export interface PatientSummary {
  patient_id: string;
  uhid: string;
  name: string;
  dob: string | null;
  sex: string | null;
  phone: string | null;
  registered_at: string;
}

/** Shape of clinical_records.payload — INTEGRATED_CLINICAL_ASSESSMENT and NOTE sections share it. */
export interface ClinicalPayload {
  type?: string; text?: string;
  chiefComplaints?: string; hpi?: string; pastHistory?: string; familyHistory?: string;
  vitals?: Partial<Record<"bp" | "pulse" | "temp" | "spo2" | "height" | "weight" | "bmi" | "rr", string>>;
  modernDiagnosis?: string; prakriti?: string; vikriti?: string; agni?: string; ama?: string;
  ashtavidha?: string; ayurvedaDiagnosis?: string; modernFindings?: string; ayurvedaFindings?: string;
  correlation?: string; integratedImpression?: string; goalsSafety?: string;
}

export interface ClinicalRecord {
  record_id: string;
  section: string;
  payload: ClinicalPayload | null;
  created_at: string;
}

export interface RxMedicine { medicine_name: string; dose: string | null; frequency: string | null; instructions: string | null }
export interface RxTreatment { treatment_name: string; frequency: string | null; duration: string | null }
export interface Prescription {
  prescription_id: string;
  prescription_no: string;
  prescribed_at: string;
  status: string;
  notes?: string | null;
  medicines?: RxMedicine[];
  treatments?: RxTreatment[];
}

export interface Patient extends PatientSummary {
  email: string | null;
  /** Active allergies; only sent to roles that may read them. */
  allergies?: { id: string; allergen: string; reaction: string | null; severity: string | null }[];
  clinicalRecords: ClinicalRecord[];
  prescriptions: Prescription[];
  letters?: unknown[];
  discharges?: unknown[];
  appointments?: unknown[];
}

export interface TimelineEvent { event_time: string; event_type: string; event_id: string; title: string | null; detail: string | null }
export interface Problem { id: string; problem: string; status: string; notes: string | null }
export interface Allergy { id: string; allergen: string; reaction: string | null; severity: string | null }
export interface MedRec { id: string; medicine_name: string; dose: string | null; route: string | null; frequency: string | null }
export interface Investigation { id: string; test_name: string; result_summary: string | null }
export interface Outcome { id: string; domain: string; scale_name: string | null; score: number | string | null; narrative: string | null }
export interface Referral { id: string; specialty: string | null; referred_to: string | null; status: string; reason: string | null }
export interface CarePlan { id: string; plan_type: string; review_date: string | null; status: string }
export interface TreatmentSession { id: string; session_date: string; start_time: string | null; end_time: string | null; status: string; procedure_notes: string | null }
export interface PatientDocument { id: string; document_type: string; file_name: string; uploaded_at: string }
export interface BillingAccount { id: string; invoice_number: string; total: number | string; status: string; account_date?: string; subtotal?: number | string; discount?: number | string; tax?: number | string }
export interface BillingItem { id: string; account_id: string; description: string; category: string | null; quantity: number | string; unit_price: number | string; amount: number | string }
export interface Discharge { id?: string; summary_date?: string; discharge_date?: string; followup_plan: string | null }
export interface StockItem {
  stock_id: string;
  medicine_name: string; form: string | null; strength?: string | null; batch_no: string | null; expiry_date: string | null;
  quantity: number | string; unit: string | null; reorder_level: number | string; supplier?: string | null; location?: string | null;
  low_stock?: boolean;
}
export interface TreatmentMaster {
  treatment_id: string; name: string; category: string | null;
  default_frequency: string | null; default_duration: string | null; instructions?: string | null;
}
export interface FollowUp { appointment_id?: string; patient_id?: string; appointment_at: string; name: string; uhid: string; type: string | null; reason: string | null }
export interface AuditEntry { event_time: string; action: string; table_name: string | null; record_id: string | null; username?: string | null; display_name?: string | null }

export interface ManagedUser {
  user_id: string;
  username: string;
  display_name: string;
  active: boolean;
  created_at: string;
  roles: string[];
  last_login: string | null;
  /** Still using the old unsalted hash (e.g. the seeded dev accounts): the password should be reset. */
  legacy_password: boolean;
}
