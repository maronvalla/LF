const { pool } = require("../db");
const { format, parseString } = require("fast-csv");
const XLSX = require("xlsx");
const { createInboundLayer } = require("./inventory-fifo");

const DEFAULT_PRICE_LISTS = [
  { key: "MINORISTA", label: "Minorista" },
  { key: "MAYORISTA", label: "Mayorista" },
];

const STATIC_TEMPLATES = {
  customers: {
    headers: [
      "nombre",
      "codigo",
      "tax_id",
      "telefono",
      "email",
      "direccion",
      "zona",
      "condicion_iva",
      "lista_precio",
      "latitud",
      "longitud",
      "notas",
    ],
    example: {
      nombre: "Juan Perez",
      codigo: "CLI-001",
      tax_id: "20-12345678-9",
      telefono: "1155443322",
      email: "cliente@example.com",
      direccion: "Av. Corrientes 1234",
      zona: "CENTRO",
      condicion_iva: "Consumidor Final",
      lista_precio: "MAYORISTA",
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

function normalizePriceListKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function loadPriceLists() {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key = 'price_lists' LIMIT 1"
  );
  const stored = rows[0]?.value?.lists;
  if (!Array.isArray(stored) || !stored.length) return DEFAULT_PRICE_LISTS;

  const unique = new Map(DEFAULT_PRICE_LISTS.map((row) => [row.key, row]));
  for (const row of stored) {
    const key = normalizePriceListKey(row?.key);
    const label = String(row?.label || "").trim();
    if (!key || !label) continue;
    unique.set(key, { key, label });
  }
  return Array.from(unique.values());
}

function getCustomPriceListColumns(priceLists) {
  return (priceLists || [])
    .map((row) => normalizePriceListKey(row.key))
    .filter((key) => key && key !== "MINORISTA" && key !== "MAYORISTA")
    .map((key) => `precio_${key.toLowerCase()}`);
}

async function buildProductTemplate() {
  const priceLists = await loadPriceLists();
  const headers = [
    "sku",
    "nombre",
    "categoria",
    "marca",
    "rubro",
    "proveedor",
    "unit_label",
    "precio_minorista",
    "precio_mayorista",
    ...getCustomPriceListColumns(priceLists),
    "costo",
    "iva",
    "margen_ganancia",
    "stock_local",
    "stock_minimo",
    "envases_retorables",
    "envases_por_producto",
  ];

  const example = {
    sku: "ABC123",
    nombre: "Coca Cola 2.5L",
    categoria: "BEBIDAS",
    marca: "COCA-COLA",
    rubro: "GASEOSAS",
    proveedor: "DISTRIBUIDORA NORTE",
    unit_label: "Caja",
    precio_minorista: "1500",
    precio_mayorista: "1350",
    costo: "1100",
    iva: "21",
    margen_ganancia: "30",
    stock_local: "24",
    stock_minimo: "10",
    envases_retorables: "NO",
    envases_por_producto: "0",
  };

  for (const column of getCustomPriceListColumns(priceLists)) {
    example[column] = example.precio_minorista;
  }

  return { headers, example, priceLists };
}

async function buildCustomerTemplate() {
  const priceLists = await loadPriceLists();
  const template = STATIC_TEMPLATES.customers;
  return {
    headers: template.headers,
    example: {
      ...template.example,
      lista_precio: priceLists[0]?.key || "MAYORISTA",
    },
    priceLists,
  };
}

async function getTemplateDefinition(entity) {
  if (entity === "products") {
    return buildProductTemplate();
  }
  if (entity === "customers") {
    return buildCustomerTemplate();
  }
  const template = STATIC_TEMPLATES[entity];
  if (!template) {
    throw new Error(`Entity "${entity}" not supported`);
  }
  return template;
}

async function generateTemplate(entity) {
  const template = await getTemplateDefinition(entity);
  return new Promise((resolve, reject) => {
    const rows = [template.headers, template.headers.map((header) => template.example[header] ?? "")];
    let csvContent = "";
    const csvStream = format({ headers: false });
    csvStream.on("data", (chunk) => (csvContent += chunk));
    csvStream.on("end", () => resolve(csvContent));
    csvStream.on("error", reject);
    rows.forEach((row) => csvStream.write(row));
    csvStream.end();
  });
}

async function generateTemplateExcel(entity) {
  const template = await getTemplateDefinition(entity);
  const data = [template.headers, template.headers.map((header) => template.example[header] ?? "")];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entity);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function exportData(entity) {
  const { rows, mapRow, headers } = await getExportData(entity);
  return new Promise((resolve, reject) => {
    let csvContent = "";
    const csvStream = format({ headers: true });
    csvStream.on("data", (chunk) => (csvContent += chunk));
    csvStream.on("end", () => resolve(csvContent));
    csvStream.on("error", reject);

    rows.forEach((row) => {
      const mapped = mapRow(row);
      const ordered = {};
      headers.forEach((header) => {
        ordered[header] = mapped[header] ?? "";
      });
      csvStream.write(ordered);
    });
    csvStream.end();
  });
}

async function exportDataExcel(entity) {
  const { rows, mapRow, headers } = await getExportData(entity);
  const data = [headers];
  rows.forEach((row) => {
    const mapped = mapRow(row);
    data.push(headers.map((header) => mapped[header] ?? ""));
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entity);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function getExportData(entity) {
  let query;
  let mapRow;
  let headers;

  switch (entity) {
    case "products": {
      const template = await buildProductTemplate();
      headers = template.headers;
      query = `
        SELECT
          p.*,
          c.name AS category_name,
          b.name AS brand_name,
          r.name AS rubro_name,
          s.name AS supplier_name,
          COALESCE(bl.quantity, 0) AS stock_local
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN product_brands b ON b.id = p.brand_id
        LEFT JOIN product_rubros r ON r.id = p.rubro_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN (
          SELECT ib.product_id, ib.quantity
          FROM inventory_balances ib
          INNER JOIN locations l ON l.id = ib.location_id
          WHERE l.code = 'LOCAL'
        ) bl ON bl.product_id = p.id
        WHERE p.is_active = true
        ORDER BY p.name ASC
      `;
      mapRow = (r) => {
        const priceLists = r.price_lists && typeof r.price_lists === "object" ? r.price_lists : {};
        const row = {
          sku: r.sku || "",
          nombre: r.name,
          categoria: r.category_name || "",
          marca: r.brand_name || "",
          rubro: r.rubro_name || "",
          proveedor: r.supplier_name || "",
          unit_label: r.unit_label || "Caja",
          precio_minorista: r.price_minorista || 0,
          precio_mayorista: r.price_mayorista || 0,
          costo: r.cost || 0,
          iva: r.iva || 21,
          margen_ganancia: r.profit_margin || 30,
          stock_local: r.stock_local || 0,
          stock_minimo: r.min_stock || 0,
          envases_retorables: r.has_returnable ? "SI" : "NO",
          envases_por_producto: r.returnable_units_per_item || 0,
        };
        for (const column of getCustomPriceListColumns(template.priceLists)) {
          const key = normalizePriceListKey(column.replace(/^precio_/, ""));
          row[column] = Number(priceLists[key] || 0);
        }
        return row;
      };
      break;
    }
    case "customers": {
      const template = await buildCustomerTemplate();
      headers = template.headers;
      query = `SELECT * FROM customers ORDER BY name ASC`;
      mapRow = (r) => ({
        nombre: r.name,
        codigo: r.code || "",
        tax_id: r.tax_id || "",
        telefono: r.phone || "",
        email: r.email || "",
        direccion: r.address || "",
        zona: r.zone || "",
        condicion_iva: r.iva_condition || "Consumidor Final",
        lista_precio: r.preferred_price_list || "",
        latitud: r.latitude || "",
        longitud: r.longitude || "",
        notas: r.notes || "",
      });
      break;
    }
    case "suppliers":
      headers = STATIC_TEMPLATES.suppliers.headers;
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
  return { rows, mapRow, headers };
}

function parseCSV(content) {
  return new Promise((resolve, reject) => {
    const rows = [];
    parseString(content, { headers: true, trim: true })
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

async function parseFile(buffer, filename) {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv") return parseCSV(buffer.toString("utf-8"));
  if (ext === "xlsx" || ext === "xls") return parseExcel(buffer);
  throw new Error("Formato de archivo no soportado. Use CSV o Excel (.xlsx)");
}

function parseBooleanLike(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["SI", "SÍ", "YES", "TRUE", "1"].includes(normalized);
}

function parseFlexibleNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  let raw = String(value).trim();
  if (!raw) return null;

  raw = raw.replace(/\s+/g, "").replace(/\$/g, "");

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    raw = raw.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") {
      raw = raw.replace(",", ".");
    }
  } else if (hasComma) {
    const parts = raw.split(",");
    if (parts.length > 2) {
      raw = parts.join("");
    } else if ((parts[1] || "").length <= 2) {
      raw = `${parts[0]}.${parts[1]}`;
    } else {
      raw = parts.join("");
    }
  } else if (hasDot) {
    const parts = raw.split(".");
    if (parts.length > 2) {
      raw = parts.join("");
    }
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFlexibleInteger(value) {
  const parsed = parseFlexibleNumber(value);
  if (parsed === null) return null;
  return Math.round(parsed);
}

function getDynamicPriceColumns(row) {
  return Object.keys(row || {}).filter(
    (key) => /^precio_/i.test(String(key || "")) && !["precio_minorista", "precio_mayorista"].includes(String(key).toLowerCase())
  );
}

async function validateImport(entity, fileBuffer, filename) {
  const rows = await parseFile(fileBuffer, filename);
  const errors = [];
  const toCreate = { categories: new Set(), brands: new Set(), rubros: new Set(), suppliers: new Set() };
  const priceLists = entity === "customers" ? await loadPriceLists() : [];
  const priceListKeys = new Set((priceLists || []).map((row) => normalizePriceListKey(row.key)));

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
    const rowNum = i + 2;

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
        ["precio_minorista", "precio_mayorista", "costo", "iva", "margen_ganancia", "stock_local", "stock_minimo", "envases_por_producto"]
          .concat(getDynamicPriceColumns(row))
          .forEach((field) => {
            if (row[field] !== "" && row[field] !== undefined && parseFlexibleNumber(row[field]) === null) {
              errors.push({ row: rowNum, field, message: "Debe ser numerico" });
            }
          });
        break;
      case "customers":
        ["latitud", "longitud"].forEach((field) => {
          if (row[field] !== "" && row[field] !== undefined && parseFlexibleNumber(row[field]) === null) {
            errors.push({ row: rowNum, field, message: "Debe ser numerico" });
          }
        });
        if (row.lista_precio) {
          const normalizedPriceList = normalizePriceListKey(row.lista_precio);
          if (normalizedPriceList && !priceListKeys.has(normalizedPriceList)) {
            errors.push({ row: rowNum, field: "lista_precio", message: "Lista de precio invalida" });
          }
        }
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

async function importData(entity, fileBuffer, filename) {
  const rows = await parseFile(fileBuffer, filename);
  const preview = await validateImport(entity, fileBuffer, filename);
  const invalidRows = new Map();
  for (const issue of preview.errors || []) {
    const rowKey = Number(issue.row);
    if (!invalidRows.has(rowKey)) invalidRows.set(rowKey, []);
    invalidRows.get(rowKey).push(
      issue.field ? `${issue.field}: ${issue.message}` : String(issue.message || "Fila invalida")
    );
  }
  const client = await pool.connect();
  const summary = {
    total: rows.length,
    imported: 0,
    errors: 0,
    skipped: invalidRows.size,
    created: { categories: [], brands: [], rubros: [], suppliers: [] },
  };
  const errors = Array.from(invalidRows.entries()).map(([row, messages]) => ({
    row,
    message: messages.join(" | "),
  }));

  try {
    await client.query("BEGIN");
    const customerPriceLists = entity === "customers" ? await loadPriceLists() : [];

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
    const locations = await client.query("SELECT id, code FROM locations WHERE code IN ('GALPON', 'LOCAL')");
    const localLocation = locations.rows.find((row) => row.code === "LOCAL");

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (invalidRows.has(rowNum)) {
        continue;
      }
      try {
        await client.query("SAVEPOINT import_row");
        switch (entity) {
          case "products":
            await importProduct(client, row, categoryMap, brandMap, rubroMap, supplierMap, summary, locations.rows, localLocation);
            break;
          case "customers":
            await importCustomer(client, row, customerPriceLists);
            break;
          case "suppliers":
            await importSupplier(client, row);
            break;
        }
        await client.query("RELEASE SAVEPOINT import_row");
        summary.imported++;
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT import_row");
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

async function importProduct(client, row, categoryMap, brandMap, rubroMap, supplierMap, summary, locations, localLocation) {
  if (!row.nombre || !String(row.nombre).trim()) {
    throw new Error("Campo nombre requerido");
  }

  let categoryId = null;
  if (row.categoria && String(row.categoria).trim()) {
    const catName = String(row.categoria).toUpperCase().trim();
    if (categoryMap.has(catName)) {
      categoryId = categoryMap.get(catName);
    } else {
      const result = await client.query("INSERT INTO product_categories(name) VALUES ($1) RETURNING id", [catName]);
      categoryId = result.rows[0].id;
      categoryMap.set(catName, categoryId);
      summary.created.categories.push(catName);
    }
  }

  let brandId = null;
  if (row.marca && String(row.marca).trim()) {
    const brandName = String(row.marca).toUpperCase().trim();
    if (brandMap.has(brandName)) {
      brandId = brandMap.get(brandName);
    } else {
      const result = await client.query("INSERT INTO product_brands(name) VALUES ($1) RETURNING id", [brandName]);
      brandId = result.rows[0].id;
      brandMap.set(brandName, brandId);
      summary.created.brands.push(brandName);
    }
  }

  let rubroId = null;
  if (row.rubro && String(row.rubro).trim()) {
    const rubroName = String(row.rubro).toUpperCase().trim();
    if (rubroMap.has(rubroName)) {
      rubroId = rubroMap.get(rubroName);
    } else {
      const result = await client.query("INSERT INTO product_rubros(name) VALUES ($1) RETURNING id", [rubroName]);
      rubroId = result.rows[0].id;
      rubroMap.set(rubroName, rubroId);
      summary.created.rubros.push(rubroName);
    }
  }

  let supplierId = null;
  if (row.proveedor && String(row.proveedor).trim()) {
    const supplierName = String(row.proveedor).toUpperCase().trim();
    if (supplierMap.has(supplierName)) {
      supplierId = supplierMap.get(supplierName);
    } else {
      const result = await client.query("INSERT INTO suppliers(name) VALUES ($1) RETURNING id", [supplierName]);
      supplierId = result.rows[0].id;
      supplierMap.set(supplierName, supplierId);
      summary.created.suppliers.push(supplierName);
    }
  }

  const priceLists = {};
  for (const field of getDynamicPriceColumns(row)) {
    const key = normalizePriceListKey(field.replace(/^precio_/i, ""));
    priceLists[key] = parseFlexibleInteger(row[field]) || 0;
  }
  priceLists.MINORISTA = parseFlexibleInteger(row.precio_minorista) || 0;
  priceLists.MAYORISTA = parseFlexibleInteger(row.precio_mayorista) || parseFlexibleInteger(row.precio_minorista) || 0;

  const productResult = await client.query(
    `INSERT INTO products(
      sku, name, category_id, brand_id, rubro_id, supplier_id, pack_size, unit_label,
      price_minorista, price_mayorista, price_lists, cost, iva, profit_margin, min_stock,
      has_returnable, returnable_units_per_item, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, true)
    RETURNING id`,
    [
      row.sku ? String(row.sku).trim() : null,
      String(row.nombre).trim(),
      categoryId,
      brandId,
      rubroId,
      supplierId,
      row.unit_label ? String(row.unit_label).trim() : "Caja",
      parseFlexibleInteger(row.precio_minorista) || 0,
      parseFlexibleInteger(row.precio_mayorista) || 0,
      JSON.stringify(priceLists),
      parseFlexibleInteger(row.costo) || 0,
      parseFlexibleInteger(row.iva) || 0,
      parseFlexibleInteger(row.margen_ganancia) || 0,
      parseFlexibleInteger(row.stock_minimo) || 0,
      parseBooleanLike(row.envases_retorables),
      parseFlexibleInteger(row.envases_por_producto) || 0,
    ]
  );

  for (const loc of locations) {
    await client.query(
      `INSERT INTO inventory_balances(product_id, location_id, quantity)
       VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`,
      [productResult.rows[0].id, loc.id]
    );
  }

  const stockLocal = parseFlexibleInteger(row.stock_local) || 0;
  if (stockLocal > 0 && localLocation?.id) {
    await client.query(
      `UPDATE inventory_balances
       SET quantity = $1, updated_at = now()
       WHERE product_id = $2 AND location_id = $3`,
      [stockLocal, productResult.rows[0].id, localLocation.id]
    );
    await client.query(
      `INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason)
       VALUES ($1, NULL, $2, $3, 'AJUSTE_INICIAL')`,
      [productResult.rows[0].id, localLocation.id, stockLocal]
    );
    await createInboundLayer(client, {
      productId: productResult.rows[0].id,
      locationId: localLocation.id,
      qty: stockLocal,
      unitCost: parseFlexibleInteger(row.costo) || 0,
      sourceType: "AJUSTE_INICIAL",
      sourceId: productResult.rows[0].id,
      receivedAt: new Date().toISOString(),
      notes: "Stock inicial importado",
      createdBy: null,
    });
  }
}

async function importCustomer(client, row, priceLists = []) {
  if (!row.nombre || !String(row.nombre).trim()) {
    throw new Error("Campo nombre requerido");
  }

  const latitude = parseFlexibleNumber(row.latitud);
  const longitude = parseFlexibleNumber(row.longitud);
  const normalizedPriceList = normalizePriceListKey(row.lista_precio);
  const availablePriceLists = new Set((priceLists || []).map((entry) => normalizePriceListKey(entry.key)));
  const preferredPriceList =
    normalizedPriceList && availablePriceLists.has(normalizedPriceList) ? normalizedPriceList : null;

  await client.query(
    `INSERT INTO customers(name, code, tax_id, phone, email, address, zone, iva_condition, preferred_price_list, latitude, longitude, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'MAYORISTA'), $10, $11, $12)`,
    [
      String(row.nombre).trim(),
      row.codigo ? String(row.codigo).trim() : null,
      row.tax_id ? String(row.tax_id).trim() : null,
      row.telefono ? String(row.telefono).trim() : null,
      row.email ? String(row.email).trim() : null,
      row.direccion ? String(row.direccion).trim() : null,
      row.zona ? String(row.zona).trim() : null,
      row.condicion_iva ? String(row.condicion_iva).trim() : "Consumidor Final",
      preferredPriceList,
      latitude,
      longitude,
      row.notas ? String(row.notas).trim() : null,
    ]
  );
}

async function importSupplier(client, row) {
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
