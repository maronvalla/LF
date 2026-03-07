ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

CREATE INDEX IF NOT EXISTS budgets_customer_phone_idx
  ON budgets(customer_phone);
