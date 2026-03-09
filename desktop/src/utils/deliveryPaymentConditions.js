export const DELIVERY_CONDITIONS_KEY = "lf_delivery_payment_conditions_v1";

export const DEFAULT_DELIVERY_CONDITIONS = [
  { value: "PAGADO_LOCAL", label: "PAGADO EN LOCAL" },
  { value: "TRANSFER_PREVIA", label: "TRANSFERENCIA PREVIA" },
  { value: "COBRAR_EN_ENTREGA", label: "COBRAR EN ENTREGA" },
  { value: "PAGO_PARCIAL", label: "PAGO PARCIAL" },
  { value: "PAGO_ENTREGA_TRANSFERENCIA", label: "PAGO ENTREGA TRANSFERENCIA" },
];

function normalizeCondition(row) {
  if (!row || typeof row !== "object") return null;
  const value = String(row.value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  const label = String(row.label || "").trim();
  if (!value || !label) return null;
  return { value, label };
}

export function normalizeDeliveryConditions(raw) {
  const input = Array.isArray(raw) ? raw : [];
  const normalized = input.map(normalizeCondition).filter(Boolean);
  if (!normalized.length) return [...DEFAULT_DELIVERY_CONDITIONS];

  const byValue = new Map();
  for (const condition of normalized) {
    byValue.set(condition.value, condition);
  }
  for (const condition of DEFAULT_DELIVERY_CONDITIONS) {
    if (!byValue.has(condition.value)) {
      byValue.set(condition.value, condition);
    }
  }
  return Array.from(byValue.values());
}

export function loadDeliveryConditions() {
  try {
    const raw = localStorage.getItem(DELIVERY_CONDITIONS_KEY);
    if (!raw) return [...DEFAULT_DELIVERY_CONDITIONS];
    return normalizeDeliveryConditions(JSON.parse(raw));
  } catch {
    return [...DEFAULT_DELIVERY_CONDITIONS];
  }
}

export function saveDeliveryConditions(rows) {
  const normalized = normalizeDeliveryConditions(rows);
  localStorage.setItem(DELIVERY_CONDITIONS_KEY, JSON.stringify(normalized));
  return normalized;
}
