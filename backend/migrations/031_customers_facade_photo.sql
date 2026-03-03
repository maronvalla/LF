-- Add facade photo storage to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS facade_photo_base64 TEXT,
  ADD COLUMN IF NOT EXISTS facade_photo_mime_type TEXT;
