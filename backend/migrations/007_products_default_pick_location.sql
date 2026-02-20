BEGIN;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS default_pick_location TEXT;

UPDATE products
SET default_pick_location = 'GALPON'
WHERE default_pick_location IS NULL;

ALTER TABLE products
ALTER COLUMN default_pick_location SET DEFAULT 'GALPON';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_default_pick_location_chk'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT products_default_pick_location_chk
    CHECK (default_pick_location IN ('LOCAL', 'GALPON'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_default_pick_location
ON products(default_pick_location);

COMMIT;
