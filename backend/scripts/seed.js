const bcrypt = require("bcryptjs");
const { pool } = require("../src/db");
require("dotenv").config();

async function seedLocations(client) {
  await client.query(
    `
    INSERT INTO locations(code, name)
    VALUES
      ('GALPON', 'Galpon'),
      ('LOCAL', 'Local')
    ON CONFLICT (code) DO NOTHING
  `
  );
}

async function seedAdmin(client) {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const fullName = process.env.ADMIN_FULL_NAME || "Administrador";
  const passwordHash = await bcrypt.hash(password, 10);

  await client.query(
    `
    INSERT INTO users (username, password_hash, role, full_name, is_active)
    VALUES ($1, $2, 'ADMIN', $3, true)
    ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = 'ADMIN',
          full_name = EXCLUDED.full_name,
          is_active = true
  `,
    [username, passwordHash, fullName]
  );
}

async function seedSample(client) {
  await client.query(
    `
    INSERT INTO customers(name, phone, address, zone, notes)
    SELECT * FROM (
      VALUES
        ('Kiosco San Martin', '341-555-123', 'San Martin 1200', 'Centro', 'Cliente mayorista'),
        ('Almacen Lucia', '341-555-987', 'Mendoza 450', 'Norte', '')
    ) AS v(name, phone, address, zone, notes)
    WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.name = v.name)
  `
  );

  await client.query(
    `
    INSERT INTO products(sku, name, brand, pack_size, unit_label, price_minorista, price_mayorista, cost, is_active)
    VALUES
      ('FAR-001', 'Fardo Coca Cola 2.25L', 'Coca Cola', 6, 'fardo', 18000, 16000, 12000, true),
      ('FAR-002', 'Fardo Manaos Cola 2.25L', 'Manaos', 6, 'fardo', 12000, 10500, 8000, true)
    ON CONFLICT (sku) DO NOTHING
  `
  );
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedLocations(client);
    await seedAdmin(client);
    await seedSample(client);
    await client.query("COMMIT");
    console.log("Seed OK");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
