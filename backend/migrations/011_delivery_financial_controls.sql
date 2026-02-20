BEGIN;

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS delivery_final_payment_method TEXT,
ADD COLUMN IF NOT EXISTS delivery_final_cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_final_transfer_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_transfer_proof_base64 TEXT,
ADD COLUMN IF NOT EXISTS delivery_transfer_proof_mime_type TEXT,
ADD COLUMN IF NOT EXISTS delivery_transfer_proof_name TEXT,
ADD COLUMN IF NOT EXISTS delivery_paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivery_paid_by UUID REFERENCES users(id);

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'sales'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%payment_condition%'
        OR pg_get_constraintdef(oid) ILIKE '%delivery_payment%'
        OR pg_get_constraintdef(oid) ILIKE '%delivery_payment_method%'
      )
  LOOP
    EXECUTE format('ALTER TABLE sales DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE sales
ADD CONSTRAINT sales_payment_condition_chk
CHECK (
  payment_condition IS NULL
  OR payment_condition IN (
    'PAGADO_LOCAL',
    'TRANSFER_PREVIA',
    'COBRAR_EN_ENTREGA',
    'PAGO_LOCAL_TRANSFERENCIA'
  )
);

ALTER TABLE sales
ADD CONSTRAINT sales_delivery_payment_chk
CHECK (
  delivery_payment IS NULL
  OR delivery_payment IN (
    'PAGADO_LOCAL',
    'TRANSFER_PREVIA',
    'COBRAR_EN_ENTREGA',
    'PAGO_LOCAL_TRANSFERENCIA'
  )
);

ALTER TABLE sales
ADD CONSTRAINT sales_delivery_payment_method_chk
CHECK (
  delivery_payment_method IS NULL
  OR delivery_payment_method IN ('EFECTIVO', 'TRANSFERENCIA', 'MIXTO')
);

ALTER TABLE sales
ADD CONSTRAINT sales_delivery_final_payment_method_chk
CHECK (
  delivery_final_payment_method IS NULL
  OR delivery_final_payment_method IN ('EFECTIVO', 'TRANSFERENCIA', 'MIXTO')
);

ALTER TABLE sales
ADD CONSTRAINT sales_delivery_amounts_nonnegative_chk
CHECK (
  delivery_final_cash_amount >= 0
  AND delivery_final_transfer_amount >= 0
);

COMMIT;
