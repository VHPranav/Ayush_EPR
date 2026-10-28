CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS uhid_year_sequence (
  year integer PRIMARY KEY,
  last_number bigint NOT NULL DEFAULT 0
);
CREATE OR REPLACE FUNCTION generate_ayush_uhid() RETURNS text LANGUAGE plpgsql AS $$
DECLARE y integer := EXTRACT(YEAR FROM CURRENT_TIMESTAMP); n bigint;
BEGIN
  INSERT INTO uhid_year_sequence(year,last_number) VALUES(y,1)
  ON CONFLICT(year) DO UPDATE SET last_number=uhid_year_sequence.last_number+1
  RETURNING last_number INTO n;
  RETURN format('AY-%s-%s', y, lpad(n::text,5,'0'));
END $$;

CREATE TABLE IF NOT EXISTS roles (role_id serial PRIMARY KEY, name text UNIQUE NOT NULL);
INSERT INTO roles(name) VALUES ('SUPER_ADMIN'),('DOCTOR'),('AYURVEDA_PHYSICIAN'),('NURSE'),('PHARMACIST'),('PANCHAKARMA_THERAPIST'),('YOGA_THERAPIST'),('DIETITIAN'),('RECEPTION'),('MANAGER'),('AUDITOR'),('MEDICAL_DIRECTOR'),('MODERN_MEDICAL_CONSULTANT'),('PHYSIOTHERAPIST'),('FINANCE') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text UNIQUE NOT NULL,
  display_name text NOT NULL, password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid REFERENCES users(user_id) ON DELETE CASCADE,
  role_id integer REFERENCES roles(role_id) ON DELETE RESTRICT,
  PRIMARY KEY(user_id,role_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(user_id),
  token_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL, logout_at timestamptz, ip_address inet, user_agent text
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS patients (
  patient_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uhid text NOT NULL UNIQUE DEFAULT generate_ayush_uhid(),
  name text NOT NULL, dob date, sex text, phone text, email text, nationality text,
  blood_group text, insurance text, emergency_contact text, referral text,
  primary_physician text, address text, registered_at timestamptz NOT NULL DEFAULT now(),
  registration_user uuid REFERENCES users(user_id), archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(lower(name));
CREATE INDEX IF NOT EXISTS idx_patients_registered_at ON patients(registered_at);

CREATE TABLE IF NOT EXISTS encounters (
  encounter_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  encounter_type text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  provider_user uuid REFERENCES users(user_id), status text NOT NULL DEFAULT 'OPEN'
);
CREATE TABLE IF NOT EXISTS clinical_records (
  record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES encounters(encounter_id), section text NOT NULL, payload jsonb NOT NULL,
  authored_by uuid REFERENCES users(user_id), created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1, amended_from uuid REFERENCES clinical_records(record_id)
);
CREATE INDEX IF NOT EXISTS idx_clinical_patient_section ON clinical_records(patient_id,section,created_at DESC);

CREATE TABLE IF NOT EXISTS medicine_master (
  medicine_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, form text, strength text,
  unit text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name,form,strength)
);
CREATE TABLE IF NOT EXISTS pharmacy_stock (
  stock_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), medicine_id uuid REFERENCES medicine_master(medicine_id),
  medicine_name text NOT NULL, form text, strength text, batch_no text, expiry_date date, quantity numeric NOT NULL DEFAULT 0,
  unit text, reorder_level numeric NOT NULL DEFAULT 0, supplier text, purchase_price numeric, location text,
  active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_expiry ON pharmacy_stock(expiry_date);

CREATE TABLE IF NOT EXISTS treatment_master (
  treatment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, category text,
  default_frequency text, default_duration text, practitioner text, instructions text, precautions text,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prescriptions (
  prescription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  prescribed_at timestamptz NOT NULL DEFAULT now(), prescriber_user uuid REFERENCES users(user_id), status text NOT NULL DEFAULT 'ISSUED',
  notes text, prescription_no text UNIQUE NOT NULL DEFAULT ('RX-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'))
);
CREATE TABLE IF NOT EXISTS prescription_treatments (
  row_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prescription_id uuid NOT NULL REFERENCES prescriptions(prescription_id) ON DELETE CASCADE,
  treatment_name text NOT NULL, frequency text, duration text, practitioner text, instructions text, precautions text, sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prescription_medicines (
  row_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prescription_id uuid NOT NULL REFERENCES prescriptions(prescription_id) ON DELETE CASCADE,
  medicine_name text NOT NULL, form text, dose text, route text, frequency text, duration text, timing text, anupana text,
  indication text, instructions text, sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS letters (
  letter_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id uuid GENERATED ALWAYS AS (letter_id) STORED,
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  letter_type text, recipient text, subject text, body text NOT NULL,
  authored_by uuid REFERENCES users(user_id), author_id uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS discharge_summaries (
  discharge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id uuid GENERATED ALWAYS AS (discharge_id) STORED,
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES encounters(encounter_id),
  summary_date date DEFAULT CURRENT_DATE,
  admission_date date,
  discharge_date date NOT NULL DEFAULT CURRENT_DATE,
  attending_provider text,
  discharge_status text,
  reason text,
  final_diagnosis text,
  clinical_course text,
  procedures text,
  discharge_medicines text,
  diet_lifestyle text,
  followup_plan text,
  warning_signs text,
  remarks text,
  admission_summary text,
  diagnoses jsonb,
  procedures_data jsonb,
  medicines jsonb,
  treatment_course text,
  condition_at_discharge text,
  warnings text,
  signed_at timestamptz,
  author_id uuid REFERENCES users(user_id),
  authored_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS appointments (
  appointment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  appointment_at timestamptz NOT NULL, provider_user uuid REFERENCES users(user_id), type text, reason text,
  reception_reminder boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'SCHEDULED', created_by uuid REFERENCES users(user_id),
  duration_minutes integer NOT NULL DEFAULT 30
);
CREATE INDEX IF NOT EXISTS idx_appointments_at ON appointments(appointment_at,status);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id bigserial PRIMARY KEY, event_time timestamptz NOT NULL DEFAULT now(), user_id uuid REFERENCES users(user_id),
  session_id uuid, action text NOT NULL, table_name text, record_id text, ip_address inet, user_agent text, details jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_event_time ON audit_log(event_time);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id,event_time);

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
DROP TRIGGER IF EXISTS audit_no_update ON audit_log;
DROP TRIGGER IF EXISTS audit_no_delete ON audit_log;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- No accounts are seeded here. The API creates the first Super Administrator on startup (see server/bootstrap.js).

CREATE TABLE IF NOT EXISTS billing_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
 account_date date NOT NULL DEFAULT CURRENT_DATE, payer_type text, invoice_number text UNIQUE,
 status text DEFAULT 'OPEN', subtotal numeric(12,2) DEFAULT 0, discount numeric(12,2) DEFAULT 0,
 tax numeric(12,2) DEFAULT 0, total numeric(12,2) DEFAULT 0, notes text, created_by uuid REFERENCES users(user_id), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS billing_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
 description text NOT NULL, category text, quantity numeric(10,2) DEFAULT 1, unit_price numeric(12,2) DEFAULT 0, amount numeric(12,2) DEFAULT 0, created_at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS patient_problems(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
 problem text NOT NULL, type text DEFAULT 'ACTIVE', onset_date date, status text DEFAULT 'ACTIVE', notes text,
 recorded_by uuid REFERENCES users(user_id), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS allergies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
 allergen text NOT NULL, reaction text, severity text, status text DEFAULT 'ACTIVE', recorded_by uuid REFERENCES users(user_id), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS care_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
 encounter_id uuid REFERENCES encounters(encounter_id), plan_type text, goals jsonb, interventions jsonb, monitoring jsonb,
 review_date date, status text DEFAULT 'ACTIVE', author_id uuid REFERENCES users(user_id), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS exam_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, specialty text, fields jsonb NOT NULL, active boolean DEFAULT true, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS exam_results(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
 encounter_id uuid REFERENCES encounters(encounter_id), template_id uuid REFERENCES exam_templates(id), findings jsonb NOT NULL,
 examiner_id uuid REFERENCES users(user_id), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS referrals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
 encounter_id uuid REFERENCES encounters(encounter_id), referred_to text, specialty text, reason text, urgency text, status text DEFAULT 'PENDING',
 referral_date date DEFAULT CURRENT_DATE, followup_date date, created_by uuid REFERENCES users(user_id), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS medication_reconciliation(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
 medicine_name text NOT NULL, dose text, route text, frequency text, source text, status text DEFAULT 'ACTIVE',
 reconciled_by uuid REFERENCES users(user_id), reconciled_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS patient_contacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
 contact_type text, contact_date timestamptz DEFAULT now(), subject text, notes text, outcome text, created_by uuid REFERENCES users(user_id));

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'OTHER',
  file_name text NOT NULL,
  storage_key text NOT NULL,
  mime_type text,
  uploaded_by uuid REFERENCES users(user_id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES encounters(encounter_id),
  assessment_date date DEFAULT CURRENT_DATE,
  domain text NOT NULL,
  scale_name text,
  score numeric,
  unit text,
  narrative text,
  assessor_id uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES encounters(encounter_id),
  investigation_type text,
  test_name text NOT NULL,
  requested_date date,
  result_date date,
  result_summary text,
  result_data jsonb,
  abnormal_flag boolean DEFAULT false,
  ordered_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS treatment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  prescription_treatment_id uuid REFERENCES prescription_treatments(row_id),
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time time,
  end_time time,
  practitioner_id uuid REFERENCES users(user_id),
  pre_assessment text,
  procedure_notes text,
  materials text,
  tolerance text,
  adverse_event text,
  post_assessment text,
  response text,
  status text NOT NULL DEFAULT 'COMPLETED',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS medication_administration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_medicine_id uuid REFERENCES prescription_medicines(row_id),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  scheduled_at timestamptz,
  administered_at timestamptz DEFAULT now(),
  dose text,
  route text,
  administered_by uuid REFERENCES users(user_id),
  status text NOT NULL DEFAULT 'GIVEN',
  response text,
  adverse_event text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES encounters(encounter_id),
  note_type text NOT NULL,
  note_text text NOT NULL,
  created_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_problems_patient ON patient_problems(patient_id,status);
CREATE INDEX IF NOT EXISTS idx_billing_patient ON billing_accounts(patient_id,account_date);
CREATE INDEX IF NOT EXISTS idx_referrals_patient ON referrals(patient_id,referral_date);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id,uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_patient ON outcomes(patient_id,assessment_date DESC);
CREATE INDEX IF NOT EXISTS idx_investigations_patient ON investigations(patient_id,requested_date DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_patient ON treatment_sessions(patient_id,session_date DESC);
CREATE INDEX IF NOT EXISTS idx_med_admin_patient ON medication_administration(patient_id,administered_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON clinical_notes(patient_id,created_at DESC);
