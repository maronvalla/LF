CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alter products table to add new fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES product_brands(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS iva INT NOT NULL DEFAULT 21;
ALTER TABLE products ADD COLUMN IF NOT EXISTS profit_margin INT NOT NULL DEFAULT 30;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

-- Note: We might want to migrate existing string 'brand' data to the new 'brand_id' table eventually, 
-- but for now we focus on the new structure.
