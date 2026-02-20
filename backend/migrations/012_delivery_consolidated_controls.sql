BEGIN;

CREATE TABLE IF NOT EXISTS delivery_consolidated_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_date DATE NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('11', '19')),
  cashier_user_id UUID REFERENCES users(id),
  cashier_name TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  cashier_signature_base64 TEXT NOT NULL,
  driver_signature_base64 TEXT NOT NULL,
  total_orders INT NOT NULL DEFAULT 0,
  total_items INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (control_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_delivery_consolidated_controls_date_slot
ON delivery_consolidated_controls(control_date, slot);

COMMIT;
