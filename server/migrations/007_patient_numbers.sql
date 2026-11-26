-- Patient numbers in the clinic's own format: a running order number and the year the patient started,
-- e.g. 4063/2026, then 4064/2026 … The number keeps counting across years (it is not reset on 1 January);
-- only the year after the slash changes. Existing patients keep the number they already have.
-- The next number is set by a Super Administrator (Patients > Patient numbers) to continue the paper records.

CREATE TABLE IF NOT EXISTS patient_number_sequence (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
INSERT INTO patient_number_sequence(id, last_number) VALUES (true, 0) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION generate_ayush_uhid() RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  UPDATE patient_number_sequence SET last_number = last_number + 1 WHERE id RETURNING last_number INTO n;
  RETURN format('%s/%s', n, EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::int);
END $$;
