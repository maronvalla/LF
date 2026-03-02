ALTER TABLE products
ADD COLUMN IF NOT EXISTS price_lists JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE products
SET price_lists = jsonb_strip_nulls(
  jsonb_build_object(
    'MINORISTA', COALESCE(price_minorista, 0),
    'MAYORISTA', COALESCE(price_mayorista, price_minorista, 0)
  )
)
WHERE price_lists = '{}'::jsonb OR price_lists IS NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  INNER JOIN pg_class rel ON rel.oid = con.conrelid
  INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'customers'
    AND pg_get_constraintdef(con.oid) ILIKE '%preferred_price_list%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE customers DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
