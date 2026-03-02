ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS receipt_image_data_url TEXT,
ADD COLUMN IF NOT EXISTS receipt_image_name TEXT;
