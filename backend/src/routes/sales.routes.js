const express = require("express");
const registerSalesQueryRoutes = require("./sales/query-routes");
const registerSalesBudgetRoutes = require("./sales/budget-routes");
const registerSalesTransactionRoutes = require("./sales/transaction-routes");

const router = express.Router();

registerSalesQueryRoutes(router);
registerSalesBudgetRoutes(router);
registerSalesTransactionRoutes(router);

module.exports = router;
