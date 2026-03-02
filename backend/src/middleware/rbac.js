const { ROLES } = require("../constants");
const { getPermissionsForRole, hasPermissionInList } = require("../services/roles");

function requirePermission(permission) {
  return async (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) return res.status(401).json({ ok: false, message: "No autenticado" });
    try {
      const permissions = await getPermissionsForRole(userRole);
      const allowed = hasPermissionInList(permissions, permission);
      if (!allowed) {
        return res.status(403).json({ ok: false, message: "Sin permisos para esta accion" });
      }
      req.userPermissions = permissions;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function isAdmin(req) {
  return req.user?.role === ROLES.ADMIN;
}

module.exports = { requirePermission, isAdmin };
