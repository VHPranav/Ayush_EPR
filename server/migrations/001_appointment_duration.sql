ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30;
