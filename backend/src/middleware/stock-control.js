const { loadStockControlState } = require("../services/stock-control");

async function blockDuringStockControl(req, res, next) {
  try {
    const state = await loadStockControlState();
    if (!state.active) return next();
    return res.status(409).json({
      ok: false,
      code: "STOCK_CONTROL_ACTIVE",
      message: "Control de stock en curso",
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { blockDuringStockControl };
