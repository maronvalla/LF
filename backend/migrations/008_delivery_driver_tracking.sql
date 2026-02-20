BEGIN;

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS delivery_status_lat NUMERIC(9,6),
ADD COLUMN IF NOT EXISTS delivery_status_lng NUMERIC(9,6),
ADD COLUMN IF NOT EXISTS delivery_status_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivery_status_updated_by UUID REFERENCES users(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_delivery_status_chk'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales DROP CONSTRAINT sales_delivery_status_chk;
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
    CHECK (delivery_status IN ('PENDIENTE', 'CARGADO', 'ENTREGADO', 'RECHAZADO', 'NO_ESTABA'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_delivery_status_lat_chk'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_delivery_status_lat_chk
    CHECK (delivery_status_lat IS NULL OR (delivery_status_lat >= -90 AND delivery_status_lat <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_delivery_status_lng_chk'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_delivery_status_lng_chk
    CHECK (delivery_status_lng IS NULL OR (delivery_status_lng >= -180 AND delivery_status_lng <= 180));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS delivery_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('ESTADO', 'POSICION_CAMION')),
  estado TEXT CHECK (estado IN ('ENTREGADO', 'RECHAZADO', 'NO_ESTABA')),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_tracking_sale_created
ON delivery_tracking(sale_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_tracking_created
ON delivery_tracking(created_at DESC);

COMMIT;
