const { pool } = require("../../db");
const { requirePermission } = require("../../middleware/rbac");
const { asyncHandler } = require("../../utils/async-handler");
const { canChargeSales } = require("./utils");
const { getSaleWithItems } = require("./service");

function registerSalesQueryRoutes(router) {
  router.get(
    "/",
    requirePermission("sales.manage"),
    asyncHandler(async (req, res) => {
      const status = String(req.query.status || "").trim();
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      const seller = String(req.query.seller || "").trim();
      const customer = String(req.query.customer || "").trim();
      const params = [];
      const whereClauses = [];

      if (status) {
        params.push(status);
        whereClauses.push(`s.status = $${params.length}`);
      }
      if (from) {
        params.push(from);
        whereClauses.push(`s.created_at::date >= $${params.length}::date`);
      }
      if (to) {
        params.push(to);
        whereClauses.push(`s.created_at::date <= $${params.length}::date`);
      }
      if (seller) {
        params.push(seller);
        whereClauses.push(`s.created_by = $${params.length}::uuid`);
      }
      if (customer) {
        params.push(`%${customer}%`);
        whereClauses.push(`COALESCE(c.name, '') ILIKE $${params.length}`);
      }
      const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const { rows } = await pool.query(
        `
        SELECT
          s.*,
          COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
          COALESCE(NULLIF(TRIM(s.seller_name_snapshot), ''), u.full_name, u.username) AS created_by_name,
          u.username AS created_by_username,
          EXISTS(
            SELECT 1
            FROM delivery_consolidated_controls dcc
            WHERE dcc.control_date = s.scheduled_date
              AND dcc.slot = s.delivery_slot
          ) AS has_approved_consolidated_control,
          COALESCE(SUM(si.line_total), 0)::numeric AS total_amount
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN users u ON u.id = s.created_by
        LEFT JOIN sale_items si ON si.sale_id = s.id
        ${where}
        GROUP BY s.id, c.name, u.full_name, u.username
        ORDER BY s.created_at DESC
        LIMIT 500
      `,
        params
      );
      res.json(rows);
    })
  );

  router.get(
    "/my-orders-today",
    requirePermission("sales.manage"),
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `
        SELECT
          s.id,
          s.sale_number,
          s.created_at,
          s.status,
          s.sale_type,
          COALESCE(NULLIF(TRIM(s.seller_name_snapshot), ''), creator.full_name, creator.username, 'N/A') AS seller_name,
          COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
          COALESCE(SUM(si.line_total), 0)::numeric AS total_amount
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN users creator ON creator.id = s.created_by
        LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.created_by = $1
          AND s.sale_type = 'MOSTRADOR'
          AND COALESCE(s.is_delivery, false) = false
          AND s.created_at::date = CURRENT_DATE
          AND s.status = 'PENDIENTE'
          AND s.payment_method IS NULL
        GROUP BY s.id, c.name, creator.full_name, creator.username
        ORDER BY s.created_at DESC
      `,
        [req.user.id]
      );
      res.json(rows);
    })
  );

  router.get(
    "/pending-orders",
    requirePermission("sales.manage"),
    asyncHandler(async (req, res) => {
      if (!canChargeSales(req.user)) {
        return res.json([]);
      }

      const { rows } = await pool.query(
        `
        SELECT
          s.id,
          s.sale_number,
          s.created_at,
          s.sale_type,
          s.payment_condition,
          s.delivery_payment,
          s.delivery_payment_method,
          s.delivery_payment_configured_at,
          s.customer_id,
          COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
          COALESCE(SUM(si.line_total), 0)::numeric AS total_amount,
          COALESCE(SUM(si.qty), 0)::int AS total_items,
          COALESCE(NULLIF(TRIM(s.seller_name_snapshot), ''), creator.full_name, creator.username) AS created_by_name,
          creator.username AS created_by_username,
          CASE
            WHEN s.sale_type = 'ENVIO' AND COALESCE(UPPER(s.delivery_payment), '') = 'PAGO_PARCIAL'
              THEN 'CONFIGURAR_PAGO_PARCIAL'
            ELSE 'COBRAR_ORDEN'
          END AS pending_action
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN users creator ON creator.id = s.created_by
        LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE (
            (
              s.sale_type = 'MOSTRADOR'
              AND s.status = 'PENDIENTE'
              AND s.payment_method IS NULL
            )
            OR (
              (COALESCE(s.is_delivery, false) = true OR s.sale_type = 'ENVIO')
              AND s.status <> 'ANULADO'
              AND COALESCE(UPPER(s.delivery_payment), '') = 'PAGO_PARCIAL'
              AND s.delivery_payment_configured_at IS NULL
              AND COALESCE(NULLIF(TRIM(UPPER(s.delivery_status)), ''), 'PENDIENTE') NOT IN ('ENTREGADO', 'RECHAZADO', 'NO_ESTABA')
            )
          )
        GROUP BY s.id, c.name, creator.full_name, creator.username
        ORDER BY s.created_at ASC
      `
      );
      res.json(rows);
    })
  );

  router.get(
    "/:id",
    requirePermission("sales.manage"),
    asyncHandler(async (req, res) => {
      const client = await pool.connect();
      try {
        const sale = await getSaleWithItems(client, req.params.id);
        if (!sale) {
          return res.status(404).json({ message: "Venta no encontrada" });
        }
        res.json(sale);
      } finally {
        client.release();
      }
    })
  );
}

module.exports = registerSalesQueryRoutes;
