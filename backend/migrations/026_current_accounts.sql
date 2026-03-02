ALTER TABLE customers
ADD COLUMN IF NOT EXISTS enable_current_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS enable_current_account BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS customer_current_account_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('DEBITO', 'PAGO')),
  amount INT NOT NULL CHECK (amount >= 0),
  payment_method TEXT,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_current_account_entries_customer_idx
  ON customer_current_account_entries(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_current_account_entries_sale_idx
  ON customer_current_account_entries(sale_id);

CREATE TABLE IF NOT EXISTS supplier_current_account_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('DEBITO', 'PAGO')),
  amount INT NOT NULL CHECK (amount >= 0),
  payment_method TEXT,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_current_account_entries_supplier_idx
  ON supplier_current_account_entries(supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_current_account_entries_purchase_idx
  ON supplier_current_account_entries(purchase_id);
