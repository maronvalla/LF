ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS crm_stage TEXT NOT NULL DEFAULT 'CLIENTE_ACTIVO',
  ADD COLUMN IF NOT EXISTS crm_priority TEXT NOT NULL DEFAULT 'MEDIA',
  ADD COLUMN IF NOT EXISTS crm_next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_last_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_commercial_notes TEXT;

CREATE TABLE IF NOT EXISTS customer_crm_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  notes TEXT,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_crm_interactions_customer_happened_idx
  ON customer_crm_interactions(customer_id, happened_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS customers_crm_stage_idx
  ON customers(crm_stage);

CREATE INDEX IF NOT EXISTS customers_crm_follow_up_idx
  ON customers(crm_next_follow_up_at)
  WHERE crm_next_follow_up_at IS NOT NULL;
