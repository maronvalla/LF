const { pool } = require("../db");

const ALL_PERMISSIONS = [
  "users.manage",
  "settings.manage",
  "customers.manage",
  "products.manage",
  "inventory.view",
  "inventory.transfer",
  "sales.manage",
  "sales.prepare",
  "sales.checkout",
  "deliveries.manage",
  "deliveries.track",
  "audit.view",
  "dashboard.view",
  "delivery.override",
  "purchases.manage",
  "current-account.manage",
  "reports.view",
];

const DEFAULT_ROLE_DEFINITIONS = [
  {
    key: "ADMIN",
    label: "Administrador",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "CAJERO",
    label: "Cajero",
    permissions: [
      "settings.manage",
      "customers.manage",
      "products.manage",
      "sales.manage",
      "sales.checkout",
      "purchases.manage",
      "dashboard.view",
      "current-account.manage",
    ],
  },
  {
    key: "VENDEDOR",
    label: "Vendedor",
    permissions: ["customers.manage", "sales.manage", "deliveries.manage"],
  },
  {
    key: "REPARTIDOR",
    label: "Repartidor",
    permissions: ["deliveries.track"],
  },
];

const TABS_BY_PERMISSION = [
  { permission: "products.manage", tabs: ["📦 Productos"] },
  { permission: "customers.manage", tabs: ["👥 Clientes"] },
  { permission: "purchases.manage", tabs: ["🛒 Compras", "🚚 Proveedores"] },
  { permission: "sales.manage", tabs: ["🏷️ Ventas", "📝 ConsultarVentas"] },
  { permission: "sales.checkout", tabs: ["💰 Caja", "📊 Consolidado"] },
  { permission: "deliveries.manage", tabs: ["🛵 Reparto", "🗺️ Rutas"] },
  { permission: "inventory.view", tabs: ["🏢 Inventario"] },
  { permission: "inventory.transfer", tabs: ["🏢 Inventario"] },
  { permission: "audit.view", tabs: ["🔍 Auditoria"] },
  { permission: "users.manage", tabs: ["⚙️ Usuarios"] },
  { permission: "settings.manage", tabs: ["🧭 Configuracion"] },
  { permission: "current-account.manage", tabs: ["🧾 Cuenta Corriente"] },
  { permission: "reports.view", tabs: ["Informes"] },
];

function normalizeRoleKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePermissions(permissions) {
  const allowed = new Set(ALL_PERMISSIONS);
  return Array.from(new Set((permissions || []).map((item) => String(item || "").trim())))
    .filter((item) => allowed.has(item))
    .sort();
}

function normalizeRoleDefinitions(input) {
  const next = new Map();

  for (const role of DEFAULT_ROLE_DEFINITIONS) {
    next.set(role.key, {
      key: role.key,
      label: role.label,
      permissions: normalizePermissions(role.permissions),
    });
  }

  for (const role of input || []) {
    const key = normalizeRoleKey(role?.key);
    const label = String(role?.label || "").trim();
    if (!key || !label) continue;
    next.set(key, {
      key,
      label,
      permissions: normalizePermissions(role.permissions),
    });
  }

  return Array.from(next.values()).sort((a, b) => a.key.localeCompare(b.key));
}

async function loadRoleDefinitions(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key = 'role_definitions' LIMIT 1"
  );
  const saved = rows[0]?.value;
  if (!Array.isArray(saved?.roles)) {
    return normalizeRoleDefinitions(DEFAULT_ROLE_DEFINITIONS);
  }
  return normalizeRoleDefinitions(saved.roles);
}

async function saveRoleDefinitions(roles, client = pool) {
  const normalized = normalizeRoleDefinitions(roles);
  await client.query(
    `
      INSERT INTO app_settings(key, value, updated_at)
      VALUES ('role_definitions', $1::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [JSON.stringify({ roles: normalized })]
  );
  return normalized;
}

async function getPermissionsForRole(roleKey, client = pool) {
  const normalizedRole = normalizeRoleKey(roleKey);
  const roles = await loadRoleDefinitions(client);
  const role = roles.find((item) => item.key === normalizedRole);
  const permissions = role ? role.permissions : [];
  if (normalizedRole === "CAJERO") {
    return permissions.filter((permission) => permission !== "reports.view");
  }
  return permissions;
}

async function roleExists(roleKey, client = pool) {
  const permissions = await getPermissionsForRole(roleKey, client);
  return permissions.length > 0 || normalizeRoleKey(roleKey) === "REPARTIDOR";
}

function getAllowedTabsForPermissions(permissions) {
  const granted = new Set(permissions || []);
  const tabs = new Set();

  for (const mapping of TABS_BY_PERMISSION) {
    if (granted.has(mapping.permission)) {
      for (const tab of mapping.tabs) tabs.add(tab);
    }
  }

  return Array.from(tabs);
}

function hasPermissionInList(permissions, permission) {
  return new Set(permissions || []).has(permission);
}

module.exports = {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_DEFINITIONS,
  TABS_BY_PERMISSION,
  normalizeRoleKey,
  normalizeRoleDefinitions,
  loadRoleDefinitions,
  saveRoleDefinitions,
  getPermissionsForRole,
  getAllowedTabsForPermissions,
  hasPermissionInList,
  roleExists,
};
