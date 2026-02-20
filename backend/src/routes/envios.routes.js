const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");
const { logAudit } = require("../services/audit");

const router = express.Router();

const CONSOLIDATED_SQL = `
  WITH scoped_sales AS (
    SELECT s.id
    FROM sales s
    WHERE s.is_delivery = true
      AND s.status <> 'ANULADO'
      AND s.scheduled_date = $1::date
      AND s.delivery_slot = $2
  ),
  sales_count AS (
    SELECT COUNT(*)::int AS total FROM scoped_sales
  ),
  consolidated AS (
    SELECT
      COALESCE(p.default_pick_location, 'GALPON') AS pick_location,
      si.product_id,
      p.sku,
      p.name,
      p.unit_label AS unidad,
      SUM(si.qty)::int AS qty_total
    FROM scoped_sales ss
    JOIN sale_items si ON si.sale_id = ss.id
    JOIN products p ON p.id = si.product_id
    GROUP BY COALESCE(p.default_pick_location, 'GALPON'), si.product_id, p.sku, p.name, p.unit_label
  )
  SELECT
    c.pick_location,
    c.product_id,
    c.sku,
    c.name,
    c.unidad,
    c.qty_total,
    sc.total AS ventas_envio
  FROM consolidated c
  CROSS JOIN sales_count sc
  ORDER BY c.pick_location, c.name ASC;
`;

const updateEstadoSchema = z.object({
  estado: z.enum(["ENTREGADO", "RECHAZADO", "NO_ESTABA"]),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

router.get(
  "/consolidado/:salida",
  requirePermission("deliveries.manage"),
  asyncHandler(async (req, res, next) => {
    try {
      const salidaRaw = String(req.params.salida || "").trim();
      const salida = salidaRaw === "11:00" || salidaRaw === "11" ? "11" : salidaRaw === "19:00" || salidaRaw === "19" ? "19" : null;
      if (!salida) {
        return res.status(400).json({ message: "Salida invalida. Use 11:00 o 19:00" });
      }

      const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
      const { rows } = await pool.query(CONSOLIDATED_SQL, [fecha, salida]);

      const items_local = [];
      const items_galpon = [];
      let ventas_envio = 0;

      for (const row of rows) {
        ventas_envio = row.ventas_envio || 0;
        const item = {
          product_id: row.product_id,
          sku: row.sku,
          name: row.name,
          qty_total: row.qty_total,
          unidad: row.unidad,
        };
        if (row.pick_location === "LOCAL") {
          items_local.push(item);
        } else {
          items_galpon.push(item);
        }
      }

      res.json({
        salida: salida === "11" ? "11:00" : "19:00",
        fecha,
        ventas_envio,
        items_local,
        items_galpon,
      });
    } catch (err) {
      next(err);
    }
  })
);

router.patch(
  "/:sale_id/estado",
  requirePermission("deliveries.track"),
  asyncHandler(async (req, res) => {
    const parsed = updateEstadoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        message: "Body invalido. Requiere estado (ENTREGADO|RECHAZADO|NO_ESTABA), lat y lng",
      });
    }

    const { estado, lat, lng } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        "SELECT * FROM sales WHERE id = $1 AND is_delivery = true FOR UPDATE",
        [req.params.sale_id]
      );
      const sale = found.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Venta de envio no encontrada" });
      }
      if (sale.status === "ANULADO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No se puede actualizar una venta anulada" });
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
        [req.params.sale_id, estado, lat, lng, req.user.id]
      );

      await client.query(
        `
          INSERT INTO delivery_tracking(sale_id, user_id, event_type, estado, latitude, longitude, payload)
          VALUES ($1, $2, 'ESTADO', $3, $4, $5, $6::jsonb)
        `,
        [
          req.params.sale_id,
          req.user.id,
          estado,
          lat,
          lng,
          JSON.stringify({
            source: "driver_app",
            sale_number: updated.rows[0].sale_number,
          }),
        ]
      );

      await logAudit({
        actorUserId: req.user.id,
        action: "DELIVERY_STATUS_UPDATE",
        entity: "sales",
        entityId: req.params.sale_id,
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
      return res.json({
        ok: true,
        sale_id: updated.rows[0].id,
        estado: updated.rows[0].delivery_status,
        lat: updated.rows[0].delivery_status_lat,
        lng: updated.rows[0].delivery_status_lng,
        updated_at: updated.rows[0].delivery_status_updated_at,
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
