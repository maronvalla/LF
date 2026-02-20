const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { buildSaleNumber, proposeShift } = require("../utils/sales");
const { logAudit } = require("../services/audit");

const router = express.Router();

const createSaleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  sellerId: z.string().uuid().nullable().optional(),
  vendedorId: z.string().uuid().nullable().optional(),
  saleType: z.enum(["MOSTRADOR", "ENVIO"]),
  isDelivery: z.boolean().optional(),
  shift: z.enum(["MANIANA", "TARDE"]).nullable().optional(),
  deliverySlot: z.enum(["11", "19"]).nullable().optional(),
  scheduledDate: z.string().date().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentCondition: z
    .enum(["PAGADO_LOCAL", "TRANSFER_PREVIA", "COBRAR_EN_ENTREGA", "PAGO_LOCAL_TRANSFERENCIA"])
    .nullable()
    .optional(),
  deliveryPayment: z
    .enum(["PAGADO_LOCAL", "TRANSFER_PREVIA", "COBRAR_EN_ENTREGA", "PAGO_LOCAL_TRANSFERENCIA"])
    .nullable()
    .optional(),
  deliveryPaymentMethod: z.enum(["EFECTIVO", "TRANSFERENCIA", "MIXTO"]).nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().int().positive(),
        unitPrice: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

async function getLocalId(client) {
  const { rows } = await client.query("SELECT id FROM locations WHERE code = 'LOCAL' LIMIT 1");
  if (!rows[0]) throw new Error("Location LOCAL no inicializada");
  return rows[0].id;
}

async function ensureBalance(client, productId, locationId) {
  await client.query(
    `
      INSERT INTO inventory_balances(product_id, location_id, quantity)
      VALUES ($1, $2, 0)
      ON CONFLICT (product_id, location_id) DO NOTHING
    `,
    [productId, locationId]
  );
}

router.get(
  "/",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    const params = [];
    let where = "";
    if (status) {
      params.push(status);
      where = "WHERE s.status = $1";
    }
    const { rows } = await pool.query(
      `
      SELECT s.*, c.name AS customer_name, u.full_name AS created_by_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.created_by
      ${where}
      ORDER BY s.created_at DESC
      LIMIT 200
    `,
      params
    );
    res.json(rows);
  })
);

router.post(
  "/",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Datos invalidos" });
    const data = parsed.data;
    const isDelivery = data.isDelivery ?? data.saleType === "ENVIO";
    const saleType = isDelivery ? "ENVIO" : data.saleType;
    const shiftFromSlot = data.deliverySlot === "11" ? "MANIANA" : data.deliverySlot === "19" ? "TARDE" : null;
    const shift = isDelivery ? shiftFromSlot || data.shift || proposeShift(new Date()) : data.shift || null;
    const deliverySlot = shift === "MANIANA" ? "11" : shift === "TARDE" ? "19" : null;
    const deliveryPayment = data.deliveryPayment || data.paymentCondition || null;
    const deliveryPaymentMethod =
      data.deliveryPaymentMethod ||
      (deliveryPayment === "PAGO_LOCAL_TRANSFERENCIA" ? "TRANSFERENCIA" : null);
    const scheduledDate = data.scheduledDate || new Date().toISOString().slice(0, 10);
    const sellerId = data.vendedorId || data.sellerId || req.user.id;
    const saleNumber = buildSaleNumber();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sale = await client.query(
        `
        INSERT INTO sales(
          sale_number, customer_id, sale_type, shift, scheduled_date, status, 
          payment_method, payment_condition, delivery_address, notes, created_by,
          is_delivery, delivery_slot, delivery_payment, delivery_payment_method, delivery_status
        )
        VALUES ($1,$2,$3,$4,$5,'PENDIENTE',$6,$7,$8,$9,$10,$11,$12,$13,$14,'PENDIENTE')
        RETURNING *
      `,
        [
          saleNumber,
          data.customerId || null,
          saleType,
          shift,
          scheduledDate,
          data.paymentMethod || null,
          data.paymentCondition || null,
          data.deliveryAddress || null,
          data.notes || null,
          sellerId,
          isDelivery,
          deliverySlot,
          deliveryPayment,
          deliveryPaymentMethod,
        ]
      );
      for (const item of data.items) {
        const lineTotal = item.qty * item.unitPrice;
        await client.query(
          `
          INSERT INTO sale_items(sale_id, product_id, qty, unit_price, line_total)
          VALUES($1,$2,$3,$4,$5)
        `,
          [sale.rows[0].id, item.productId, item.qty, item.unitPrice, lineTotal]
        );
      }
      await logAudit({
        actorUserId: req.user.id,
        action: "SALE_CREATE",
        entity: "sales",
        entityId: sale.rows[0].id,
        metadata: { after: sale.rows[0], items: data.items },
        client,
      });
      await client.query("COMMIT");
      res.status(201).json(sale.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/:id/prepare",
  requirePermission("sales.prepare"),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saleRes = await client.query("SELECT * FROM sales WHERE id = $1 FOR UPDATE", [req.params.id]);
      const sale = saleRes.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Venta no encontrada" });
      }
      if (sale.status !== "PENDIENTE") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Solo ventas PENDIENTE pueden prepararse" });
      }
      const itemsRes = await client.query("SELECT * FROM sale_items WHERE sale_id = $1", [sale.id]);
      const localId = await getLocalId(client);

      for (const item of itemsRes.rows) {
        await ensureBalance(client, item.product_id, localId);
        const moved = await client.query(
          `
          UPDATE inventory_balances
          SET quantity = quantity - $1, updated_at = now()
          WHERE product_id = $2 AND location_id = $3 AND quantity >= $1
          RETURNING *
        `,
          [item.qty, item.product_id, localId]
        );
        if (!moved.rows[0]) {
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ message: `Stock insuficiente en LOCAL para producto ${item.product_id}` });
        }
        await client.query(
          `
          INSERT INTO inventory_movements(product_id, from_location_id, to_location_id, qty, reason, ref_type, ref_id, created_by)
          VALUES ($1, $2, NULL, $3, 'SALE_PREPARADO', 'sale', $4, $5)
        `,
          [item.product_id, localId, item.qty, sale.id, req.user.id]
        );
      }

      const updated = await client.query(
        "UPDATE sales SET status = 'PREPARADO', updated_at = now() WHERE id = $1 RETURNING *",
        [sale.id]
      );
      await logAudit({
        actorUserId: req.user.id,
        action: "SALE_PREPARED",
        entity: "sales",
        entityId: sale.id,
        metadata: { before: sale, after: updated.rows[0] },
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
  "/:id/anular",
  requirePermission("sales.manage"),
  asyncHandler(async (req, res) => {
    const parsed = cancelSaleSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Debe indicar un motivo de anulacion (minimo 3 caracteres)" });
    }
    const before = await pool.query("SELECT * FROM sales WHERE id = $1", [req.params.id]);
    if (!before.rows[0]) return res.status(404).json({ message: "Venta no encontrada" });
    const updated = await pool.query(
      "UPDATE sales SET status='ANULADO', updated_at=now() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    await logAudit({
      actorUserId: req.user.id,
      action: "SALE_CANCEL",
      entity: "sales",
      entityId: req.params.id,
      metadata: { before: before.rows[0], after: updated.rows[0], reason: parsed.data.reason },
    });
    res.json({ ...updated.rows[0], cancel_reason: parsed.data.reason });
  })
);

module.exports = router;
