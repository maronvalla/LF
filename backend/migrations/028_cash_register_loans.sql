CREATE TABLE IF NOT EXISTS cash_register_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('OTORGADO', 'RECIBIDO')),
  original_amount NUMERIC(12,2) NOT NULL CHECK (original_amount > 0),
  outstanding_amount NUMERIC(12,2) NOT NULL CHECK (outstanding_amount >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO', 'SALDADO')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cash_register_loans_status
  ON cash_register_loans(status, direction, created_at DESC);

CREATE TABLE IF NOT EXISTS cash_register_loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES cash_register_loans(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES cash_register_sessions(id) ON DELETE RESTRICT,
  movement_id UUID REFERENCES cash_register_movements(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_register_loan_payments_loan
  ON cash_register_loan_payments(loan_id, created_at DESC);
