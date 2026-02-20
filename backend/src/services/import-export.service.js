const { pool } = require("../db");
const { format, parseString } = require("fast-csv");
const XLSX = require("xlsx");

// CSV Templates definitions
const TEMPLATES = {
  products: {
    headers: [
      "sku",
      "nombre",
      "categoria",
      "marca",
      "rubro",
      "proveedor",
      "pack_size",
      "unit_label",
      "precio_minorista",
      "precio_mayorista",
      "costo",
      "iva",
      "margen_ganancia",
      "stock_minimo",
    ],
    example: {
      sku: "ABC123",
      nombre: "Coca Cola 2.5L",
      categoria: "BEBIDAS",
      marca: "COCA-COLA",
      rubro: "GASEOSAS",
      proveedor: "DISTRIBUIDORA NORTE",
      pack_size: "6",
      unit_label: "fardo",
      precio_minorista: "1500",
      precio_mayorista: "1350",
      costo: "1100",
      iva: "21",
      margen_ganancia: "30",
      stock_minimo: "10",
    },
  },
  customers: {
    headers: ["nombre", "telefono", "direccion", "zona", "latitud", "longitud", "notas"],
    example: {
      nombre: "Juan Perez",
      telefono: "1155443322",
      direccion: "Av. Corrientes 1234",
      zona: "CENTRO",
      latitud: "-27.43321",
      longitud: "-65.61492",
      notas: "Cliente frecuente",
    },
  },
  suppliers: {
    headers: ["nombre", "telefono", "direccion", "cuit", "condicion_iva"],
    example: {
      nombre: "Distribuidora Norte",
      telefono: "1145678900",
      direccion: "Calle Falsa 123",
      cuit: "20-12345678-9",
      condicion_iva: "RESPONSABLE INSCRIPTO",
    },
  },
};

// Generate empty template (CSV format)
function generateTemplate(entity) {
  const template = TEMPLATES[entity];
  if (!template) {
    throw new Error(`Entity "${entity}" not supported`);
  }

  return new Promise((resolve, reject) => {
    const rows = [template.headers, Object.values(template.example)];
    let csvContent = "";

    const csvStream = format({ headers: false });
    csvStream.on("data", (chunk) => (csvContent += chunk));
    csvStream.on("end", () => resolve(csvContent));
    csvStream.on("error", reject);

    rows.forEach((row) => csvStream.write(row));
    csvStream.end();
  });
}

// Generate Excel template
function generateTemplateExcel(entity) {
  const template = TEMPLATES[entity];
  if (!template) {
    throw new Error(`Entity "${entity}" not supported`);
  }

  const data = [template.headers, Object.values(template.example)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entity);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// Export existing data to CSV
async function exportData(entity) {
  const { rows, mapRow } = await getExportData(entity);
  const headers = TEMPLATES[entity].headers;

  return new Promise((resolve, reject) => {
    let csvContent = "";
    const csvStream = format({ headers: true });
    csvStream.on("data", (chunk) => (csvContent += chunk));
    csvStream.on("end", () => resolve(csvContent));
    csvStream.on("error", reject);

    rows.forEach((row) => csvStream.write(mapRow(row)));
    csvStream.end();
  });
}

// Export existing data to Excel
async function exportDataExcel(entity) {
  const { rows, mapRow } = await getExportData(entity);
  const headers = TEMPLATES[entity].headers;

  const data = [headers];
  rows.forEach((row) => {
    const mapped = mapRow(row);
    data.push(headers.map((h) => mapped[h]));
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entity);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// Helper to get export data
async function getExportData(entity) {
  let query, mapRow;

  switch (entity) {
    case "products":
      query = `
        SELECT p.*, c.name AS category_name, b.name AS brand_name, r.name AS rubro_name, s.name AS supplier_name
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN product_brands b ON b.id = p.brand_id
        LEFT JOIN product_rubros r ON r.id = p.rubro_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.is_active = true
        ORDER BY p.name ASC
      `;
      mapRow = (r) => ({
        sku: r.sku || "",
        nombre: r.name,
        categoria: r.category_name || "",
        marca: r.brand_name || "",
        rubro: r.rubro_name || "",
        proveedor: r.supplier_name || "",
        pack_size: r.pack_size || 1,
        unit_label: r.unit_label || "fardo",
        precio_minorista: r.price_minorista || 0,
        precio_mayorista: r.price_mayorista || 0,
        costo: r.cost || 0,
        iva: r.iva || 21,
        margen_ganancia: r.profit_margin || 30,
        stock_minimo: r.min_stock || 0,
      });
      break;

    case "customers":
      query = `SELECT * FROM customers ORDER BY name ASC`;
      mapRow = (r) => ({
        nombre: r.name,
        telefono: r.phone || "",
        direccion: r.address || "",
        zona: r.zone || "",
        latitud: r.latitude || "",
        longitud: r.longitude || "",
        notas: r.notes || "",
      });
      break;

    case "suppliers":
      query = `SELECT * FROM suppliers ORDER BY name ASC`;
      mapRow = (r) => ({
        nombre: r.name,
        telefono: r.phone || "",
        direccion: r.address || "",
        cuit: r.cuit || "",
        condicion_iva: r.iva_condition || "RESPONSABLE INSCRIPTO",
      });
      break;

    default:
      throw new Error(`Entity "${entity}" not supported`);
  }

  const { rows } = await pool.query(query);
  return { rows, mapRow };
}

// Parse CSV content
function parseCSV(content) {
  return new Promise((resolve, reject) => {
    const rows = [];
    parseString(content, { headers: true, trim: true })
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

// Parse Excel content
function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  return rows;
}

// Parse file (auto-detect CSV or Excel)
async function parseFile(buffer, filename) {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv") {
    return parseCSV(buffer.toString("utf-8"));
  } else if (ext === "xlsx" || ext === "xls") {
    return parseExcel(buffer);
  }
  throw new Error("Formato de archivo no soportado. Use CSV o Excel (.xlsx)");
}

// Validate import data (preview without importing)
async function validateImport(entity, fileBuffer, filename) {
  const rows = await parseFile(fileBuffer, filename);
  const errors = [];
  const toCreate = { categories: new Set(), brands: new Set(), rubros: new Set(), suppliers: new Set() };

  // Load existing data for reference
  const [existingCategories, existingBrands, existingRubros, existingSuppliers] = await Promise.all([
    pool.query("SELECT name FROM product_categories"),
    pool.query("SELECT name FROM product_brands"),
    pool.query("SELECT name FROM product_rubros"),
    pool.query("SELECT name FROM suppliers"),
  ]);

  const categoryNames = new Set(existingCategories.rows.map((r) => r.name.toUpperCase()));
  const brandNames = new Set(existingBrands.rows.map((r) => r.name.toUpperCase()));
  const rubroNames = new Set(existingRubros.rows.map((r) => r.name.toUpperCase()));
  const supplierNames = new Set(existingSuppliers.rows.map((r) => r.name.toUpperCase()));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is headers

    switch (entity) {
      case "products":
        if (!row.nombre || !String(row.nombre).trim()) {
          errors.push({ row: rowNum, field: "nombre", message: "Campo requerido" });
        }
        if (row.categoria && !categoryNames.has(String(row.categoria).toUpperCase())) {
          toCreate.categories.add(String(row.categoria).toUpperCase());
        }
        if (row.marca && !brandNames.has(String(row.marca).toUpperCase())) {
          toCreate.brands.add(String(row.marca).toUpperCase());
        }
        if (row.rubro && !rubroNames.has(String(row.rubro).toUpperCase())) {
          toCreate.rubros.add(String(row.rubro).toUpperCase());
        }
        if (row.proveedor && !supplierNames.has(String(row.proveedor).toUpperCase())) {
          toCreate.suppliers.add(String(row.proveedor).toUpperCase());
        }
        if (row.precio_minorista && isNaN(Number(row.precio_minorista))) {
          errors.push({ row: rowNum, field: "precio_minorista", message: "Debe ser numerico" });
        }
        break;

      case "customers":
        if (!row.nombre || !String(row.nombre).trim()) {
          errors.push({ row: rowNum, field: "nombre", message: "Campo requerido" });
        }
        break;

      case "suppliers":
        if (!row.nombre || !String(row.nombre).trim()) {
          errors.push({ row: rowNum, field: "nombre", message: "Campo requerido" });
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    total: rows.length,
    errors,
    toCreate: {
      categories: Array.from(toCreate.categories),
      brands: Array.from(toCreate.brands),
      rubros: Array.from(toCreate.rubros),
      suppliers: Array.from(toCreate.suppliers),
    },
  };
}

// Import data with auto-creation of related entities
async function importData(entity, fileBuffer, filename, userId) {
  const rows = await parseFile(fileBuffer, filename);
  const client = await pool.connect();

  const summary = {
    total: rows.length,
    imported: 0,
    errors: 0,
    created: { categories: [], brands: [], rubros: [], suppliers: [] },
  };
  const errors = [];

  try {
    await client.query("BEGIN");

    // Pre-load existing entities
    const [existingCategories, existingBrands, existingRubros, existingSuppliers] = await Promise.all([
      client.query("SELECT id, name FROM product_categories"),
      client.query("SELECT id, name FROM product_brands"),
      client.query("SELECT id, name FROM product_rubros"),
      client.query("SELECT id, name FROM suppliers"),
    ]);

    const categoryMap = new Map(existingCategories.rows.map((r) => [r.name.toUpperCase(), r.id]));
    const brandMap = new Map(existingBrands.rows.map((r) => [r.name.toUpperCase(), r.id]));
    const rubroMap = new Map(existingRubros.rows.map((r) => [r.name.toUpperCase(), r.id]));
    const supplierMap = new Map(existingSuppliers.rows.map((r) => [r.name.toUpperCase(), r.id]));

    // Get locations for inventory
    const locations = await client.query("SELECT id FROM locations WHERE code IN ('GALPON', 'LOCAL')");

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        switch (entity) {
          case "products":
            await importProduct(client, row, rowNum, categoryMap, brandMap, rubroMap, supplierMap, summary, locations.rows);
            break;
          case "customers":
            await importCustomer(client, row, rowNum);
            break;
          case "suppliers":
            await importSupplier(client, row, rowNum);
            break;
        }
        summary.imported++;
      } catch (err) {
        summary.errors++;
        errors.push({ row: rowNum, message: err.message });
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { success: true, summary, errors };
}

async function importProduct(client, row, rowNum, categoryMap, brandMap, rubroMap, supplierMap, summary, locations) {
  if (!row.nombre || !String(row.nombre).trim()) {
    throw new Error("Campo nombre requerido");
  }

  // Auto-create category if needed
  let categoryId = null;
  if (row.categoria && String(row.categoria).trim()) {
    const catName = String(row.categoria).toUpperCase().trim();
    if (categoryMap.has(catName)) {
      categoryId = categoryMap.get(catName);
    } else {
      const result = await client.query(
        "INSERT INTO product_categories(name) VALUES ($1) RETURNING id",
        [catName]
      );
      categoryId = result.rows[0].id;
      categoryMap.set(catName, categoryId);
      summary.created.categories.push(catName);
    }
  }

  // Auto-create brand if needed
  let brandId = null;
  if (row.marca && String(row.marca).trim()) {
    const brandName = String(row.marca).toUpperCase().trim();
    if (brandMap.has(brandName)) {
      brandId = brandMap.get(brandName);
    } else {
      const result = await client.query(
        "INSERT INTO product_brands(name) VALUES ($1) RETURNING id",
        [brandName]
      );
      brandId = result.rows[0].id;
      brandMap.set(brandName, brandId);
      summary.created.brands.push(brandName);
    }
  }

  // Auto-create rubro if needed
  let rubroId = null;
  if (row.rubro && String(row.rubro).trim()) {
    const rubroName = String(row.rubro).toUpperCase().trim();
    if (rubroMap.has(rubroName)) {
      rubroId = rubroMap.get(rubroName);
    } else {
      const result = await client.query(
        "INSERT INTO product_rubros(name) VALUES ($1) RETURNING id",
        [rubroName]
      );
      rubroId = result.rows[0].id;
      rubroMap.set(rubroName, rubroId);
      summary.created.rubros.push(rubroName);
    }
  }

  // Auto-create supplier if needed
  let supplierId = null;
  if (row.proveedor && String(row.proveedor).trim()) {
    const supplierName = String(row.proveedor).toUpperCase().trim();
    if (supplierMap.has(supplierName)) {
      supplierId = supplierMap.get(supplierName);
    } else {
      const result = await client.query(
        "INSERT INTO suppliers(name) VALUES ($1) RETURNING id",
        [supplierName]
      );
      supplierId = result.rows[0].id;
      supplierMap.set(supplierName, supplierId);
      summary.created.suppliers.push(supplierName);
    }
  }

  // Insert product
  const productResult = await client.query(
    `INSERT INTO products(
      sku, name, category_id, brand_id, rubro_id, supplier_id, pack_size, unit_label,
      price_minorista, price_mayorista, cost, iva, profit_margin, min_stock, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
    RETURNING id`,
    [
      row.sku ? String(row.sku).trim() : null,
      String(row.nombre).trim(),
      categoryId,
      brandId,
      rubroId,
      supplierId,
      Number(row.pack_size) || 1,
      row.unit_label ? String(row.unit_label).trim() : "fardo",
      Number(row.precio_minorista) || 0,
      Number(row.precio_mayorista) || 0,
      Number(row.costo) || 0,
      Number(row.iva) || 21,
      Number(row.margen_ganancia) || 30,
      Number(row.stock_minimo) || 0,
    ]
  );

  // Create inventory balances for all locations
  for (const loc of locations) {
    await client.query(
      `INSERT INTO inventory_balances(product_id, location_id, quantity)
       VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`,
      [productResult.rows[0].id, loc.id]
    );
  }
}

async function importCustomer(client, row, rowNum) {
  if (!row.nombre || !String(row.nombre).trim()) {
    throw new Error("Campo nombre requerido");
  }

  const latitude = row.latitud && !isNaN(Number(row.latitud)) ? Number(row.latitud) : null;
  const longitude = row.longitud && !isNaN(Number(row.longitud)) ? Number(row.longitud) : null;

  await client.query(
    `INSERT INTO customers(name, phone, address, zone, latitude, longitude, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      String(row.nombre).trim(),
      row.telefono ? String(row.telefono).trim() : null,
      row.direccion ? String(row.direccion).trim() : null,
      row.zona ? String(row.zona).trim() : null,
      latitude,
      longitude,
      row.notas ? String(row.notas).trim() : null,
    ]
  );
}

async function importSupplier(client, row, rowNum) {
  if (!row.nombre || !String(row.nombre).trim()) {
    throw new Error("Campo nombre requerido");
  }

  await client.query(
    `INSERT INTO suppliers(name, phone, address, cuit, iva_condition)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      String(row.nombre).trim(),
      row.telefono ? String(row.telefono).trim() : null,
      row.direccion ? String(row.direccion).trim() : null,
      row.cuit ? String(row.cuit).trim() : null,
      row.condicion_iva ? String(row.condicion_iva).trim() : "RESPONSABLE INSCRIPTO",
    ]
  );
}

module.exports = {
  generateTemplate,
  generateTemplateExcel,
  exportData,
  exportDataExcel,
  validateImport,
  importData,
};
