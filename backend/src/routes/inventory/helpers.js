const { ensureBalanceRow: ensureFifoBalanceRow } = require("../../services/inventory-fifo");

async function getLocationIds(client, codes) {
  const { rows } = await client.query("SELECT id, code FROM locations WHERE code = ANY($1::text[])", [codes]);
  const map = Object.fromEntries(rows.map((row) => [row.code, row.id]));
  for (const code of codes) {
    if (!map[code]) throw new Error(`Location ${code} no inicializada`);
  }
  return map;
}

async function ensureBalanceRow(client, productId, locationId) {
  return ensureFifoBalanceRow(client, productId, locationId);
}

function validationError(res, parsed) {
  return res.status(400).json({
    ok: false,
    message: "Datos invalidos",
    errors: parsed?.error?.issues || [],
  });
}

module.exports = {
  getLocationIds,
  ensureBalanceRow,
  validationError,
};
