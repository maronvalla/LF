CREATE TABLE IF NOT EXISTS sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT NOT NULL UNIQUE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sale_number_snapshot TEXT,
  customer_name_snapshot TEXT,
  reason TEXT NOT NULL,
  receipt_photo_base64 TEXT,
  receipt_photo_mime_type TEXT,
  receipt_photo_name TEXT,
  return_credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  replacement_total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference_payment_method TEXT,
  difference_cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference_transfer_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference_proof_base64 TEXT,
  difference_proof_mime_type TEXT,
  difference_proof_name TEXT,
  cash_movement_id UUID REFERENCES cash_register_movements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sale_returns_difference_payment_chk CHECK (
    difference_payment_method IS NULL
    OR difference_payment_method IN ('EFECTIVO', 'TRANSFERENCIA', 'MIXTO')
  )
);

CREATE INDEX IF NOT EXISTS sale_returns_sale_created_idx
  ON sale_returns(sale_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_return_id UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(10,3) NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_return_items_sale_item_idx
  ON sale_return_items(sale_item_id);

CREATE TABLE IF NOT EXISTS sale_return_replacement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_return_id UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(10,3) NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_return_replacement_items_return_idx
  ON sale_return_replacement_items(sale_return_id);
