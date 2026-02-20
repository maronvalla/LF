BEGIN;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS has_returnable BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS returnable_units_per_item INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_returnable_units_nonnegative_chk'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT products_returnable_units_nonnegative_chk
    CHECK (returnable_units_per_item >= 0);
  END IF;
END $$;

COMMIT;
