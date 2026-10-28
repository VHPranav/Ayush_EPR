-- Fixed rates so invoices can be filled from pick-lists instead of typed prices.
ALTER TABLE treatment_master ADD COLUMN IF NOT EXISTS rate numeric(12,2) CHECK (rate >= 0);
ALTER TABLE pharmacy_stock ADD COLUMN IF NOT EXISTS sale_price numeric(12,2) CHECK (sale_price >= 0);
