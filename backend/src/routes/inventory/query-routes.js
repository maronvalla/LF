const { pool } = require("../../db");
const { requirePermission, requireAnyPermission } = require("../../middleware/rbac");
const { asyncHandler } = require("../../utils/async-handler");
const {
  buildStockControlWorkbook,
  loadStockControlState,
  userCanManageStockControl,
} = require("../../services/stock-control");

function registerInventoryQueryRoutes(router) {
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
}

module.exports = {
  registerInventoryQueryRoutes,
};
