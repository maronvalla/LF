-- Fase innovacion: campos de envios sobre ventas existentes
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS is_delivery BOOLEAN,
ADD COLUMN IF NOT EXISTS delivery_slot TEXT,
ADD COLUMN IF NOT EXISTS delivery_payment TEXT,
ADD COLUMN IF NOT EXISTS delivery_payment_method TEXT,
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'PENDIENTE';

-- Backfill para no romper datos existentes
UPDATE sales
SET is_delivery = (sale_type = 'ENVIO')
WHERE is_delivery IS NULL;

UPDATE sales
SET delivery_slot = CASE shift WHEN 'MANIANA' THEN '11' WHEN 'TARDE' THEN '19' ELSE NULL END
WHERE delivery_slot IS NULL
  AND (is_delivery = true OR sale_type = 'ENVIO');

UPDATE sales
SET delivery_payment = payment_condition
WHERE delivery_payment IS NULL
  AND payment_condition IN ('PAGADO_LOCAL', 'TRANSFER_PREVIA', 'COBRAR_EN_ENTREGA');

UPDATE sales
SET delivery_payment_method = CASE
  WHEN upper(payment_method) = 'EFECTIVO' THEN 'EFECTIVO'
  WHEN upper(payment_method) = 'TRANSFERENCIA' THEN 'TRANSFERENCIA'
  ELSE NULL
END
WHERE delivery_payment_method IS NULL;

UPDATE sales
SET delivery_status = CASE
  WHEN status = 'CARGADO' THEN 'CARGADO'
  ELSE 'PENDIENTE'
END
WHERE delivery_status IS NULL;

ALTER TABLE sales
ALTER COLUMN is_delivery SET DEFAULT false,
ALTER COLUMN is_delivery SET NOT NULL,
ALTER COLUMN delivery_status SET DEFAULT 'PENDIENTE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_delivery_slot_chk'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_delivery_slot_chk
    CHECK (delivery_slot IS NULL OR delivery_slot IN ('11', '19'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_delivery_payment_chk'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_delivery_payment_chk
    CHECK (delivery_payment IS NULL OR delivery_payment IN ('PAGADO_LOCAL', 'TRANSFER_PREVIA', 'COBRAR_EN_ENTREGA'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_delivery_payment_method_chk'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_delivery_payment_method_chk
    CHECK (delivery_payment_method IS NULL OR delivery_payment_method IN ('EFECTIVO', 'TRANSFERENCIA'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_delivery_status_chk'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_delivery_status_chk
    CHECK (delivery_status IN ('PENDIENTE', 'CARGADO', 'ENTREGADO'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_delivery_lookup
ON sales (scheduled_date, delivery_slot)
WHERE (is_delivery = true OR sale_type = 'ENVIO') AND status <> 'ANULADO';
