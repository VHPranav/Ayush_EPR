-- Prescriptions printed in the clinic's own format (English or Montenegrin): diagnosis in the header, the language
-- the doctor wrote it in, and the two standing sections "Changes to existing medications" and "Dietary recommendations".
-- Medicine lines already have form / route / timing / anupana (what it is mixed with) columns.
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS diagnosis text;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'me'));
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS medication_changes text;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS diet text;
