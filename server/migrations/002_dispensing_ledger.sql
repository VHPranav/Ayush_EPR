CREATE TABLE IF NOT EXISTS dispensing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(prescription_id),
  prescription_medicine_id uuid NOT NULL REFERENCES prescription_medicines(row_id),
  stock_id uuid NOT NULL REFERENCES pharmacy_stock(stock_id),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  dispensed_by uuid NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prescription_medicine_id, stock_id)
);
CREATE INDEX IF NOT EXISTS idx_dispensing_prescription ON dispensing_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_dispensing_stock ON dispensing_items(stock_id);
