const { ROLES } = require("../constants");

const rolePermissions = {
  [ROLES.ADMIN]: new Set([
    "users.manage",
    "customers.manage",
    "products.manage",
    "inventory.view",
    "inventory.transfer",
    "sales.manage",
    "sales.prepare",
    "deliveries.manage",
    "deliveries.track",
    "audit.view",
    "dashboard.view",
    "delivery.override",
    "purchases.manage",
  ]),
  [ROLES.VENDEDOR]: new Set([
    "customers.manage",
    "sales.manage",
    "deliveries.manage",
  ]),
  [ROLES.CAJERO]: new Set([
    "sales.manage",
    "customers.manage",
    "products.manage",
    "purchases.manage",
    "deliveries.manage",
    "dashboard.view",
  ]),
  [ROLES.REPARTIDOR]: new Set(["deliveries.track"]),
};

function requirePermission(permission) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) return res.status(401).json({ ok: false, message: "No autenticado" });
    const allowed = rolePermissions[userRole]?.has(permission);
    if (!allowed) {
      return res.status(403).json({ ok: false, message: "Sin permisos para esta accion" });
    }
    return next();
  };
}

function isAdmin(req) {
  return req.user?.role === ROLES.ADMIN;
}

module.exports = { requirePermission, isAdmin };
