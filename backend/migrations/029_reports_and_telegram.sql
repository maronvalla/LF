CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name_snapshot TEXT NOT NULL,
  sale_type TEXT NOT NULL CHECK (sale_type IN ('MOSTRADOR', 'ENVIO')),
  shift TEXT NULL CHECK (shift IN ('MANIANA', 'TARDE')),
  scheduled_date DATE NULL,
  delivery_address TEXT,
  notes TEXT,
  total_amount INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budgets_created_at_idx
  ON budgets(created_at DESC);

CREATE INDEX IF NOT EXISTS budgets_customer_idx
  ON budgets(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  qty INT NOT NULL CHECK (qty > 0),
  unit_price INT NOT NULL CHECK (unit_price >= 0),
  line_total INT NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS budget_items_budget_idx
  ON budget_items(budget_id);
