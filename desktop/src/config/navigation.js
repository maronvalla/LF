export const TABS = [
  "Dashboard",
  "📦 Productos",
  "👥 Clientes",
  "🛒 Compras",
  "🏷️ Ventas",
  "🛵 Reparto",
  "📊 Consolidado",
  "Informes",
  "🧾 Cuenta Corriente",
  "💰 Caja",
  "🧭 Configuracion",
  "🗺️ Rutas",
  "📝 ConsultarVentas",
  "⚙️ Usuarios",
  "🚚 Proveedores",
  "🏢 Inventario",
  "🔍 Auditoria",
];

export const SHORTCUTS = {
  F1: "📦 Productos",
  F2: "👥 Clientes",
  F3: "🛒 Compras",
  F4: "🏷️ Ventas",
  F5: "🛵 Reparto",
  F6: "📝 ConsultarVentas",
  F7: "🗺️ Rutas",
  F8: "⚙️ Usuarios",
  F9: "📊 Consolidado",
};

export const ROLE_TABS = {
  ADMIN: TABS.filter((tab) => tab !== "Dashboard"),
  CAJERO: [
    "📦 Productos",
    "👥 Clientes",
    "🛒 Compras",
    "📝 ConsultarVentas",
    "📊 Consolidado",
    "Informes",
    "🧾 Cuenta Corriente",
    "💰 Caja",
    "🗺️ Rutas",
    "🚚 Proveedores",
  ],
  VENDEDOR: ["🏷️ Ventas", "🗺️ Rutas"],
};
