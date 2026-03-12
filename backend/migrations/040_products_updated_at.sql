ALTER TABLE products
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE products
SET updated_at = COALESCE(updated_at, created_at, now());
