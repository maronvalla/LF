const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

const filtersSchema = z.object({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  rubroId: z.string().uuid().optional(),
});

function toInt(value) {
  return Number(value || 0);
}

function buildProductFilterClauses(parsedFilters) {
  const params = [];
  const clauses = [];

  if (parsedFilters.categoryId) {
    params.push(parsedFilters.categoryId);
    clauses.push(`p.category_id = $${params.length}::uuid`);
  }
  if (parsedFilters.brandId) {
    params.push(parsedFilters.brandId);
    clauses.push(`p.brand_id = $${params.length}::uuid`);
  }
  if (parsedFilters.rubroId) {
    params.push(parsedFilters.rubroId);
    clauses.push(`p.rubro_id = $${params.length}::uuid`);
  }

  return { params, whereSql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "" };
}

function buildDateParams(dateFrom, dateTo, startIndex = 1, column = "COALESCE(s.charged_at, s.created_at)::date") {
  const params = [];
  const clauses = [];
  if (dateFrom) {
    params.push(dateFrom);
    clauses.push(`${column} >= $${startIndex + params.length - 1}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    clauses.push(`${column} <= $${startIndex + params.length - 1}::date`);
  }
  return { params, whereSql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "" };
}

router.get(
  "/overview",
  requirePermission("reports.view"),
  asyncHandler(async (req, res) => {
    const parsed = filtersSchema.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Filtros invalidos" });
    }

    const filters = parsed.data;
    const salesBaseWhere = `
      WHERE s.status <> 'ANULADO'
        AND s.payment_method IS NOT NULL
    `;

    const monthlySalesPromise = pool.query(
      `
        SELECT
          TO_CHAR(DATE_TRUNC('month', COALESCE(s.charged_at, s.created_at)), 'YYYY-MM') AS month_key,
          TO_CHAR(DATE_TRUNC('month', COALESCE(s.charged_at, s.created_at)), 'MM/YYYY') AS month_label,
          COUNT(DISTINCT s.id)::int AS sales_count,
          COALESCE(SUM(si.line_total), 0)::int AS sales_amount
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        ${salesBaseWhere}
        GROUP BY 1, 2
        ORDER BY month_key DESC
        LIMIT 12
      `
    );

    const monthlyBudgetsPromise = pool.query(
      `
        SELECT
          TO_CHAR(DATE_TRUNC('month', b.created_at), 'YYYY-MM') AS month_key,
          TO_CHAR(DATE_TRUNC('month', b.created_at), 'MM/YYYY') AS month_label,
          COUNT(DISTINCT b.id)::int AS budgets_count,
          COALESCE(SUM(b.total_amount), 0)::int AS budgets_amount
        FROM budgets b
        GROUP BY 1, 2
        ORDER BY month_key DESC
        LIMIT 12
      `
    );

    const productFilters = buildProductFilterClauses(filters);
    const productDate = buildDateParams(filters.dateFrom, filters.dateTo, productFilters.params.length + 1);
    const productRankingPromise = pool.query(
      `
        SELECT
          p.id AS product_id,
          COALESCE(p.sku, '') AS code,
          p.name AS product_name,
          COALESCE(pc.name, '-') AS category_name,
          COALESCE(pb.name, '-') AS brand_name,
          COALESCE(pr.name, '-') AS rubro_name,
          COALESCE(SUM(si.qty), 0)::int AS units,
          COALESCE(SUM(si.line_total), 0)::int AS amount,
          COALESCE(SUM(si.cost_amount), 0)::numeric AS cost_amount,
          COALESCE(SUM(CASE WHEN s.sale_type = 'ENVIO' THEN si.qty ELSE 0 END), 0)::int AS envio_units,
          COALESCE(SUM(CASE WHEN s.sale_type = 'MOSTRADOR' THEN si.qty ELSE 0 END), 0)::int AS mostrador_units
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN product_brands pb ON pb.id = p.brand_id
        LEFT JOIN product_rubros pr ON pr.id = p.rubro_id
        ${salesBaseWhere}
        ${productFilters.whereSql}
        ${productDate.whereSql}
        GROUP BY p.id, pc.name, pb.name, pr.name
        ORDER BY units DESC, amount DESC, product_name ASC
        LIMIT 200
      `,
      [...productFilters.params, ...productDate.params]
    );

    const clientFilters = buildDateParams(filters.dateFrom, filters.dateTo);
    const clientRankingPromise = pool.query(
      `
        SELECT
          COALESCE(c.id::text, s.customer_id::text, COALESCE(s.customer_name_snapshot, 'CONSUMIDOR FINAL')) AS customer_key,
          COALESCE(c.name, s.customer_name_snapshot, 'CONSUMIDOR FINAL') AS customer_name,
          COALESCE(SUM(si.qty), 0)::int AS units,
          COALESCE(SUM(si.line_total), 0)::int AS amount,
          COUNT(DISTINCT s.id)::int AS sales_count
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        LEFT JOIN customers c ON c.id = s.customer_id
        ${salesBaseWhere}
        ${clientFilters.whereSql}
        GROUP BY customer_key, customer_name
        ORDER BY amount DESC, units DESC, customer_name ASC
        LIMIT 200
      `,
      clientFilters.params
    );

    const dayProfitPromise = pool.query(
      `
        SELECT
          COALESCE(SUM(si.line_total), 0)::int AS sold_amount,
          COALESCE(SUM(si.cost_amount), 0)::numeric AS cost_amount
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        ${salesBaseWhere}
          AND COALESCE(s.charged_at, s.created_at)::date = CURRENT_DATE
      `
    );

    const monthProfitPromise = pool.query(
      `
        SELECT
          COALESCE(SUM(si.line_total), 0)::int AS sold_amount,
          COALESCE(SUM(si.cost_amount), 0)::numeric AS cost_amount
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        ${salesBaseWhere}
          AND DATE_TRUNC('month', COALESCE(s.charged_at, s.created_at)) = DATE_TRUNC('month', CURRENT_DATE)
      `
    );

    const customProfitDate = buildDateParams(filters.dateFrom, filters.dateTo);
    const customProfitPromise = pool.query(
      `
        SELECT
          COALESCE(SUM(si.line_total), 0)::int AS sold_amount,
          COALESCE(SUM(si.cost_amount), 0)::numeric AS cost_amount
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        ${salesBaseWhere}
        ${customProfitDate.whereSql}
      `,
      customProfitDate.params
    );

    const [
      monthlySales,
      monthlyBudgets,
      productRanking,
      clientRanking,
      dayProfit,
      monthProfit,
      customProfit,
    ] = await Promise.all([
      monthlySalesPromise,
      monthlyBudgetsPromise,
      productRankingPromise,
      clientRankingPromise,
      dayProfitPromise,
      monthProfitPromise,
      customProfitPromise,
    ]);

    const productRows = productRanking.rows.map((row) => ({
      productId: row.product_id,
      code: row.code,
      productName: row.product_name,
      categoryName: row.category_name,
      brandName: row.brand_name,
      rubroName: row.rubro_name,
      units: toInt(row.units),
      amount: toInt(row.amount),
      costAmount: toInt(row.cost_amount),
      profit: toInt(row.amount) - toInt(row.cost_amount),
      envioUnits: toInt(row.envio_units),
      mostradorUnits: toInt(row.mostrador_units),
    }));

    const buildProfitBlock = (row) => {
      const sold = toInt(row?.sold_amount);
      const cost = toInt(row?.cost_amount);
      return {
        soldAmount: sold,
        costAmount: cost,
        profit: sold - cost,
      };
    };

    res.json({
      ok: true,
      monthlySales: monthlySales.rows.map((row) => ({
        monthKey: row.month_key,
        monthLabel: row.month_label,
        count: toInt(row.sales_count),
        amount: toInt(row.sales_amount),
      })),
      monthlyBudgets: monthlyBudgets.rows.map((row) => ({
        monthKey: row.month_key,
        monthLabel: row.month_label,
        count: toInt(row.budgets_count),
        amount: toInt(row.budgets_amount),
      })),
      productRanking: productRows,
      channelRanking: {
        envio: [...productRows].sort((a, b) => b.envioUnits - a.envioUnits || b.amount - a.amount),
        mostrador: [...productRows].sort((a, b) => b.mostradorUnits - a.mostradorUnits || b.amount - a.amount),
      },
      clientRanking: clientRanking.rows.map((row) => ({
        customerKey: row.customer_key,
        customerName: row.customer_name,
        units: toInt(row.units),
        amount: toInt(row.amount),
        salesCount: toInt(row.sales_count),
      })),
      profits: {
        day: buildProfitBlock(dayProfit.rows[0]),
        month: buildProfitBlock(monthProfit.rows[0]),
        range: buildProfitBlock(customProfit.rows[0]),
      },
    });
  })
);

module.exports = router;
