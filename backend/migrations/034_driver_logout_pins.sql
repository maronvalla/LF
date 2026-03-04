CREATE TABLE IF NOT EXISTS driver_logout_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pin TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS driver_logout_pins_user_created_idx
  ON driver_logout_pins(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS driver_logout_pins_pending_idx
  ON driver_logout_pins(user_id, expires_at)
  WHERE used_at IS NULL;
