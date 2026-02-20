-- Add product_rubros table for product classification
CREATE TABLE IF NOT EXISTS product_rubros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add rubro_id column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS rubro_id UUID REFERENCES product_rubros(id);
