CREATE TABLE IF NOT EXISTS inventory_fifo_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  source_line_id UUID,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  original_qty NUMERIC(10,3) NOT NULL CHECK (original_qty > 0),
  remaining_qty NUMERIC(10,3) NOT NULL CHECK (remaining_qty >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_fifo_layers_lookup_idx
  ON inventory_fifo_layers(product_id, location_id, received_at, created_at, id);

CREATE INDEX IF NOT EXISTS inventory_fifo_layers_remaining_idx
  ON inventory_fifo_layers(product_id, location_id)
  WHERE remaining_qty > 0;

CREATE TABLE IF NOT EXISTS inventory_fifo_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id UUID NOT NULL REFERENCES inventory_fifo_layers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  qty NUMERIC(10,3) NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  movement_reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id UUID,
  ref_line_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_fifo_consumptions_ref_idx
  ON inventory_fifo_consumptions(ref_type, ref_id, ref_line_id);

CREATE INDEX IF NOT EXISTS inventory_fifo_consumptions_product_idx
  ON inventory_fifo_consumptions(product_id, location_id, created_at);

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_expired_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  movement_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  qty NUMERIC(10,3) NOT NULL CHECK (qty > 0),
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  expiration_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_expired_items_created_idx
  ON inventory_expired_items(created_at DESC);

UPDATE sale_items si
SET cost_amount = ROUND(COALESCE(p.cost, 0)::numeric * COALESCE(si.qty, 0)::numeric, 2)
FROM products p
WHERE p.id = si.product_id
  AND COALESCE(si.cost_amount, 0) = 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventory_fifo_layers LIMIT 1) THEN
    INSERT INTO inventory_fifo_layers(
      product_id,
      location_id,
      source_type,
      unit_cost,
      original_qty,
      remaining_qty,
      received_at,
      notes
    )
    SELECT
      ib.product_id,
      ib.location_id,
      'APERTURA_FIFO',
      COALESCE(p.cost, 0)::numeric,
      ib.quantity::numeric,
      ib.quantity::numeric,
      now(),
      'Inicializacion FIFO desde saldo vigente'
    FROM inventory_balances ib
    JOIN products p ON p.id = ib.product_id
    WHERE COALESCE(ib.quantity, 0) > 0;
  END IF;
END $$;
