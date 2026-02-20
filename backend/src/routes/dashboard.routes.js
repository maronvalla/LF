const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get(
  "/summary",
  requirePermission("dashboard.view"),
  asyncHandler(async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const totals = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_sales,
        COALESCE(SUM(si.line_total),0)::int AS total_amount
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.scheduled_date = $1 AND s.status <> 'ANULADO'
    `,
      [today]
    );
    res.json({ date: today, ...totals.rows[0] });
  })
);

module.exports = router;

