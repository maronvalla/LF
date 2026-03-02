ALTER TABLE sales
ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT,
ADD COLUMN IF NOT EXISTS charged_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS charged_at TIMESTAMPTZ;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'sales'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%PENDIENTE%PREPARADO%CARGADO%ANULADO%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sales DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE sales
ADD CONSTRAINT sales_status_chk
CHECK (status IN ('PENDIENTE','PREPARADO','CARGADO','COMPLETADO','ANULADO'));
