const { pool } = require("../../db");
const { requirePermission } = require("../../middleware/rbac");
const { blockDuringStockControl } = require("../../middleware/stock-control");
const { asyncHandler } = require("../../utils/async-handler");
const { logAudit } = require("../../services/audit");
const { loadTransferPairs } = require("../../services/inventory-transfer-settings");
const { notifyCriticalStockForProductIds } = require("../../services/telegram-alerts");
const {
  consumeFifoLayers,
  createInboundLayer,
  getProductCost,
  transferFifoLayers,
} = require("../../services/inventory-fifo");
const {
  transferSchema,
  adjustSchema,
  expireSchema,
} = require("./schemas");
const {
  ensureBalanceRow,
  getLocationIds,
  validationError,
} = require("./helpers");

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
      return res.status(400).json({ ok: false, message: `Stock insuficiente en ${fromCode}` });
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

function registerInventoryMutationRoutes(router) {
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
}

module.exports = {
  registerInventoryMutationRoutes,
};
