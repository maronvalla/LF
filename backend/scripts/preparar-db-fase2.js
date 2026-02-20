const { pool } = require("../src/db");

async function prepararFase2() {
  try {
    console.log("⏳ Creando tablas de tracking y auditoría...");
    await pool.query(`
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_status_lat NUMERIC(9,6);
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_status_lng NUMERIC(9,6);
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_status_updated_at TIMESTAMPTZ;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_status_updated_by UUID;

      CREATE TABLE IF NOT EXISTS delivery_tracking (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
        user_id UUID,
        event_type TEXT NOT NULL CHECK (event_type IN ('ESTADO', 'POSICION_CAMION')),
        estado TEXT CHECK (estado IN ('ENTREGADO', 'RECHAZADO', 'NO_ESTABA')),
        latitude NUMERIC(9,6),
        longitude NUMERIC(9,6),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log("✅ ¡Base de datos lista para logística pesada!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await pool.end();
  }
}
prepararFase2();