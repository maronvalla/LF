const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission, requireAnyPermission } = require("../middleware/rbac");
const { blockDuringStockControl } = require("../middleware/stock-control");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");
const {
  buildDefaultState,
  buildStockControlWorkbook,
  loadStockControlState,
  saveStockControlState,
  userCanManageStockControl,
} = require("../services/stock-control");
const { loadTransferPairs } = require("../services/inventory-transfer-settings");
const { notifyCriticalStockForProductIds } = require("../services/telegram-alerts");

const router = express.Router();

const transferSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().positive(),
  fromCode: z.string().trim().min(2).max(60),
  toCode: z.string().trim().min(2).max(60),
});

const adjustSchema = z.object({
  productId: z.string().uuid(),
  qtyDelta: z.number().int().refine((v) => v !== 0, "qtyDelta no puede ser 0"),
  locationCode: z.enum(["GALPON", "LOCAL"]),
  reason: z.enum(["AJUSTE_INICIAL", "AJUSTE"]),
});

const startStockControlSchema = z.object({
  startLocationCode: z.enum(["LOCAL", "GALPON"]),
});

const saveLocationCountsSchema = z.object({
  locationCode: z.enum(["LOCAL", "GALPON"]),
  stopAfterThis: z.boolean().optional().default(false),
  counts: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(120),
        actualQty: z.coerce.number().int().nonnegative(),
      })
    )
    .min(1),
});

async function getLocationIds(client, codes) {
  const { rows } = await client.query("SELECT id, code FROM locations WHERE code = ANY($1::text[])", [
    codes,
  ]);
  const map = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  for (const code of codes) {
    if (!map[code]) throw new Error(`Location ${code} no inicializada`);
  }
  return map;
}

async function ensureBalanceRow(client, productId, locationId) {
  await client.query(
    `
    INSERT INTO inventory_balances(product_id, location_id, quantity)
    VALUES ($1, $2, 0)
    ON CONFLICT (product_id, location_id) DO NOTHING
  `,
    [productId, locationId]
  );
}

function validationError(res, parsed) {
  return res.status(400).json({
    ok: false,
    message: "Datos invalidos",
    errors: parsed?.error?.issues || [],
  });
}

router.get(
  "/balances",
  requirePermission("inventory.view"),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        p.id AS product_id,
        p.name,
        p.sku,
        p.unit_label,
        l.code AS location_code,
        l.name AS location_name,
        COALESCE(b.quantity, 0) AS quantity
      FROM products p
      LEFT JOIN inventory_balances b ON b.product_id = p.id
      LEFT JOIN locations l ON l.id = b.location_id
      ORDER BY p.name ASC
    `);
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.product_id)) {
        grouped.set(row.product_id, {
          product_id: row.product_id,
          name: row.name,
          sku: row.sku,
          unit_label: row.unit_label,
          stock_galpon: 0,
          stock_local: 0,
          stocks: {},
        });
      }
      const current = grouped.get(row.product_id);
      const locationCode = String(row.location_code || "").toUpperCase();
      const quantity = Number(row.quantity || 0);
      if (locationCode) {
        current.stocks[locationCode] = {
          code: locationCode,
          name: row.location_name || locationCode,
          quantity,
        };
      }
      if (locationCode === "GALPON") current.stock_galpon = quantity;
      if (locationCode === "LOCAL") current.stock_local = quantity;
    }
    res.json({ ok: true, data: Array.from(grouped.values()) });
  })
);

router.get(
  "/stock-control",
  requireAnyPermission("inventory.view", "inventory.transfer"),
  asyncHandler(async (req, res) => {
    const [state, canManage] = await Promise.all([
      loadStockControlState(),
      userCanManageStockControl(req.user, undefined, req.userPermissions),
    ]);
    res.json({ ok: true, state, canManage });
  })
);

router.post(
  "/stock-control/start",
  requireAnyPermission("inventory.view", "inventory.transfer"),
  asyncHandler(async (req, res) => {
    const parsed = startStockControlSchema.safeParse(req.body || {});
    if (!parsed.success) return validationError(res, parsed);

    const canManage = await userCanManageStockControl(req.user, undefined, req.userPermissions);
    if (!canManage) {
      return res.status(403).json({ ok: false, message: "Sin permisos para iniciar control de stock" });
    }

    const currentState = await loadStockControlState();
    if (currentState.active) {
      return res.status(400).json({ ok: false, message: "Ya hay un control de stock en curso" });
    }

    const first = parsed.data.startLocationCode;
    const second = first === "LOCAL" ? "GALPON" : "LOCAL";
    const nextState = {
      ...buildDefaultState(),
      active: true,
      startedAt: new Date().toISOString(),
      startedByUserId: String(req.user.id || ""),
      startedByName: req.user.full_name || req.user.fullName || req.user.username || "ADMIN",
      startedByRole: req.user.role || "",
      locationOrder: [first, second],
      currentLocationCode: first,
      completedLocations: [],
      counts: { LOCAL: {}, GALPON: {} },
      lastReport: currentState.lastReport || null,
    };

    await saveStockControlState(nextState);
    res.status(201).json({ ok: true, state: nextState });
  })
);

router.put(
  "/stock-control/location",
  requireAnyPermission("inventory.view", "inventory.transfer"),
  asyncHandler(async (req, res) => {
    const parsed = saveLocationCountsSchema.safeParse(req.body || {});
    if (!parsed.success) return validationError(res, parsed);

    const canManage = await userCanManageStockControl(req.user, undefined, req.userPermissions);
    if (!canManage) {
      return res.status(403).json({ ok: false, message: "Sin permisos para editar el control de stock" });
    }

    const state = await loadStockControlState();
    if (!state.active) {
      return res.status(400).json({ ok: false, message: "No hay un control de stock en curso" });
    }

    const { locationCode, counts, stopAfterThis } = parsed.data;
    const normalizedCounts = Object.fromEntries(
      counts.map((row) => [row.productId, Number(row.actualQty || 0)])
    );
    const completedLocations = Array.from(new Set([...(state.completedLocations || []), locationCode]));
    const nextLocation =
      (state.locationOrder || []).find((code) => !completedLocations.includes(code)) || null;
    const nextState = {
      ...state,
      locationOrder: stopAfterThis ? completedLocations : state.locationOrder,
      counts: {
        ...(state.counts || { LOCAL: {}, GALPON: {} }),
        [locationCode]: normalizedCounts,
      },
      completedLocations,
      currentLocationCode: stopAfterThis ? null : nextLocation,
    };

    await saveStockControlState(nextState);
    res.json({
      ok: true,
      state: nextState,
      nextLocationCode: stopAfterThis ? null : nextLocation,
      stoppedAfterThis: stopAfterThis,
    });
  })
);

router.post(
  "/stock-control/finalize",
  requireAnyPermission("inventory.view", "inventory.transfer"),
  asyncHandler(async (req, res) => {
    const canManage = await userCanManageStockControl(req.user, undefined, req.userPermissions);
    if (!canManage) {
      return res.status(403).json({ ok: false, message: "Sin permisos para finalizar el control de stock" });
    }

    const state = await loadStockControlState();
    if (!state.active) {
      return res.status(400).json({ ok: false, message: "No hay un control de stock en curso" });
    }

    const requiredLocations = state.locationOrder || [];
    const pending = requiredLocations.filter(
      (locationCode) => !(state.completedLocations || []).includes(locationCode)
    );
    if (pending.length) {
      return res.status(400).json({
        ok: false,
        message: `Aun falta completar ${pending.join(" y ")}`,
      });
    }

    const { rows } = await pool.query(`
      SELECT
        p.id AS product_id,
        p.name,
        p.sku,
        p.unit_label,
        COALESCE(SUM(CASE WHEN l.code = 'GALPON' THEN b.quantity END),0) AS stock_galpon,
        COALESCE(SUM(CASE WHEN l.code = 'LOCAL' THEN b.quantity END),0) AS stock_local
      FROM products p
      LEFT JOIN inventory_balances b ON b.product_id = p.id
      LEFT JOIN locations l ON l.id = b.location_id
      GROUP BY p.id, p.name, p.sku, p.unit_label
      ORDER BY p.name ASC
    `);

    const reportRows = [];
    for (const product of rows) {
      for (const locationCode of requiredLocations) {
        const expectedQty = Number(
          locationCode === "LOCAL" ? product.stock_local || 0 : product.stock_galpon || 0
        );
        const actualQty = Number(state.counts?.[locationCode]?.[product.product_id] ?? expectedQty);
        const difference = actualQty - expectedQty;
        if (difference === 0) continue;
        const absDifference = Math.abs(difference);
        const unitLabel = String(product.unit_label || "unidades");
        const detail =
          difference > 0
            ? `${product.name} ${absDifference} ${unitLabel.toLowerCase()} de mas`
            : `${product.name} ${absDifference} ${unitLabel.toLowerCase()} menos`;
        reportRows.push({
          locationCode,
          productId: product.product_id,
          productName: product.name,
          code: product.sku || "",
          unitLabel,
          expectedQty,
          actualQty,
          difference,
          description: detail,
        });
      }
    }

    const nextState = {
      ...buildDefaultState(),
      lastReport: {
        generatedAt: new Date().toISOString(),
        generatedByUserId: String(req.user.id || ""),
        generatedByName: req.user.full_name || req.user.fullName || req.user.username || "ADMIN",
        rows: reportRows,
      },
    };

    await saveStockControlState(nextState);
    res.json({ ok: true, report: nextState.lastReport });
  })
);

router.get(
  "/stock-control/report.xlsx",
  requireAnyPermission("inventory.view", "inventory.transfer"),
  asyncHandler(async (_req, res) => {
    const state = await loadStockControlState();
    const reportRows = Array.isArray(state.lastReport?.rows) ? state.lastReport.rows : [];
    const buffer = buildStockControlWorkbook(reportRows);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="control-stock.xlsx"'
    );
    res.send(buffer);
  })
);

async function transferHandler(req, res, payload) {
  const parsed = transferSchema.safeParse(payload || req.body);
  if (!parsed.success) return validationError(res);
  const fromCode = String(parsed.data.fromCode || "").trim().toUpperCase();
  const toCode = String(parsed.data.toCode || "").trim().toUpperCase();
  const { productId, qty } = parsed.data;
  if (fromCode === toCode) {
    return res.status(400).json({ ok: false, message: "fromCode y toCode deben ser diferentes" });
  }

  const transferSettings = await loadTransferPairs();
  const pairAllowed = (transferSettings.pairs || []).some(
    (row) => row.fromCode === fromCode && row.toCode === toCode
  );
  if (!pairAllowed) {
    return res.status(400).json({ ok: false, message: "Esa transferencia no esta permitida" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locations = await getLocationIds(client, [fromCode, toCode]);
    await ensureBalanceRow(client, productId, locations[fromCode]);
    await ensureBalanceRow(client, productId, locations[toCode]);

    const { rows: fromRows } = await client.query(
      `
      UPDATE inventory_balances
      SET quantity = quantity - $1, updated_at = now()
      WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
      RETURNING *
    `,
      [qty, productId, locations[fromCode]]
    );
    if (!fromRows[0]) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ ok: false, message: `Stock insuficiente en ${fromCode}` });
    }

    const { rows: toRows } = await client.query(
      `
      UPDATE inventory_balances
      SET quantity = quantity + $1, updated_at = now()
      WHERE product_id = $2 AND location_id = $3
      RETURNING *
    `,
      [qty, productId, locations[toCode]]
    );

    const movement = await client.query(
      `
      INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, created_by)
      VALUES ($1, $2, $3, $4, 'TRANSFERENCIA', $5)
      RETURNING *
    `,
      [productId, locations[fromCode], locations[toCode], qty, req.user.id]
    );

    await logAudit({
      actorUserId: req.user.id,
      action: "INVENTORY_TRANSFER",
      entity: "inventory_movements",
      entityId: movement.rows[0].id,
      metadata: {
        productId,
        qty,
        fromCode,
        toCode,
        fromAfter: fromRows[0].quantity,
        toAfter: toRows[0].quantity,
      },
      client,
    });

    await client.query("COMMIT");
    await notifyCriticalStockForProductIds([productId]);
    return res.status(201).json({
      ok: true,
      movement: movement.rows[0],
      balances: {
        [fromCode]: fromRows[0].quantity,
        [toCode]: toRows[0].quantity,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

router.post(
  "/transfer",
  requirePermission("inventory.transfer"),
  blockDuringStockControl,
  asyncHandler(async (req, res) => transferHandler(req, res))
);

router.post(
  "/transfer-galpon-local",
  requirePermission("inventory.transfer"),
  blockDuringStockControl,
  asyncHandler(async (req, res) =>
    transferHandler(req, res, {
      productId: req.body?.productId,
      qty: req.body?.qty,
      fromCode: "GALPON",
      toCode: "LOCAL",
    })
  )
);

router.post(
  "/adjust",
  requirePermission("inventory.transfer"),
  blockDuringStockControl,
  asyncHandler(async (req, res) => {
    const parsed = adjustSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res);

    const { productId, qtyDelta, locationCode, reason } = parsed.data;
    const qtyAbs = Math.abs(qtyDelta);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locations = await getLocationIds(client, [locationCode]);
      const locationId = locations[locationCode];
      await ensureBalanceRow(client, productId, locationId);

      let balanceUpdate;
      if (qtyDelta > 0) {
        balanceUpdate = await client.query(
          `
          UPDATE inventory_balances
          SET quantity = quantity + $1, updated_at = now()
          WHERE product_id = $2 AND location_id = $3
          RETURNING *
        `,
          [qtyAbs, productId, locationId]
        );
      } else {
        balanceUpdate = await client.query(
          `
          UPDATE inventory_balances
          SET quantity = quantity - $1, updated_at = now()
          WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
          RETURNING *
        `,
          [qtyAbs, productId, locationId]
        );
        if (!balanceUpdate.rows[0]) {
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ ok: false, message: `Stock insuficiente en ${locationCode} para ajuste negativo` });
        }
      }

      const movement = await client.query(
        `
        INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, created_by)
        VALUES ($1, $2, $3, $4, 'AJUSTE', $5)
        RETURNING *
      `,
        [
          productId,
          qtyDelta < 0 ? locationId : null,
          qtyDelta > 0 ? locationId : null,
          qtyAbs,
          req.user.id,
        ]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "INVENTORY_ADJUST",
        entity: "inventory_movements",
        entityId: movement.rows[0].id,
        metadata: {
          productId,
          qtyDelta,
          locationCode,
          reason,
          balanceAfter: balanceUpdate.rows[0].quantity,
        },
        client,
      });

      await client.query("COMMIT");
      await notifyCriticalStockForProductIds([productId]);
      return res.status(201).json({
        ok: true,
        movement: movement.rows[0],
        balance: balanceUpdate.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
