export const CONSOLIDADO_CONFIG_KEY = "lf_consolidado_config_v1";

export const DEFAULT_CONSOLIDADO_CONFIG = {
  defaultPickLocation: "LOCAL",
};

export function loadConsolidadoConfig() {
  try {
    const raw = localStorage.getItem(CONSOLIDADO_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONSOLIDADO_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      defaultPickLocation: parsed.defaultPickLocation === "GALPON" ? "GALPON" : "LOCAL",
    };
  } catch {
    return { ...DEFAULT_CONSOLIDADO_CONFIG };
  }
}

export function saveConsolidadoConfig(config) {
  const normalized = {
    defaultPickLocation: config?.defaultPickLocation === "GALPON" ? "GALPON" : "LOCAL",
  };
  localStorage.setItem(CONSOLIDADO_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}
