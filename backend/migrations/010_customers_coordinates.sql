-- Add coordinates to customers for route optimization
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6),
ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);

-- Index for customers with coordinates (for route optimization queries)
CREATE INDEX IF NOT EXISTS idx_customers_coordinates
ON customers (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
