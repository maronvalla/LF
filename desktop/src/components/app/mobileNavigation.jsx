export function isTypingTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
}

export function normalizeTabToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

const MOBILE_TAB_PRIORITY = [
  "VENTAS",
  "COMPRAS",
  "CLIENTES",
  "PRODUCTOS",
  "CRM",
  "CAJA",
  "CONSOLIDADO",
  "RUTAS",
  "CONSULTARVENTAS",
  "CONSULTARORDENES",
  "CUENTACORRIENTE",
  "PROVEEDORES",
  "INVENTARIO",
  "INFORMES",
  "CONFIGURACION",
  "USUARIOS",
  "AUDITORIA",
  "REPARTO",
];

const MOBILE_TAB_META = {
  DASHBOARD: {
    label: "Inicio",
    shortLabel: "Inicio",
    description: "Resumen operativo y accesos rapidos",
    icon: "home",
  },
  CRM: {
    label: "CRM",
    shortLabel: "CRM",
    description: "Clientes, pipeline y seguimiento comercial",
    icon: "crm",
  },
  PRODUCTOS: {
    label: "Productos",
    shortLabel: "Productos",
    description: "Catalogo, precios y stock disponible",
    icon: "box",
  },
  CLIENTES: {
    label: "Clientes",
    shortLabel: "Clientes",
    description: "Base de clientes, fichas y datos de contacto",
    icon: "users",
  },
  COMPRAS: {
    label: "Compras",
    shortLabel: "Compras",
    description: "Carga de ingresos, costos y proveedores",
    icon: "cart",
  },
  VENTAS: {
    label: "Ventas",
    shortLabel: "Ventas",
    description: "Cobro rapido, pedidos y presupuestos",
    icon: "ticket",
  },
  REPARTO: {
    label: "Reparto",
    shortLabel: "Reparto",
    description: "Seguimiento y gestion de envios",
    icon: "truck",
  },
  CONSOLIDADO: {
    label: "Consolidado",
    shortLabel: "Consolidado",
    description: "Preparacion de carga y control por reparto",
    icon: "layers",
  },
  INFORMES: {
    label: "Informes",
    shortLabel: "Informes",
    description: "Indicadores y analisis del negocio",
    icon: "chart",
  },
  CUENTACORRIENTE: {
    label: "Cuenta Corriente",
    shortLabel: "Cta Cte",
    description: "Saldos, movimientos y seguimiento de deuda",
    icon: "wallet",
  },
  CAJA: {
    label: "Caja",
    shortLabel: "Caja",
    description: "Apertura, cierre y control de efectivo",
    icon: "cash",
  },
  CONFIGURACION: {
    label: "Configuracion",
    shortLabel: "Ajustes",
    description: "Parametros, listas y reglas del sistema",
    icon: "settings",
  },
  RUTAS: {
    label: "Rutas",
    shortLabel: "Rutas",
    description: "Mapas, zonas y recorridos",
    icon: "route",
  },
  CONSULTARVENTAS: {
    label: "Consultar Ventas",
    shortLabel: "Ventas",
    description: "Historial y consulta de tickets emitidos",
    icon: "search",
  },
  CONSULTARORDENES: {
    label: "Consultar Ordenes",
    shortLabel: "Ordenes",
    description: "Ordenes pendientes y consulta de envios",
    icon: "clipboard",
  },
  USUARIOS: {
    label: "Usuarios",
    shortLabel: "Usuarios",
    description: "Roles, permisos y accesos",
    icon: "shield",
  },
  PROVEEDORES: {
    label: "Proveedores",
    shortLabel: "Proveedores",
    description: "Proveedores, cuentas y abastecimiento",
    icon: "factory",
  },
  INVENTARIO: {
    label: "Inventario",
    shortLabel: "Inventario",
    description: "Movimientos, saldos y control de stock",
    icon: "warehouse",
  },
  AUDITORIA: {
    label: "Auditoria",
    shortLabel: "Auditoria",
    description: "Registro de actividad y trazabilidad",
    icon: "audit",
  },
};

export function getMobileTabMeta(tab) {
  const token = normalizeTabToken(tab);
  const fallback = String(tab || "").trim() || "Seccion";
  return {
    token,
    label: MOBILE_TAB_META[token]?.label || fallback,
    shortLabel: MOBILE_TAB_META[token]?.shortLabel || fallback,
    description: MOBILE_TAB_META[token]?.description || "Seccion del sistema",
    icon: MOBILE_TAB_META[token]?.icon || "grid",
  };
}

export function buildMobileSectionOrder(allowedTabs) {
  const uniqueTabs = [];
  const seen = new Set(["DASHBOARD"]);

  const sortedAllowedTabs = [...(allowedTabs || [])].sort((left, right) => {
    const leftToken = normalizeTabToken(left);
    const rightToken = normalizeTabToken(right);
    const leftIdx = MOBILE_TAB_PRIORITY.indexOf(leftToken);
    const rightIdx = MOBILE_TAB_PRIORITY.indexOf(rightToken);
    const leftPriority = leftIdx === -1 ? Number.MAX_SAFE_INTEGER : leftIdx;
    const rightPriority = rightIdx === -1 ? Number.MAX_SAFE_INTEGER : rightIdx;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return getMobileTabMeta(left).label.localeCompare(getMobileTabMeta(right).label, "es", {
      sensitivity: "base",
    });
  });

  sortedAllowedTabs.forEach((tab) => {
    const token = normalizeTabToken(tab);
    if (!token || seen.has(token)) return;
    seen.add(token);
    uniqueTabs.push(tab);
  });

  return ["Dashboard", ...uniqueTabs];
}

export function buildMobilePrimaryTabs(allowedTabs) {
  return buildMobileSectionOrder(allowedTabs)
    .filter((tab) => normalizeTabToken(tab) !== "DASHBOARD")
    .slice(0, 3);
}

export function isInteractiveSwipeTarget(target) {
  if (!target) return false;
  if (isTypingTarget(target)) return true;
  return Boolean(
    target.closest?.(
      "button, a, input, textarea, select, label, [role='button'], [role='dialog'], .overflow-x-auto, .overflow-x-scroll, [data-disable-swipe-nav='true']"
    )
  );
}

export function MobileTabIcon({ icon, className = "w-5 h-5" }) {
  const commonProps = {
    className,
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  switch (icon) {
    case "home":
      return (
        <svg {...commonProps}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9 21v-6h6v6" />
        </svg>
      );
    case "crm":
      return (
        <svg {...commonProps}>
          <path d="M4 6h16v12H4z" />
          <path d="M8 10h8" />
          <path d="M8 14h5" />
          <path d="M7 4v4" />
          <path d="M17 4v4" />
        </svg>
      );
    case "box":
      return (
        <svg {...commonProps}>
          <path d="m3 7 9-4 9 4-9 4-9-4Z" />
          <path d="M3 7v10l9 4 9-4V7" />
          <path d="M12 11v10" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3.2" />
          <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M15.5 4.15a3.2 3.2 0 0 1 0 5.7" />
        </svg>
      );
    case "cart":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="20" r="1.2" />
          <circle cx="18" cy="20" r="1.2" />
          <path d="M2 3h3l2.2 10.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.76L21 6H6" />
        </svg>
      );
    case "ticket":
      return (
        <svg {...commonProps}>
          <path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8Z" />
          <path d="M9 9h6" />
          <path d="M9 13h6" />
        </svg>
      );
    case "truck":
      return (
        <svg {...commonProps}>
          <path d="M10 17H5V7h10v10h-1" />
          <path d="M15 10h3l3 3v4h-2" />
          <circle cx="7.5" cy="18" r="1.5" />
          <circle cx="17.5" cy="18" r="1.5" />
        </svg>
      );
    case "layers":
      return (
        <svg {...commonProps}>
          <path d="m12 3 9 4.5-9 4.5L3 7.5 12 3Z" />
          <path d="m3 12 9 4.5 9-4.5" />
          <path d="m3 16.5 9 4.5 9-4.5" />
        </svg>
      );
    case "chart":
      return (
        <svg {...commonProps}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-8" />
          <path d="M22 20v-5" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...commonProps}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-9Z" />
          <path d="M17 12h4" />
          <circle cx="16" cy="12" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "cash":
      return (
        <svg {...commonProps}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M7 9h.01" />
          <path d="M17 15h.01" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
        </svg>
      );
    case "route":
      return (
        <svg {...commonProps}>
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="6" r="2" />
          <path d="M8 18h3a4 4 0 0 0 4-4V10" />
          <path d="M14 6h-3a4 4 0 0 0-4 4v4" />
        </svg>
      );
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...commonProps}>
          <rect x="6" y="4" width="12" height="16" rx="2" />
          <path d="M9 4.5h6v3H9z" />
          <path d="M9 11h6" />
          <path d="M9 15h4" />
        </svg>
      );
    case "shield":
      return (
        <svg {...commonProps}>
          <path d="M12 3l7 3v5c0 5-3.2 8-7 10-3.8-2-7-5-7-10V6l7-3Z" />
          <path d="m9.5 12 1.8 1.8L15 10.2" />
        </svg>
      );
    case "factory":
      return (
        <svg {...commonProps}>
          <path d="M3 21V8l7 4V8l7 4V6l4 2v13H3Z" />
          <path d="M7 21v-4" />
          <path d="M11 21v-4" />
          <path d="M15 21v-4" />
        </svg>
      );
    case "warehouse":
      return (
        <svg {...commonProps}>
          <path d="M3 9.5 12 4l9 5.5V20H3V9.5Z" />
          <path d="M8 20v-5h8v5" />
          <path d="M9 11h6" />
        </svg>
      );
    case "audit":
      return (
        <svg {...commonProps}>
          <path d="M14 3h5v5" />
          <path d="M10 14 19 5" />
          <path d="M5 7h5" />
          <path d="M5 12h7" />
          <path d="M5 17h9" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <path d="M4 4h6v6H4z" />
          <path d="M14 4h6v6h-6z" />
          <path d="M4 14h6v6H4z" />
          <path d="M14 14h6v6h-6z" />
        </svg>
      );
  }
}
