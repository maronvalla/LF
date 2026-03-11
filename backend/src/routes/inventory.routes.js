const express = require("express");
const { registerInventoryQueryRoutes } = require("./inventory/query-routes");
const { registerInventoryStockControlRoutes } = require("./inventory/stock-control-routes");
const { registerInventoryMutationRoutes } = require("./inventory/mutation-routes");

const router = express.Router();

registerInventoryQueryRoutes(router);
registerInventoryStockControlRoutes(router);
registerInventoryMutationRoutes(router);

module.exports = router;
