-- Allow decimal quantities in sale items and inventory
ALTER TABLE sale_items
  ALTER COLUMN qty TYPE NUMERIC(10,3),
  DROP CONSTRAINT IF EXISTS sale_items_qty_check,
  ADD CONSTRAINT sale_items_qty_check CHECK (qty > 0);

ALTER TABLE inventory_movements
  ALTER COLUMN qty TYPE NUMERIC(10,3),
  DROP CONSTRAINT IF EXISTS inventory_movements_qty_check,
  ADD CONSTRAINT inventory_movements_qty_check CHECK (qty > 0);

ALTER TABLE inventory_balances
  ALTER COLUMN quantity TYPE NUMERIC(10,3);
