-- Invoices in the Montenegrin layout (seller and buyer tax numbers, units, per-line discount and PDV, due date,
-- service period). The EPR issues a pre-invoice ("Predračun", numbered PR n/year); the clinic's fiscal software
-- issues the fiscal invoice, whose number and IKOF / JIKR codes are recorded back here for reference.

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_year_sequence (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS seq_year integer;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS seq_no integer;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS issued_at timestamptz;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS period_from date;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS period_to date;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS place text;
-- Who is billed (a company or the patient) and the seller as they were when the invoice was made, so a reprint
-- after the bank account or address changes still shows what was issued.
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS buyer jsonb;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS seller jsonb;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS fiscal_number text;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS fiscal_ikof text;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS fiscal_jikr text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_seq ON billing_accounts(seq_year, seq_no) WHERE seq_no IS NOT NULL;

ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100);
-- NULL = exempt from PDV ("Oslobođeno"); otherwise the rate in percent (0, 7, 15 or 21).
ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) CHECK (vat_rate >= 0 AND vat_rate <= 100);
ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) NOT NULL DEFAULT 0;
