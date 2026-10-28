ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS amendment_reason text;
ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS encounter_id uuid REFERENCES encounters(encounter_id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(user_id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS cancellation_reason text;
CREATE TABLE chart_changes (
  change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id),
  resource text NOT NULL, record_id uuid NOT NULL,
  before_data jsonb NOT NULL, after_data jsonb NOT NULL,
  reason text NOT NULL, changed_by uuid NOT NULL REFERENCES users(user_id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chart_changes_patient ON chart_changes(patient_id, changed_at DESC);
CREATE INDEX idx_encounters_patient_status ON encounters(patient_id, status);

CREATE FUNCTION prevent_clinical_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Clinical history is append-only; create a reasoned amendment'; END $$;
CREATE TRIGGER clinical_records_immutable BEFORE UPDATE OR DELETE ON clinical_records
  FOR EACH ROW EXECUTE FUNCTION prevent_clinical_history_mutation();
CREATE TRIGGER clinical_records_no_truncate BEFORE TRUNCATE ON clinical_records
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_clinical_history_mutation();
CREATE TRIGGER chart_changes_immutable BEFORE UPDATE OR DELETE ON chart_changes
  FOR EACH ROW EXECUTE FUNCTION prevent_clinical_history_mutation();
CREATE TRIGGER chart_changes_no_truncate BEFORE TRUNCATE ON chart_changes
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_clinical_history_mutation();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_mutation();
