ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS seller_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS invoice_type TEXT;

ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS seller_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS invoice_type TEXT;
