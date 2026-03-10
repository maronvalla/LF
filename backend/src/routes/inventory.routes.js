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
const {
  EPSILON_QTY,
  consumeFifoLayers,
  createInboundLayer,
  ensureBalanceRow: ensureFifoBalanceRow,
  getProductCost,
  transferFifoLayers,
} = require("../services/inventory-fifo");

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

const expireSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  locationCode: z.string().trim().min(2).max(60),
  expirationDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
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
  return ensureFifoBalanceRow(client, productId, locationId);
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const locations = await getLocationIds(client, requiredLocations);
      const { rows } = await client.query(
        `
          SELECT
            p.id AS product_id,
            p.name,
            p.sku,
            p.unit_label,
            l.code AS location_code,
            COALESCE(b.quantity, 0) AS quantity
          FROM products p
          CROSS JOIN (
            SELECT id, code
            FROM locations
            WHERE code = ANY($1::text[])
          ) l
          LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.location_id = l.id
          ORDER BY p.name ASC, l.code ASC
          FOR UPDATE OF b
        `,
        [requiredLocations]
      );

      const productMap = new Map();
      for (const row of rows) {
        const key = String(row.product_id);
        const current = productMap.get(key) || {
          product_id: row.product_id,
          name: row.name,
          sku: row.sku,
          unit_label: row.unit_label,
          stocks: {},
        };
        current.stocks[String(row.location_code || "").toUpperCase()] = Number(row.quantity || 0);
        productMap.set(key, current);
      }

      const reportRows = [];
      const affectedProductIds = new Set();

      for (const product of productMap.values()) {
        for (const locationCode of requiredLocations) {
          const expectedQty = Number(product.stocks?.[locationCode] || 0);
          const actualQty = Number(state.counts?.[locationCode]?.[product.product_id] ?? expectedQty);
          const difference = actualQty - expectedQty;
          if (difference === 0) continue;

          const absDifference = Math.abs(difference);
          const unitLabel = String(product.unit_label || "unidades");
          const detail =
            difference > 0
              ? `${product.name} ${absDifference} ${unitLabel.toLowerCase()} de mas`
              : `${product.name} ${absDifference} ${unitLabel.toLowerCase()} menos`;

          const locationId = locations[locationCode];
          await ensureBalanceRow(client, product.product_id, locationId);

          const movement = await client.query(
            `
              INSERT INTO inventory_movements(
                product_id,
                from_location_id,
                to_location_id,
                qty,
                reason,
                ref_type,
                created_by
              )
              VALUES ($1, $2, $3, $4, 'CONTROL_STOCK_AJUSTE', 'stock_control', $5)
              RETURNING *
            `,
            [
              product.product_id,
              difference < 0 ? locationId : null,
              difference > 0 ? locationId : null,
              absDifference,
              req.user.id,
            ]
          );

          let balanceUpdate;
          if (difference > 0) {
            balanceUpdate = await client.query(
              `
                UPDATE inventory_balances
                SET quantity = quantity + $1, updated_at = now()
                WHERE product_id = $2 AND location_id = $3
                RETURNING *
              `,
              [absDifference, product.product_id, locationId]
            );
            const productCost = await getProductCost(client, product.product_id);
            await createInboundLayer(client, {
              productId: product.product_id,
              locationId,
              qty: absDifference,
              unitCost: productCost,
              sourceType: "CONTROL_STOCK_AJUSTE",
              sourceId: movement.rows[0].id,
              receivedAt: new Date().toISOString(),
              notes: `Ajuste positivo por control de stock en ${locationCode}`,
              createdBy: req.user.id,
            });
          } else {
            balanceUpdate = await client.query(
              `
                UPDATE inventory_balances
                SET quantity = quantity - $1, updated_at = now()
                WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
                RETURNING *
              `,
              [absDifference, product.product_id, locationId]
            );
            if (!balanceUpdate.rows[0]) {
              throw new Error(`Stock insuficiente en ${locationCode} para aplicar el control final`);
            }
            await consumeFifoLayers(client, {
              productId: product.product_id,
              locationId,
              qty: absDifference,
              movementReason: "CONTROL_STOCK_AJUSTE",
              refType: "inventory_movement",
              refId: movement.rows[0].id,
              createdBy: req.user.id,
            });
          }

          await logAudit({
            actorUserId: req.user.id,
            action: "INVENTORY_STOCK_CONTROL_ADJUST",
            entity: "inventory_movements",
            entityId: movement.rows[0].id,
            metadata: {
              locationCode,
              productId: product.product_id,
              expectedQty,
              actualQty,
              difference,
              balanceAfter: balanceUpdate.rows[0]?.quantity,
            },
            client,
          });

          affectedProductIds.add(String(product.product_id));
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

      await saveStockControlState(nextState, client);
      await client.query("COMMIT");
      if (affectedProductIds.size) {
        await notifyCriticalStockForProductIds(Array.from(affectedProductIds));
      }
      res.json({ ok: true, report: nextState.lastReport });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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

    await transferFifoLayers(client, {
      productId,
      fromLocationId: locations[fromCode],
      toLocationId: locations[toCode],
      qty,
      refType: "inventory_movement",
      refId: movement.rows[0].id,
      createdBy: req.user.id,
    });

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
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
        [
          productId,
          qtyDelta < 0 ? locationId : null,
          qtyDelta > 0 ? locationId : null,
          qtyAbs,
          reason,
          req.user.id,
        ]
      );

      if (qtyDelta > 0) {
        const productCost = await getProductCost(client, productId);
        await createInboundLayer(client, {
          productId,
          locationId,
          qty: qtyAbs,
          unitCost: productCost,
          sourceType: reason,
          sourceId: movement.rows[0].id,
          receivedAt: new Date().toISOString(),
          notes: `Ajuste positivo en ${locationCode}`,
          createdBy: req.user.id,
        });
      } else {
        await consumeFifoLayers(client, {
          productId,
          locationId,
          qty: qtyAbs,
          movementReason: reason,
          refType: "inventory_movement",
          refId: movement.rows[0].id,
          createdBy: req.user.id,
        });
      }

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

router.post(
  "/expired",
  requirePermission("inventory.transfer"),
  blockDuringStockControl,
  asyncHandler(async (req, res) => {
    if (String(req.user?.role || "").toUpperCase() !== "ADMIN") {
      return res.status(403).json({ ok: false, message: "Solo ADMIN puede registrar productos vencidos" });
    }

    const parsed = expireSchema.safeParse(req.body || {});
    if (!parsed.success) return validationError(res, parsed);

    const { productId, qty, locationCode, expirationDate, notes } = parsed.data;
    const normalizedLocationCode = String(locationCode || "").trim().toUpperCase();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locations = await getLocationIds(client, [normalizedLocationCode]);
      const locationId = locations[normalizedLocationCode];
      await ensureBalanceRow(client, productId, locationId);

      const balanceUpdate = await client.query(
        `
          UPDATE inventory_balances
          SET quantity = quantity - $1, updated_at = now()
          WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
          RETURNING *
        `,
        [qty, productId, locationId]
      );
      if (!balanceUpdate.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          message: `Stock insuficiente en ${normalizedLocationCode} para registrar vencimiento`,
        });
      }

      const movement = await client.query(
        `
          INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, created_by)
          VALUES ($1, $2, NULL, $3, 'VENCIMIENTO', $4)
          RETURNING *
        `,
        [productId, locationId, qty, req.user.id]
      );

      const fifoResult = await consumeFifoLayers(client, {
        productId,
        locationId,
        qty,
        movementReason: "VENCIMIENTO",
        refType: "inventory_movement",
        refId: movement.rows[0].id,
        createdBy: req.user.id,
      });

      const expiredItem = await client.query(
        `
          INSERT INTO inventory_expired_items(
            product_id,
            location_id,
            movement_id,
            qty,
            total_cost,
            expiration_date,
            notes,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          productId,
          locationId,
          movement.rows[0].id,
          qty,
          Number(fifoResult.totalCost || 0),
          expirationDate || null,
          notes || null,
          req.user.id,
        ]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "INVENTORY_EXPIRED_REGISTER",
        entity: "inventory_expired_items",
        entityId: expiredItem.rows[0].id,
        metadata: {
          productId,
          qty,
          locationCode: normalizedLocationCode,
          expirationDate: expirationDate || null,
          notes: notes || null,
          balanceAfter: balanceUpdate.rows[0].quantity,
          totalCost: Number(fifoResult.totalCost || 0),
        },
        client,
      });

      await client.query("COMMIT");
      await notifyCriticalStockForProductIds([productId]);
      return res.status(201).json({
        ok: true,
        movement: movement.rows[0],
        expiredItem: expiredItem.rows[0],
        balance: balanceUpdate.rows[0],
        fifoCost: Number(fifoResult.totalCost || 0),
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
