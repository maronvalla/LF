const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const transferSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().positive(),
  fromCode: z.enum(["GALPON", "LOCAL"]),
  toCode: z.enum(["GALPON", "LOCAL"]),
});

const adjustSchema = z.object({
  productId: z.string().uuid(),
  qtyDelta: z.number().int().refine((v) => v !== 0, "qtyDelta no puede ser 0"),
  locationCode: z.enum(["GALPON", "LOCAL"]),
  reason: z.enum(["AJUSTE_INICIAL", "AJUSTE"]),
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

function validationError(res) {
  return res.status(400).json({ ok: false, message: "Datos invalidos" });
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
        COALESCE(SUM(CASE WHEN l.code = 'GALPON' THEN b.quantity END),0) AS stock_galpon,
        COALESCE(SUM(CASE WHEN l.code = 'LOCAL' THEN b.quantity END),0) AS stock_local
      FROM products p
      LEFT JOIN inventory_balances b ON b.product_id = p.id
      LEFT JOIN locations l ON l.id = b.location_id
      GROUP BY p.id, p.name, p.sku
      ORDER BY p.name ASC
    `);
    res.json({ ok: true, data: rows });
  })
);

async function transferHandler(req, res, payload) {
  const parsed = transferSchema.safeParse(payload || req.body);
  if (!parsed.success) return validationError(res);
  const { productId, qty, fromCode, toCode } = parsed.data;
  if (fromCode === toCode) {
    return res.status(400).json({ ok: false, message: "fromCode y toCode deben ser diferentes" });
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
  asyncHandler(async (req, res) => transferHandler(req, res))
);

router.post(
  "/transfer-galpon-local",
  requirePermission("inventory.transfer"),
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
