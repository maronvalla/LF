const { pool } = require("../../db");
const { requireAnyPermission } = require("../../middleware/rbac");
const { asyncHandler } = require("../../utils/async-handler");
const { logAudit } = require("../../services/audit");
const {
  buildDefaultState,
  loadStockControlState,
  saveStockControlState,
  userCanManageStockControl,
} = require("../../services/stock-control");
const { notifyCriticalStockForProductIds } = require("../../services/telegram-alerts");
const {
  consumeFifoLayers,
  createInboundLayer,
  getProductCost,
} = require("../../services/inventory-fifo");
const {
  startStockControlSchema,
  saveLocationCountsSchema,
} = require("./schemas");
const {
  ensureBalanceRow,
  getLocationIds,
  validationError,
} = require("./helpers");

function registerInventoryStockControlRoutes(router) {
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
        await client.query(
          `
            INSERT INTO inventory_balances(product_id, location_id, quantity)
            SELECT p.id, l.id, 0
            FROM products p
            CROSS JOIN (
              SELECT id
              FROM locations
              WHERE code = ANY($1::text[])
            ) l
            ON CONFLICT (product_id, location_id) DO NOTHING
          `,
          [requiredLocations]
        );
        const { rows } = await client.query(
          `
            SELECT
              p.id AS product_id,
              p.name,
              p.sku,
              p.unit_label,
              l.code AS location_code,
              b.quantity
            FROM products p
            CROSS JOIN (
              SELECT id, code
              FROM locations
              WHERE code = ANY($1::text[])
            ) l
            JOIN inventory_balances b ON b.product_id = p.id AND b.location_id = l.id
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
}

module.exports = {
  registerInventoryStockControlRoutes,
};
