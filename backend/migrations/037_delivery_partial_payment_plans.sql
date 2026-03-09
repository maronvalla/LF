ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS delivery_expected_cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_expected_transfer_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_payment_configured_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS delivery_payment_configured_by UUID REFERENCES users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_delivery_expected_amounts_chk'
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_delivery_expected_amounts_chk
      CHECK (
        delivery_expected_cash_amount >= 0
        AND delivery_expected_transfer_amount >= 0
      );
  END IF;
END $$;
