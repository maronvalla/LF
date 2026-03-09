const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

const dashboardSummaryHandler = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(`
    WITH today_ref AS (
      SELECT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS local_today
    ),
    today_sales AS (
      SELECT
        s.id,
        COALESCE(SUM(si.line_total), 0)::numeric AS total_amount,
        COALESCE(NULLIF(TRIM(UPPER(s.payment_method)), ''), '') AS payment_method,
        COALESCE(NULLIF(TRIM(UPPER(s.sale_type)), ''), 'MOSTRADOR') AS sale_type
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.status <> 'ANULADO'
        AND s.payment_method IS NOT NULL
        AND COALESCE(s.charged_at, s.created_at)::date = (SELECT local_today FROM today_ref)
      GROUP BY
        s.id,
        COALESCE(NULLIF(TRIM(UPPER(s.payment_method)), ''), ''),
        COALESCE(NULLIF(TRIM(UPPER(s.sale_type)), ''), 'MOSTRADOR')
    ),
    today_cash_sales AS (
      SELECT
        COALESCE(SUM(
          CASE
            WHEN payment_method = 'EFECTIVO' THEN total_amount
            WHEN payment_method = 'MIXTO' THEN total_amount * 0.5
            ELSE 0
          END
        ), 0)::numeric AS cash_total
      FROM today_sales
      WHERE sale_type = 'MOSTRADOR'
    ),
    today_pending_deliveries AS (
      SELECT COUNT(*)::int AS total
      FROM sales s
      WHERE s.status <> 'ANULADO'
        AND (s.is_delivery = true OR s.sale_type = 'ENVIO')
        AND s.scheduled_date = (SELECT local_today FROM today_ref)
        AND COALESCE(NULLIF(TRIM(UPPER(s.delivery_status)), ''), 'PENDIENTE')
          NOT IN ('ENTREGADO', 'RECHAZADO', 'NO_ESTABA')
    ),
    today_cash_session AS (
      SELECT *
      FROM cash_register_sessions
      WHERE date = (SELECT local_today FROM today_ref)
      ORDER BY CASE WHEN status = 'ABIERTA' THEN 0 ELSE 1 END, opened_at DESC
      LIMIT 1
    ),
    today_cash_movements AS (
      SELECT
        COALESCE(SUM(
          CASE
            WHEN movement_type IN ('RETIRO', 'PAGO_DEUDA', 'PAGO_PROVEEDOR') THEN amount
            ELSE 0
          END
        ), 0)::numeric AS total_out,
        COALESCE(SUM(
          CASE
            WHEN movement_type = 'INGRESO' THEN amount
            ELSE 0
          END
        ), 0)::numeric AS total_in
      FROM cash_register_movements
      WHERE session_id = (SELECT id FROM today_cash_session)
    )
    SELECT
      TO_CHAR((SELECT local_today FROM today_ref), 'YYYY-MM-DD') AS date,
      COALESCE((SELECT SUM(total_amount) FROM today_sales), 0)::numeric AS total_sales,
      COALESCE((SELECT COUNT(*) FROM today_sales), 0)::int AS total_orders,
      COALESCE((SELECT total FROM today_pending_deliveries), 0)::int AS pending_deliveries,
      COALESCE(
        CASE
          WHEN (SELECT id FROM today_cash_session) IS NULL THEN
            (SELECT cash_total FROM today_cash_sales)
          WHEN (SELECT status FROM today_cash_session) = 'CERRADA' THEN
            COALESCE(
              (SELECT closing_total FROM today_cash_session),
              (SELECT expected_amount FROM today_cash_session),
              0
            )
          ELSE
            COALESCE((SELECT opening_amount FROM today_cash_session), 0)
            + COALESCE((SELECT total_in FROM today_cash_movements), 0)
            - COALESCE((SELECT total_out FROM today_cash_movements), 0)
            + COALESCE((SELECT cash_total FROM today_cash_sales), 0)
            + CASE
              WHEN COALESCE((SELECT consolidated_included FROM today_cash_session), false)
                THEN COALESCE((SELECT consolidated_amount FROM today_cash_session), 0)
              ELSE 0
            END
        END,
        0
      )::numeric AS cash_amount
  `);

  const summary = rows[0] || {};
  const totalSales = Number(summary.total_sales || 0);
  const cashAmount = Number(summary.cash_amount || 0);
  const totalOrders = Number(summary.total_orders || 0);
  const pendingDeliveries = Number(summary.pending_deliveries || 0);

  res.json({
    date: summary.date || null,
    total_sales: totalSales,
    total_amount: totalSales,
    total_orders: totalOrders,
    pending_deliveries: pendingDeliveries,
    cash_amount: cashAmount,
    cash_in_box: cashAmount,
  });
});

router.get("/", requirePermission("dashboard.view"), dashboardSummaryHandler);
router.get("/summary", requirePermission("dashboard.view"), dashboardSummaryHandler);

module.exports = router;
