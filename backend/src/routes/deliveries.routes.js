const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission, isAdmin } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");
const { getIO } = require("../realtime");

const router = express.Router();

const deliveryQuerySchema = z.object({
  date: z.string().date(),
  slot: z.enum(["11", "19"]),
});

const generateSchema = z.object({
  deliveryDate: z.string().date().optional(),
  shift: z.enum(["MANIANA", "TARDE"]),
  overrideClosed: z.boolean().optional().default(false),
});

const checklistSchema = z.object({
  checklist: z.record(z.string(), z.boolean()),
  overrideClosed: z.boolean().optional().default(false),
});

const markDeliveredSchema = z.object({
  finalPayment: z.object({
    method: z.enum(["EFECTIVO", "TRANSFERENCIA", "MIXTO"]),
    cashAmount: z.number().min(0).optional().default(0),
    transferAmount: z.number().min(0).optional().default(0),
    proofImageBase64: z.string().trim().optional(),
    proofImageMimeType: z.string().trim().optional(),
    proofImageName: z.string().trim().optional(),
  }),
});

const markStatusSchema = z.object({
  status: z.enum(["PENDIENTE", "CARGADO", "RECHAZADO", "NO_ESTABA"]),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
});

const consolidatedControlSchema = z.object({
  date: z.string().date(),
  slot: z.enum(["11", "19"]),
  cashierName: z.string().min(2),
  driverName: z.string().min(2),
  cashierSignatureBase64: z.string().min(30),
  driverSignatureBase64: z.string().min(30),
  totalOrders: z.number().int().nonnegative().optional(),
  totalItems: z.number().int().nonnegative().optional(),
  checklist: z.record(z.string(), z.boolean()).optional().default({}),
  pickPlan: z
    .array(
      z.object({
        productId: z.string(),
        localQty: z.number().int().nonnegative(),
        galponQty: z.number().int().nonnegative(),
      })
    )
    .optional()
    .default([]),
});

const consolidatedControlCancelSchema = z.object({
  date: z.string().date(),
  slot: z.enum(["11", "19"]),
});

function requireConsolidatedControlRole(req, res) {
  const role = String(req.user?.role || "").toUpperCase();
  if (role === "ADMIN" || role === "CAJERO") return null;
  return res.status(403).json({ message: "Solo CAJERO o ADMIN pueden controlar el consolidado" });
}

function emitDeliveryStatusChanged(row) {
  const io = getIO();
  if (!io || !row) return;

  io.emit("delivery_status_changed", {
    sale_id: row.id,
    sale_number: row.sale_number || null,
    delivery_status: row.delivery_status || null,
    scheduled_date: row.scheduled_date || null,
    delivery_slot: row.delivery_slot || null,
    updated_at: row.delivery_status_updated_at || row.updated_at || new Date().toISOString(),
  });
}

async function getOrCreateDelivery(client, userId, deliveryDate, shift) {
  const found = await client.query(
    "SELECT * FROM deliveries WHERE delivery_date = $1 AND shift = $2 FOR UPDATE",
    [deliveryDate, shift]
  );
  if (found.rows[0]) return found.rows[0];
  const created = await client.query(
    `
      INSERT INTO deliveries(delivery_date, shift, status, created_by)
      VALUES ($1,$2,'BORRADOR',$3)
      RETURNING *
    `,
    [deliveryDate, shift, userId]
  );
  return created.rows[0];
}

async function assertEditableDelivery(req, delivery, overrideClosed) {
  if (delivery.status !== "CARGA_CERRADA") return;
  if (overrideClosed && isAdmin(req)) return;
  const err = new Error("Delivery con carga cerrada. Solo ADMIN con override puede modificar");
  err.status = 403;
  throw err;
}

async function listDeliveryOrders(date, slot) {
  const { rows } = await pool.query(
    `
      SELECT
        s.id,
        s.sale_number,
        s.scheduled_date,
        s.delivery_slot,
        CASE
          WHEN NULLIF(TRIM(UPPER(s.delivery_status)), '') IS NULL
            AND UPPER(COALESCE(s.status, '')) = 'CARGADO'
          THEN 'CARGADO'
          ELSE COALESCE(NULLIF(TRIM(UPPER(s.delivery_status)), ''), 'PENDIENTE')
        END AS delivery_status,
        s.delivery_payment,
        s.delivery_payment_method,
        s.delivery_final_payment_method,
        s.delivery_final_cash_amount,
        s.delivery_final_transfer_amount,
        s.delivery_address,
        s.notes,
        c.id AS customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.latitude AS customer_latitude,
        c.longitude AS customer_longitude,
        COALESCE(total.total_amount, 0)::numeric AS sale_total,
        COALESCE(items.items, '[]'::json) AS items
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(si.line_total), 0) AS total_amount
        FROM sale_items si
        WHERE si.sale_id = s.id
      ) total ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', si.id,
            'productId', si.product_id,
            'productName', p.name,
            'sku', p.sku,
            'qty', si.qty,
            'unitPrice', si.unit_price,
            'lineTotal', si.line_total,
            'unitLabel', p.unit_label,
            'hasReturnable', COALESCE(p.has_returnable, false),
            'returnableUnitsPerItem', COALESCE(p.returnable_units_per_item, 0)
          )
          ORDER BY p.name
        ) AS items
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = s.id
      ) items ON true
      WHERE (s.is_delivery = true OR s.sale_type = 'ENVIO')
        AND s.scheduled_date = $1
        AND s.delivery_slot = $2
        AND s.status <> 'ANULADO'
      ORDER BY s.created_at ASC
    `,
    [date, slot]
  );
  return rows;
}

function resolveCashToRender(order) {
  const status = String(order.delivery_status || "").toUpperCase();
  if (status !== "ENTREGADO") return 0;

  const finalMethod = String(order.delivery_final_payment_method || "").toUpperCase();
  const finalCash = Number(order.delivery_final_cash_amount || 0);
  const saleTotal = Number(order.sale_total || 0);
  const configuredMethod = String(order.delivery_payment_method || "").toUpperCase();
  const configuredPayment = String(order.delivery_payment || "").toUpperCase();

  if (finalMethod === "MIXTO") return finalCash > 0 ? finalCash : 0;
  if (finalMethod === "EFECTIVO") return finalCash > 0 ? finalCash : saleTotal;
  if (finalMethod === "TRANSFERENCIA") return 0;

  // Fallback legacy: if delivery was recorded as local cash and no final breakdown exists.
  if (configuredPayment === "PAGADO_LOCAL" && configuredMethod === "EFECTIVO") {
    return saleTotal;
  }
  return 0;
}

function buildDriverSummary(orders) {
  let deliveredCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  let totalRoute = 0;
  let cashToRender = 0;
  let transferRegistered = 0;
  let returnablesToRender = 0;
  let rejectedMerchandiseQty = 0;
  const rejectedByProduct = new Map();

  for (const order of orders) {
    const status = String(order.delivery_status || "").toUpperCase();
    const saleTotal = Number(order.sale_total || 0);
    totalRoute += saleTotal;

    if (status === "ENTREGADO") deliveredCount += 1;
    else if (status === "RECHAZADO" || status === "NO_ESTABA") rejectedCount += 1;
    else pendingCount += 1;

    cashToRender += resolveCashToRender(order);

    const method = String(order.delivery_final_payment_method || "").toUpperCase();
    if (method === "TRANSFERENCIA") {
      transferRegistered += Number(order.delivery_final_transfer_amount || saleTotal || 0);
    } else if (method === "MIXTO") {
      transferRegistered += Number(order.delivery_final_transfer_amount || 0);
    }

    const items = Array.isArray(order.items) ? order.items : [];
    if (status === "ENTREGADO") {
      for (const item of items) {
        const itemQty = Number(item.qty || 0);
        const perItem = Number(item.returnableUnitsPerItem || 0);
        const hasReturnable =
          Boolean(item.hasReturnable) || (Number.isFinite(perItem) && perItem > 0);
        if (!hasReturnable || itemQty <= 0 || perItem <= 0) continue;
        returnablesToRender += itemQty * perItem;
      }
    }

    if (status === "RECHAZADO" || status === "NO_ESTABA") {
      for (const item of items) {
        const itemQty = Number(item.qty || 0);
        if (itemQty <= 0) continue;
        rejectedMerchandiseQty += itemQty;

        const key = String(item.productId || item.sku || item.productName || "SIN_PRODUCTO");
        const prev = rejectedByProduct.get(key) || {
          productId: item.productId || null,
          sku: item.sku || null,
          productName: item.productName || "SIN PRODUCTO",
          qty: 0,
          unidad: item.unitLabel || "unidad",
        };
        prev.qty += itemQty;
        rejectedByProduct.set(key, prev);
      }
    }
  }

  return {
    deliveredCount,
    pendingCount,
    rejectedCount,
    totalRoute,
    cashToRender,
    transferRegistered,
    returnablesToRender,
    rejectedMerchandiseQty,
    rejectedReturnsByProduct: Array.from(rejectedByProduct.values()).sort((a, b) =>
      String(a.productName || "").localeCompare(String(b.productName || ""))
    ),
  };
}

router.get(
  "/",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const slot = req.query.slot;
    if (slot) {
      const parsed = deliveryQuerySchema.safeParse({ date, slot });
      if (!parsed.success) return res.status(400).json({ message: "Query invalida. Use date=YYYY-MM-DD&slot=11|19" });
      const orders = await listDeliveryOrders(parsed.data.date, parsed.data.slot);
      return res.json(orders);
    }
    const { rows } = await pool.query(
      "SELECT * FROM deliveries WHERE delivery_date = $1 ORDER BY shift ASC",
      [date]
    );
    res.json(rows);
  })
);

router.get(
  "/driver-board",
  requirePermission("deliveries.track"),
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const slot = req.query.slot || "11";
    const parsed = deliveryQuerySchema.safeParse({ date, slot });
    if (!parsed.success) {
      return res.status(400).json({ message: "Query invalida. Use date=YYYY-MM-DD&slot=11|19" });
    }

    const orders = await listDeliveryOrders(parsed.data.date, parsed.data.slot);
    const summary = buildDriverSummary(orders);

    res.json({
      date: parsed.data.date,
      slot: parsed.data.slot,
      orders,
      summary,
    });
  })
);

router.get(
  "/consolidated",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const parsed = deliveryQuerySchema.safeParse({
      date: req.query.date,
      slot: req.query.slot,
    });
    if (!parsed.success) return res.status(400).json({ message: "Query invalida. Use date=YYYY-MM-DD&slot=11|19" });
    const consolidated = await pool.query(
      `
      SELECT
        si.product_id,
        p.name,
        p.sku,
        p.unit_label,
        COALESCE(p.default_pick_location, 'GALPON') AS default_pick_location,
        COALESCE(p.has_returnable, false) AS has_returnable,
        COALESCE(p.returnable_units_per_item, 0) AS returnable_units_per_item,
        SUM(si.qty)::int AS total_qty,
        SUM(
          CASE
            WHEN COALESCE(p.has_returnable, false) THEN si.qty * COALESCE(p.returnable_units_per_item, 0)
            ELSE 0
          END
        )::int AS total_returnable_units
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN products p ON p.id = si.product_id
      WHERE (s.is_delivery = true OR s.sale_type = 'ENVIO')
        AND s.scheduled_date = $1
        AND s.delivery_slot = $2
        AND s.status <> 'ANULADO'
      GROUP BY
        si.product_id,
        p.name,
        p.sku,
        p.unit_label,
        p.default_pick_location,
        p.has_returnable,
        p.returnable_units_per_item
      ORDER BY p.name
    `,
      [parsed.data.date, parsed.data.slot]
    );

    const rejectedReturns = await pool.query(
      `
      SELECT
        si.product_id,
        p.name,
        p.sku,
        p.unit_label,
        SUM(si.qty)::int AS qty_to_return
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN products p ON p.id = si.product_id
      WHERE (s.is_delivery = true OR s.sale_type = 'ENVIO')
        AND s.scheduled_date = $1
        AND s.delivery_slot = $2
        AND s.status <> 'ANULADO'
        AND s.delivery_status IN ('RECHAZADO', 'NO_ESTABA')
      GROUP BY si.product_id, p.name, p.sku, p.unit_label
      ORDER BY p.name
      `,
      [parsed.data.date, parsed.data.slot]
    );

    res.json({
      date: parsed.data.date,
      slot: parsed.data.slot,
      consolidated: consolidated.rows,
      rejectedReturns: rejectedReturns.rows,
    });
  })
);

router.get(
  "/purchase-suggestion",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const parsed = deliveryQuerySchema.safeParse({
      date: req.query.date,
      slot: req.query.slot,
    });
    if (!parsed.success) {
      return res.status(400).json({ message: "Query invalida. Use date=YYYY-MM-DD&slot=11|19" });
    }

    const { rows } = await pool.query(
      `
        WITH delivery_products AS (
          SELECT
            si.product_id,
            SUM(si.qty)::int AS delivery_qty
          FROM sales s
          JOIN sale_items si ON si.sale_id = s.id
          WHERE (s.is_delivery = true OR s.sale_type = 'ENVIO')
            AND s.scheduled_date = $1
            AND s.delivery_slot = $2
            AND s.status <> 'ANULADO'
          GROUP BY si.product_id
        ),
        stock_totals AS (
          SELECT
            ib.product_id,
            COALESCE(SUM(ib.quantity), 0)::int AS existing_stock
          FROM inventory_balances ib
          GROUP BY ib.product_id
        )
        SELECT
          p.id AS product_id,
          COALESCE(p.sku, '') AS sku,
          p.name,
          p.unit_label,
          COALESCE(pr.name, '-') AS rubro_name,
          COALESCE(pb.name, '-') AS brand_name,
          COALESCE(pc.name, '-') AS category_name,
          COALESCE(p.cost, 0)::int AS unit_cost,
          COALESCE(p.price_mayorista, p.price_minorista, 0)::int AS wholesale_price,
          COALESCE(p.min_stock, 0)::int AS min_stock,
          COALESCE(st.existing_stock, 0)::int AS existing_stock,
          dp.delivery_qty,
          GREATEST(COALESCE(p.min_stock, 0) - COALESCE(st.existing_stock, 0), 0)::int AS qty_to_order,
          GREATEST(COALESCE(p.min_stock, 0) - COALESCE(st.existing_stock, 0), 0) * COALESCE(p.cost, 0)::int AS line_total_cost
        FROM delivery_products dp
        JOIN products p ON p.id = dp.product_id
        LEFT JOIN stock_totals st ON st.product_id = p.id
        LEFT JOIN product_rubros pr ON pr.id = p.rubro_id
        LEFT JOIN product_brands pb ON pb.id = p.brand_id
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.is_active = TRUE
        ORDER BY qty_to_order DESC, p.name ASC
      `,
      [parsed.data.date, parsed.data.slot]
    );

    const items = rows.map((row) => ({
      productId: row.product_id,
      sku: row.sku,
      name: row.name,
      unitLabel: row.unit_label,
      rubroName: row.rubro_name,
      brandName: row.brand_name,
      categoryName: row.category_name,
      unitCost: Number(row.unit_cost || 0),
      wholesalePrice: Number(row.wholesale_price || 0),
      minStock: Number(row.min_stock || 0),
      existingStock: Number(row.existing_stock || 0),
      deliveryQty: Number(row.delivery_qty || 0),
      qtyToOrder: Number(row.qty_to_order || 0),
      lineTotalCost: Number(row.line_total_cost || 0),
    }));

    const suggestedItems = items.filter((item) => item.qtyToOrder > 0);
    const totalCost = suggestedItems.reduce((acc, item) => acc + item.lineTotalCost, 0);

    res.json({
      ok: true,
      date: parsed.data.date,
      slot: parsed.data.slot,
      totalItems: suggestedItems.length,
      totalCost,
      items: suggestedItems,
    });
  })
);

router.get(
  "/consolidated-control",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const blocked = requireConsolidatedControlRole(req, res);
    if (blocked) return;

    const parsed = deliveryQuerySchema.safeParse({
      date: req.query.date,
      slot: req.query.slot,
    });
    if (!parsed.success) {
      return res.status(400).json({ message: "Query invalida. Use date=YYYY-MM-DD&slot=11|19" });
    }

    const { rows } = await pool.query(
      `
        SELECT
          id,
          control_date,
          slot,
          cashier_user_id,
          cashier_name,
          driver_name,
          cashier_signature_base64,
          driver_signature_base64,
          total_orders,
          total_items,
          checklist_json,
          pick_plan_json,
          created_at,
          updated_at
        FROM delivery_consolidated_controls
        WHERE control_date = $1
          AND slot = $2
        LIMIT 1
      `,
      [parsed.data.date, parsed.data.slot]
    );

    res.json(rows[0] || null);
  })
);

router.post(
  "/consolidated-control",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const blocked = requireConsolidatedControlRole(req, res);
    if (blocked) return;

    const parsed = consolidatedControlSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos para guardar control de consolidado" });
    }

    const d = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const upsert = await client.query(
        `
          INSERT INTO delivery_consolidated_controls(
            control_date, slot, cashier_user_id, cashier_name, driver_name,
            cashier_signature_base64, driver_signature_base64, total_orders, total_items,
            checklist_json, pick_plan_json
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
          ON CONFLICT (control_date, slot)
          DO UPDATE SET
            cashier_user_id = EXCLUDED.cashier_user_id,
            cashier_name = EXCLUDED.cashier_name,
            driver_name = EXCLUDED.driver_name,
            cashier_signature_base64 = EXCLUDED.cashier_signature_base64,
            driver_signature_base64 = EXCLUDED.driver_signature_base64,
            total_orders = EXCLUDED.total_orders,
            total_items = EXCLUDED.total_items,
            checklist_json = EXCLUDED.checklist_json,
            pick_plan_json = EXCLUDED.pick_plan_json,
            updated_at = now()
          RETURNING *
        `,
        [
          d.date,
          d.slot,
          req.user.id,
          d.cashierName.trim(),
          d.driverName.trim(),
          d.cashierSignatureBase64,
          d.driverSignatureBase64,
          Number(d.totalOrders || 0),
          Number(d.totalItems || 0),
          JSON.stringify(d.checklist || {}),
          JSON.stringify(d.pickPlan || []),
        ]
      );

      // After signed consolidated control, mark pending delivery orders as loaded.
      const markedLoaded = await client.query(
        `
          UPDATE sales
          SET
            delivery_status = 'CARGADO',
            status = CASE WHEN status IN ('PENDIENTE', 'PREPARADO') THEN 'CARGADO' ELSE status END,
            updated_at = now()
          WHERE (is_delivery = true OR sale_type = 'ENVIO')
            AND scheduled_date = $1
            AND delivery_slot = $2
            AND COALESCE(NULLIF(TRIM(UPPER(delivery_status)), ''), 'PENDIENTE') = 'PENDIENTE'
            AND status <> 'ANULADO'
          RETURNING id, sale_number, delivery_status, status
        `,
        [d.date, d.slot]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "DELIVERY_CONSOLIDATED_CONTROL_SAVE",
        entity: "delivery_consolidated_controls",
        entityId: upsert.rows[0].id,
        metadata: {
          date: d.date,
          slot: d.slot,
          cashierName: d.cashierName,
          driverName: d.driverName,
          totalOrders: Number(d.totalOrders || 0),
          totalItems: Number(d.totalItems || 0),
          checklistCount: Object.keys(d.checklist || {}).length,
          pickPlanCount: Array.isArray(d.pickPlan) ? d.pickPlan.length : 0,
          autoMarkedLoaded: markedLoaded.rowCount,
        },
        client,
      });

      if (markedLoaded.rowCount > 0) {
        await logAudit({
          actorUserId: req.user.id,
          action: "DELIVERY_MARK_LOADED",
          entity: "sales",
          metadata: {
            date: d.date,
            slot: d.slot,
            affected: markedLoaded.rowCount,
            source: "CONSOLIDATED_CONTROL_SAVE",
          },
          client,
        });
      }

      await client.query("COMMIT");
      res.json({ ...upsert.rows[0], autoMarkedLoaded: markedLoaded.rowCount });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/consolidated-control/cancel",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const blocked = requireConsolidatedControlRole(req, res);
    if (blocked) return;

    const parsed = consolidatedControlCancelSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos para anular control de consolidado" });
    }

    const { date, slot } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `
          SELECT id
          FROM delivery_consolidated_controls
          WHERE control_date = $1
            AND slot = $2
          FOR UPDATE
        `,
        [date, slot]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "No existe control de consolidado para ese turno" });
      }

      const reverted = await client.query(
        `
          UPDATE sales
          SET
            delivery_status = 'PENDIENTE',
            status = CASE WHEN status = 'CARGADO' THEN 'PREPARADO' ELSE status END,
            updated_at = now()
          WHERE (is_delivery = true OR sale_type = 'ENVIO')
            AND scheduled_date = $1
            AND delivery_slot = $2
            AND delivery_status = 'CARGADO'
            AND status <> 'ANULADO'
          RETURNING id, sale_number, delivery_status, status
        `,
        [date, slot]
      );

      await client.query(
        `
          DELETE FROM delivery_consolidated_controls
          WHERE id = $1
        `,
        [existing.rows[0].id]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "DELIVERY_CONSOLIDATED_CONTROL_CANCEL",
        entity: "delivery_consolidated_controls",
        entityId: existing.rows[0].id,
        metadata: {
          date,
          slot,
          revertedToPending: reverted.rowCount,
        },
        client,
      });

      await client.query("COMMIT");
      res.json({ ok: true, reverted: reverted.rowCount });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/mark-loaded",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const parsed = deliveryQuerySchema.safeParse({
      date: req.query.date,
      slot: req.query.slot,
    });
    if (!parsed.success) return res.status(400).json({ message: "Query invalida. Use date=YYYY-MM-DD&slot=11|19" });

    const updated = await pool.query(
      `
      UPDATE sales
      SET
        delivery_status = 'CARGADO',
        status = CASE WHEN status IN ('PENDIENTE', 'PREPARADO') THEN 'CARGADO' ELSE status END,
        updated_at = now()
      WHERE (is_delivery = true OR sale_type = 'ENVIO')
        AND scheduled_date = $1
        AND delivery_slot = $2
        AND COALESCE(NULLIF(TRIM(UPPER(delivery_status)), ''), 'PENDIENTE') = 'PENDIENTE'
        AND status <> 'ANULADO'
      RETURNING id, sale_number, delivery_status, status
    `,
      [parsed.data.date, parsed.data.slot]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "DELIVERY_MARK_LOADED",
      entity: "sales",
      metadata: {
        date: parsed.data.date,
        slot: parsed.data.slot,
        affected: updated.rowCount,
      },
    });
    res.json({ updated: updated.rowCount, orders: updated.rows });
  })
);

router.post(
  "/:id/mark-status",
  requirePermission("deliveries.track"),
  asyncHandler(async (req, res) => {
    const parsed = markStatusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos para cambiar estado" });
    }

    const { status, lat, lng } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `
          SELECT *
          FROM sales
          WHERE id = $1
            AND (is_delivery = true OR sale_type = 'ENVIO')
          FOR UPDATE
        `,
        [req.params.id]
      );
      const sale = found.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Pedido de envio no encontrado" });
      }
      if (String(sale.status || "").toUpperCase() === "ANULADO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No se puede modificar un pedido anulado" });
      }

      const updated = await client.query(
        `
          UPDATE sales
          SET
            delivery_status = $2,
            delivery_status_lat = $3,
            delivery_status_lng = $4,
            delivery_status_updated_at = now(),
            delivery_status_updated_by = $5,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [req.params.id, status, lat ?? null, lng ?? null, req.user.id]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "DELIVERY_MARK_STATUS",
        entity: "sales",
        entityId: req.params.id,
        metadata: {
          before: {
            delivery_status: sale.delivery_status,
            delivery_status_lat: sale.delivery_status_lat,
            delivery_status_lng: sale.delivery_status_lng,
          },
          after: {
            delivery_status: updated.rows[0].delivery_status,
            delivery_status_lat: updated.rows[0].delivery_status_lat,
            delivery_status_lng: updated.rows[0].delivery_status_lng,
          },
        },
        client,
      });

      await client.query("COMMIT");
      const updatedSale = updated.rows[0];
      emitDeliveryStatusChanged(updatedSale);
      res.json(updatedSale);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/:id/mark-delivered",
  requirePermission("deliveries.track"),
  asyncHandler(async (req, res) => {
    const parsed = markDeliveredSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Datos invalidos para marcar entrega" });
    }
    const { finalPayment } = parsed.data;
    const needsProof = finalPayment.method === "TRANSFERENCIA" || finalPayment.method === "MIXTO";
    if (needsProof && !finalPayment.proofImageBase64) {
      return res.status(400).json({ message: "Debe adjuntar foto del comprobante" });
    }
    if (!finalPayment.proofImageMimeType && needsProof) {
      return res.status(400).json({ message: "Debe informar tipo MIME del comprobante" });
    }
    if (
      finalPayment.method === "MIXTO" &&
      (finalPayment.cashAmount <= 0 || finalPayment.transferAmount <= 0)
    ) {
      return res.status(400).json({ message: "En pago mixto debe informar montos de efectivo y transferencia" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Lock the sale row first
      const lockRes = await client.query(
        `SELECT * FROM sales WHERE id = $1 AND (is_delivery = true OR sale_type = 'ENVIO') FOR UPDATE`,
        [req.params.id]
      );
      if (!lockRes.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Pedido de envio no encontrado" });
      }
      // Now get sale with total (no FOR UPDATE needed, row is locked)
      const found = await client.query(
        `
          SELECT
            s.*,
            COALESCE(SUM(si.line_total), 0)::numeric AS sale_total
          FROM sales s
          LEFT JOIN sale_items si ON si.sale_id = s.id
          WHERE s.id = $1
          GROUP BY s.id
        `,
        [req.params.id]
      );
      const sale = found.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Pedido de envio no encontrado" });
      }
      if (sale.delivery_status !== "CARGADO") {
        // Data repair fallback: if control exists for the turn, promote this order to CARGADO.
        const consolidated = await client.query(
          `
            SELECT id
            FROM delivery_consolidated_controls
            WHERE control_date = $1
              AND slot = $2
            LIMIT 1
          `,
          [sale.scheduled_date, sale.delivery_slot]
        );
        if (!consolidated.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Solo pedidos CARGADO pueden marcarse ENTREGADO" });
        }

        await client.query(
          `
            UPDATE sales
            SET
              delivery_status = 'CARGADO',
              status = CASE WHEN status IN ('PENDIENTE', 'PREPARADO') THEN 'CARGADO' ELSE status END,
              updated_at = now()
            WHERE id = $1
          `,
          [sale.id]
        );
        sale.delivery_status = "CARGADO";
      }

      const saleTotal = Number(sale.sale_total || 0);
      const closeEnough = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.01;
      let cashAmount = 0;
      let transferAmount = 0;

      if (finalPayment.method === "EFECTIVO") {
        cashAmount = Number(finalPayment.cashAmount || 0);
        if (cashAmount <= 0) cashAmount = saleTotal;
      } else if (finalPayment.method === "TRANSFERENCIA") {
        transferAmount = Number(finalPayment.transferAmount || 0);
        if (transferAmount <= 0) transferAmount = saleTotal;
      } else if (finalPayment.method === "MIXTO") {
        cashAmount = Number(finalPayment.cashAmount || 0);
        transferAmount = Number(finalPayment.transferAmount || 0);
        if (!closeEnough(cashAmount + transferAmount, saleTotal)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `En pago mixto la suma debe coincidir con el total del pedido ($${saleTotal.toFixed(2)}).`,
          });
        }
      }

      const updated = await client.query(
        `
          UPDATE sales
          SET
            delivery_status = 'ENTREGADO',
            delivery_payment = COALESCE(delivery_payment, 'COBRAR_EN_ENTREGA'),
            delivery_payment_method = $2,
            delivery_final_payment_method = $2,
            delivery_final_cash_amount = $3,
            delivery_final_transfer_amount = $4,
            delivery_transfer_proof_base64 = CASE WHEN $5 <> '' THEN $5 ELSE NULL END,
            delivery_transfer_proof_mime_type = CASE WHEN $6 <> '' THEN $6 ELSE NULL END,
            delivery_transfer_proof_name = CASE WHEN $7 <> '' THEN $7 ELSE NULL END,
            delivery_paid_at = now(),
            delivery_paid_by = $8,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [
          req.params.id,
          finalPayment.method,
          cashAmount,
          transferAmount,
          String(finalPayment.proofImageBase64 || ""),
          String(finalPayment.proofImageMimeType || ""),
          String(finalPayment.proofImageName || ""),
          req.user.id,
        ]
      );
      await logAudit({
        actorUserId: req.user.id,
        action: "DELIVERY_MARK_DELIVERED",
        entity: "sales",
        entityId: req.params.id,
        metadata: {
          before: sale,
          after: updated.rows[0],
          finalPayment: {
            method: finalPayment.method,
            cashAmount,
            transferAmount,
            proofAttached: Boolean(finalPayment.proofImageBase64),
            proofMimeType: finalPayment.proofImageMimeType || null,
            proofImageName: finalPayment.proofImageName || null,
          },
        },
        client,
      });
      await client.query("COMMIT");
      const updatedSale = updated.rows[0];
      emitDeliveryStatusChanged(updatedSale);
      res.json(updatedSale);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/generate",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
    const { shift, overrideClosed } = parsed.data;
    const deliveryDate = parsed.data.deliveryDate || new Date().toISOString().slice(0, 10);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const delivery = await getOrCreateDelivery(client, req.user.id, deliveryDate, shift);
      await assertEditableDelivery(req, delivery, overrideClosed);

      const sales = await client.query(
        `
        SELECT id FROM sales
        WHERE sale_type = 'ENVIO'
          AND scheduled_date = $1
          AND shift = $2
          AND status IN ('PENDIENTE','PREPARADO')
      `,
        [deliveryDate, shift]
      );

      for (const sale of sales.rows) {
        await client.query(
          `
          INSERT INTO delivery_sales(delivery_id, sale_id)
          VALUES ($1,$2)
          ON CONFLICT (delivery_id, sale_id) DO NOTHING
        `,
          [delivery.id, sale.id]
        );
      }

      const full = await client.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
      await logAudit({
        actorUserId: req.user.id,
        action: "DELIVERY_GENERATE",
        entity: "deliveries",
        entityId: delivery.id,
        metadata: { deliveryDate, shift, saleCount: sales.rows.length },
        client,
      });
      await client.query("COMMIT");
      res.json(full.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.get(
  "/:id/consolidated",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const delivery = await pool.query("SELECT * FROM deliveries WHERE id = $1", [req.params.id]);
    if (!delivery.rows[0]) return res.status(404).json({ message: "Delivery no encontrado" });
    const consolidated = await pool.query(
      `
      SELECT
        si.product_id,
        p.name,
        p.sku,
        SUM(si.qty)::int AS total_qty
      FROM delivery_sales ds
      JOIN sales s ON s.id = ds.sale_id
      JOIN sale_items si ON si.sale_id = s.id
      JOIN products p ON p.id = si.product_id
      WHERE ds.delivery_id = $1
        AND s.status IN ('PENDIENTE','PREPARADO','CARGADO')
      GROUP BY si.product_id, p.name, p.sku
      ORDER BY p.name
    `,
      [req.params.id]
    );
    res.json({ delivery: delivery.rows[0], consolidated: consolidated.rows });
  })
);

router.patch(
  "/:id/checklist",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const parsed = checklistSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT * FROM deliveries WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!found.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Delivery no encontrado" });
      }
      await assertEditableDelivery(req, found.rows[0], parsed.data.overrideClosed);

      const updated = await client.query(
        "UPDATE deliveries SET checklist = $2 WHERE id = $1 RETURNING *",
        [req.params.id, JSON.stringify(parsed.data.checklist)]
      );
      await logAudit({
        actorUserId: req.user.id,
        action: "DELIVERY_CHECKLIST_UPDATE",
        entity: "deliveries",
        entityId: req.params.id,
        metadata: { before: found.rows[0].checklist, after: updated.rows[0].checklist },
        client,
      });
      await client.query("COMMIT");
      res.json(updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/:id/close-load",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT * FROM deliveries WHERE id = $1 FOR UPDATE", [req.params.id]);
      const delivery = found.rows[0];
      if (!delivery) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Delivery no encontrado" });
      }
      if (delivery.status === "CARGA_CERRADA") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "La carga ya esta cerrada" });
      }

      const sales = await client.query(
        `
          SELECT s.id, s.status
          FROM delivery_sales ds
          JOIN sales s ON s.id = ds.sale_id
          WHERE ds.delivery_id = $1
        `,
        [delivery.id]
      );

      for (const sale of sales.rows) {
        if (sale.status === "PREPARADO") {
          await client.query("UPDATE sales SET status = 'CARGADO', updated_at = now() WHERE id = $1", [
            sale.id,
          ]);
        }
      }

      const updated = await client.query(
        "UPDATE deliveries SET status = 'CARGA_CERRADA' WHERE id = $1 RETURNING *",
        [delivery.id]
      );
      await logAudit({
        actorUserId: req.user.id,
        action: "DELIVERY_CLOSE_LOAD",
        entity: "deliveries",
        entityId: delivery.id,
        metadata: { affectedSales: sales.rows },
        client,
      });
      await client.query("COMMIT");
      res.json(updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
