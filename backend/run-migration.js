const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const migrationFile = path.join(__dirname, "migrations", "017_caja.sql");
  const sql = fs.readFileSync(migrationFile, "utf8");

  console.log("Ejecutando migracion 017_caja.sql...");

  try {
    await pool.query(sql);
    console.log("Migracion ejecutada correctamente!");
  } catch (err) {
    console.error("Error ejecutando migracion:", err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
