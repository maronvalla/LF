function normalizeDeliveryCondition(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;
  if (raw === "PAGO_LOCAL_TRANSFERENCIA") return "PAGO_ENTREGA_TRANSFERENCIA";
  return raw.replace(/\s+/g, "_");
}

function closeEnoughMoney(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 0.01;
}

function canChargeSales(user) {
  const role = String(user?.role || "").toUpperCase();
  return role === "ADMIN" || role === "CAJERO";
}

module.exports = {
  normalizeDeliveryCondition,
  closeEnoughMoney,
  canChargeSales,
};
