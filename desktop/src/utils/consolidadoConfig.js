export const CONSOLIDADO_CONFIG_KEY = "lf_consolidado_config_v1";

export const DEFAULT_CONSOLIDADO_CONFIG = {
  defaultPickLocation: "LOCAL",
  priorityRubros: ["BEBIDAS"],
};

export function normalizeConsolidadoPriorityRubros(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(",");
  const unique = new Set();

  return rawValues
    .map((item) => String(item || "").trim().toUpperCase())
    .filter((item) => {
      if (!item || unique.has(item)) return false;
      unique.add(item);
      return true;
    });
}

export function loadConsolidadoConfig() {
  try {
    const raw = localStorage.getItem(CONSOLIDADO_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONSOLIDADO_CONFIG };
    const parsed = JSON.parse(raw);
    const priorityRubros = normalizeConsolidadoPriorityRubros(parsed.priorityRubros);
    return {
      defaultPickLocation: parsed.defaultPickLocation === "GALPON" ? "GALPON" : "LOCAL",
      priorityRubros: priorityRubros.length
        ? priorityRubros
        : [...DEFAULT_CONSOLIDADO_CONFIG.priorityRubros],
    };
  } catch {
    return { ...DEFAULT_CONSOLIDADO_CONFIG };
  }
}

export function saveConsolidadoConfig(config) {
  const priorityRubros = normalizeConsolidadoPriorityRubros(config?.priorityRubros);
  const normalized = {
    defaultPickLocation: config?.defaultPickLocation === "GALPON" ? "GALPON" : "LOCAL",
    priorityRubros: priorityRubros.length
      ? priorityRubros
      : [...DEFAULT_CONSOLIDADO_CONFIG.priorityRubros],
  };
  localStorage.setItem(CONSOLIDADO_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}
