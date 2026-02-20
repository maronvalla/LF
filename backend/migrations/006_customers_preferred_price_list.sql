ALTER TABLE customers
ADD COLUMN IF NOT EXISTS preferred_price_list TEXT NOT NULL DEFAULT 'MINORISTA'
CHECK (preferred_price_list IN ('MINORISTA', 'MAYORISTA'));

UPDATE customers
SET preferred_price_list = 'MINORISTA'
WHERE preferred_price_list IS NULL;
