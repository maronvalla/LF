-- Tabla principal de sesiones de caja
CREATE TABLE IF NOT EXISTS cash_register_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    closing_count_json JSONB, -- Conteo de billetes al cierre
    closing_total NUMERIC(12,2), -- Total rendido (suma del conteo)
    consolidated_amount NUMERIC(12,2) DEFAULT 0, -- Monto del consolidado si llegó
    consolidated_included BOOLEAN DEFAULT FALSE,
    cash_sales_amount NUMERIC(12,2) DEFAULT 0, -- Cobranzas en efectivo del día
    expected_amount NUMERIC(12,2), -- Monto esperado calculado
    difference NUMERIC(12,2), -- Diferencia (faltante/sobrante)
    status VARCHAR(20) DEFAULT 'ABIERTA' CHECK (status IN ('ABIERTA', 'CERRADA')),
    opened_by UUID REFERENCES users(id),
    closed_by UUID REFERENCES users(id),
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(date)
);

-- Tabla de movimientos de caja (retiros, pagos, etc)
CREATE TABLE IF NOT EXISTS cash_register_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES cash_register_sessions(id) ON DELETE CASCADE,
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('RETIRO', 'PAGO_DEUDA', 'PAGO_PROVEEDOR', 'INGRESO', 'AJUSTE')),
    amount NUMERIC(12,2) NOT NULL,
    concept TEXT NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cash_register_sessions_date ON cash_register_sessions(date);
CREATE INDEX IF NOT EXISTS idx_cash_register_movements_session ON cash_register_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_register_movements_type ON cash_register_movements(movement_type);
