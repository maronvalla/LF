const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const schema = z.object({
  sku: z.string().optional().nullable(),
  name: z.string().min(2),
  brandId: z.any().optional().nullable(),
  categoryId: z.any().optional().nullable(),
  rubroId: z.any().optional().nullable(),
  packSize: z.number().positive().default(1),
  unitLabel: z.string().default("fardo"),
  hasReturnable: z.boolean().optional().default(false),
  returnableUnitsPerItem: z.number().int().nonnegative().optional().default(0),
  priceMinorista: z.number().nonnegative(),
  priceMayorista: z.number().nonnegative().optional().nullable(),
  cost: z.number().nonnegative().optional().nullable(),
  iva: z.number().nonnegative().default(21),
  profitMargin: z.number().nonnegative().default(30),
  minStock: z.number().nonnegative().default(0),
  supplierId: z.any().optional().nullable(),
  isActive: z.boolean().default(true),
});

router.get(
  "/",
  requirePermission("inventory.view"),
  asyncHandler(async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT p.*, c.name AS category_name, b.name AS brand_name, r.name AS rubro_name, s.name AS supplier_name
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN product_brands b ON b.id = p.brand_id
        LEFT JOIN product_rubros r ON r.id = p.rubro_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        ORDER BY p.name ASC
      `);
      res.json(rows.map(r => ({
        ...r,
        brandId: r.brand_id,
        categoryId: r.category_id,
        rubroId: r.rubro_id,
        priceMinorista: r.price_minorista,
        priceMayorista: r.price_mayorista,
        packSize: r.pack_size,
        unitLabel: r.unit_label,
        hasReturnable: r.has_returnable,
        returnableUnitsPerItem: r.returnable_units_per_item,
        profitMargin: r.profit_margin,
        minStock: r.min_stock,
        supplierId: r.supplier_id,
        isActive: r.is_active,
        categoryName: r.category_name,
        brandName: r.brand_name,
        rubroName: r.rubro_name,
        supplierName: r.supplier_name
      })));
    } catch (err) {
      console.error("Error fetching products:", err);
      res.status(500).json({ message: "Error al obtener productos", error: err.message });
    }
  })
);

router.post(
  "/",
  requirePermission("products.manage"),
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos invalidos",
        errors: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }
    const d = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `
        INSERT INTO products(
          sku, name, brand_id, category_id, rubro_id, pack_size, unit_label,
          has_returnable, returnable_units_per_item,
          price_minorista, price_mayorista, cost, iva, profit_margin,
          min_stock, supplier_id, is_active
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING *
      `,
        [
          d.sku || null,
          d.name,
          isUUID(d.brandId) ? d.brandId : null,
          isUUID(d.categoryId) ? d.categoryId : null,
          isUUID(d.rubroId) ? d.rubroId : null,
          d.packSize,
          d.unitLabel,
          Boolean(d.hasReturnable),
          Number(d.returnableUnitsPerItem || 0),
          d.priceMinorista,
          d.priceMayorista || null,
          d.cost || null,
          d.iva,
          d.profitMargin,
          d.minStock,
          d.supplierId && isUUID(d.supplierId) ? d.supplierId : null,
          d.isActive,
        ]
      );

      const locations = await client.query(
        "SELECT id FROM locations WHERE code IN ('GALPON', 'LOCAL')"
      );
      for (const loc of locations.rows) {
        await client.query(
          `
          INSERT INTO inventory_balances(product_id, location_id, quantity)
          VALUES ($1, $2, 0)
          ON CONFLICT (product_id, location_id) DO NOTHING
        `,
          [rows[0].id, loc.id]
        );
      }

      await logAudit({
        actorUserId: req.user.id,
        action: "PRODUCT_CREATE",
        entity: "products",
        entityId: rows[0].id,
        metadata: { after: rows[0] },
        client,
      });
      await client.query("COMMIT");
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.put(
  "/:id",
  requirePermission("products.manage"),
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos invalidos",
        errors: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }
    const before = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
    if (!before.rows[0]) return res.status(404).json({ message: "Producto no encontrado" });
    const d = parsed.data;
    const { rows } = await pool.query(
      `
      UPDATE products
      SET sku = $2, name = $3, brand_id = $4, category_id = $5, rubro_id = $6, pack_size = $7, unit_label = $8,
          has_returnable = $9, returnable_units_per_item = $10,
          price_minorista = $11, price_mayorista = $12, cost = $13, iva = $14, profit_margin = $15,
          min_stock = $16, supplier_id = $17, is_active = $18
      WHERE id = $1
      RETURNING *
    `,
      [
        req.params.id,
        d.sku || null,
        d.name,
        isUUID(d.brandId) ? d.brandId : null,
        isUUID(d.categoryId) ? d.categoryId : null,
        isUUID(d.rubroId) ? d.rubroId : null,
        d.packSize,
        d.unitLabel,
        Boolean(d.hasReturnable),
        Number(d.returnableUnitsPerItem || 0),
        d.priceMinorista,
        d.priceMayorista || null,
        d.cost || null,
        d.iva,
        d.profitMargin,
        d.minStock,
        d.supplierId && isUUID(d.supplierId) ? d.supplierId : null,
        d.isActive,
      ]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "PRODUCT_UPDATE",
      entity: "products",
      entityId: rows[0].id,
      metadata: { before: before.rows[0], after: rows[0] },
    });
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  requirePermission("products.manage"),
  asyncHandler(async (req, res) => {
    const before = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
    if (!before.rows[0]) return res.status(404).json({ message: "Producto no encontrado" });
    const updated = await pool.query(
      "UPDATE products SET is_active = false WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "PRODUCT_DEACTIVATE",
      entity: "products",
      entityId: req.params.id,
      metadata: { before: before.rows[0], after: updated.rows[0] },
    });
    res.json(updated.rows[0]);
  })
);

module.exports = router;
