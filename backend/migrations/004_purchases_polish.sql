-- Migration to polish Purchases module
ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'MERCADERIA',
ADD COLUMN IF NOT EXISTS update_cost BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS update_cashbox BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);

-- Set default location for existing purchases if any
UPDATE purchases 
SET location_id = (SELECT id FROM locations WHERE code = 'GALPON' LIMIT 1)
WHERE location_id IS NULL;
