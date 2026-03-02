// Configuración de frecuencia de controles de caja
const STORAGE_KEY = "caja_control_config";

export const FREQUENCY_OPTIONS = {
  DIARIO: { value: "DIARIO", label: "Todos los días", days: 1 },
  SEMANAL: { value: "SEMANAL", label: "Una vez por semana", days: 7 },
  PERSONALIZADO: { value: "PERSONALIZADO", label: "Personalizado", days: null },
};

export const DEFAULT_CAJA_CONFIG = {
  frequency: "DIARIO",
  customDays: 1,
  weekDay: 1, // Lunes por defecto (0 = Domingo, 1 = Lunes, etc.)
  denominations: [10, 20, 50, 100, 200, 500, 1000, 2000, 10000, 20000],
};

function normalizeDenominations(values) {
  const list = Array.isArray(values) ? values : DEFAULT_CAJA_CONFIG.denominations;
  return Array.from(
    new Set(
      list
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.round(value))
    )
  ).sort((a, b) => a - b);
}

export function loadCajaConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CAJA_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      frequency: parsed.frequency || DEFAULT_CAJA_CONFIG.frequency,
      customDays: Number(parsed.customDays) || DEFAULT_CAJA_CONFIG.customDays,
      weekDay: Number(parsed.weekDay) ?? DEFAULT_CAJA_CONFIG.weekDay,
      denominations: normalizeDenominations(parsed.denominations),
    };
  } catch {
    return DEFAULT_CAJA_CONFIG;
  }
}

export function saveCajaConfig(config) {
  const normalized = {
    frequency: config.frequency || DEFAULT_CAJA_CONFIG.frequency,
    customDays: Math.max(1, Number(config.customDays) || 1),
    weekDay: Number(config.weekDay) ?? DEFAULT_CAJA_CONFIG.weekDay,
    denominations: normalizeDenominations(config.denominations),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

// Calcula si hoy se debe realizar el control de caja
export function isControlRequired(lastControlDate) {
  const config = loadCajaConfig();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Si nunca se hizo control, siempre es requerido
  if (!lastControlDate) return true;

  const lastDate = new Date(lastControlDate);
  lastDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  switch (config.frequency) {
    case "DIARIO":
      return diffDays >= 1;
    case "SEMANAL":
      // Si es el día configurado de la semana y pasó al menos un día desde el último control
      return today.getDay() === config.weekDay && diffDays >= 1;
    case "PERSONALIZADO":
      return diffDays >= config.customDays;
    default:
      return true;
  }
}

// Obtener texto descriptivo de la frecuencia configurada
export function getFrequencyDescription() {
  const config = loadCajaConfig();
  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  switch (config.frequency) {
    case "DIARIO":
      return "Control diario";
    case "SEMANAL":
      return `Cada ${dayNames[config.weekDay]}`;
    case "PERSONALIZADO":
      return `Cada ${config.customDays} día${config.customDays > 1 ? "s" : ""}`;
    default:
      return "No configurado";
  }
}
