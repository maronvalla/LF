const { pool } = require("../src/db");

async function prepararDB() {
  try {
    console.log("⏳ Agregando columnas de latitud y longitud a la base de datos...");
    
    await pool.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6);
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS geocode_provider TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS geocode_updated_at TIMESTAMPTZ;
      ALTER TABLE customers ALTER COLUMN zone SET DEFAULT 'Aguilares, Tucuman';
      UPDATE customers SET zone = 'Aguilares, Tucuman' WHERE zone IS NULL OR btrim(zone) = '';
    `);

    console.log("✅ ¡Listo! La base de datos ya está preparada.");
  } catch (error) {
    console.error("❌ Hubo un error:", error.message);
  } finally {
    await pool.end();
  }
}

prepararDB();