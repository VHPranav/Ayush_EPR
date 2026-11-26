-- Reports are often photos: let staff record what the report is and the date on it (not only when it was uploaded).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS report_date date;
