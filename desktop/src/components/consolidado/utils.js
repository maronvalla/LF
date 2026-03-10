export function normalizeRubroKey(value) {
  return String(value || "").trim().toUpperCase();
}

export function getRowRubroLabel(row) {
  return (
    String(
      row?.rubro_name || row?.rubroName || row?.category_name || row?.categoryName || "SIN RUBRO"
    ).trim() || "SIN RUBRO"
  );
}

export function buildRowsByRubro(rows, priorityRubros) {
  const priorities = new Map(
    (Array.isArray(priorityRubros) ? priorityRubros : []).map((item, index) => [
      normalizeRubroKey(item),
      index,
    ])
  );
  const groups = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const rubroLabel = getRowRubroLabel(row);
    const rubroKey = normalizeRubroKey(rubroLabel);
    if (!groups.has(rubroKey)) {
      groups.set(rubroKey, {
        key: rubroKey,
        label: rubroLabel,
        items: [],
        totalQty: 0,
        totalReturnableUnits: 0,
      });
    }
    const group = groups.get(rubroKey);
    group.items.push(row);
    group.totalQty += Number(row?.total_qty ?? row?.qty_to_return ?? 0);
    group.totalReturnableUnits += Number(row?.total_returnable_units || 0);
  }

  return Array.from(groups.values())
    .sort((a, b) => {
      const aPriority = priorities.has(a.key) ? priorities.get(a.key) : Number.MAX_SAFE_INTEGER;
      const bPriority = priorities.has(b.key) ? priorities.get(b.key) : Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
    })
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), "es", { sensitivity: "base" })
      ),
    }));
}

export function wrapTicketText(text, maxChars, prefix = "") {
  const normalized = String(text || "").trim().replace(/\s+/g, " ");
  const width = Math.max(8, Number(maxChars || 0) || 32);
  const safePrefix = String(prefix || "");
  const continuationPrefix = safePrefix ? " ".repeat(safePrefix.length) : "";
  if (!normalized) return [];

  const lines = [];
  const words = normalized.split(" ");
  let currentPrefix = safePrefix;
  let current = currentPrefix;

  words.forEach((word) => {
    const token = String(word || "");
    const tokenWidth = Math.max(4, width - currentPrefix.length);
    const next = current.trim().length
      ? `${current} ${token}`.trimEnd()
      : `${currentPrefix}${token}`;

    if (next.length <= width) {
      current = next;
      return;
    }

    if (current.trim().length) {
      lines.push(current.slice(0, width));
      currentPrefix = continuationPrefix;
      current = currentPrefix;
    }

    let remaining = token;
    while (remaining.length > tokenWidth) {
      lines.push(`${currentPrefix}${remaining.slice(0, tokenWidth)}`.slice(0, width));
      remaining = remaining.slice(tokenWidth);
      currentPrefix = continuationPrefix;
    }
    current = remaining ? `${currentPrefix}${remaining}` : currentPrefix;
  });

  if (current.trim().length) {
    lines.push(current.slice(0, width));
  }

  return lines;
}

const ARGENTINA_PROVINCES = new Set([
  "BUENOS AIRES",
  "CATAMARCA",
  "CHACO",
  "CHUBUT",
  "CORDOBA",
  "CORRIENTES",
  "ENTRE RIOS",
  "FORMOSA",
  "JUJUY",
  "LA PAMPA",
  "LA RIOJA",
  "MENDOZA",
  "MISIONES",
  "NEUQUEN",
  "RIO NEGRO",
  "SALTA",
  "SAN JUAN",
  "SAN LUIS",
  "SANTA CRUZ",
  "SANTA FE",
  "SANTIAGO DEL ESTERO",
  "TIERRA DEL FUEGO",
  "TUCUMAN",
]);

function normalizeAddressPart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function isPostalCodePart(value) {
  const compact = normalizeAddressPart(value).replace(/\s+/g, "");
  return /^[A-Z]?\d{4}[A-Z]{0,3}$/i.test(compact);
}

function isProvincePart(value) {
  const normalized = normalizeAddressPart(value);
  if (!normalized) return false;
  if (normalized === "ARGENTINA") return true;
  if (normalized.startsWith("PROVINCIA DE ")) return true;
  return ARGENTINA_PROVINCES.has(normalized);
}

export function sanitizeTicketAddress(address) {
  const normalized = String(address || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";

  const parts = normalized
    .split(",")
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .filter((part) => !isPostalCodePart(part))
    .filter((part) => !isProvincePart(part));

  if (!parts.length) return normalized;
  return parts.slice(0, 2).join(", ");
}

export function toAmount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveCashExpectedForOrder(order) {
  const saleTotal = toAmount(order?.sale_total);
  const finalMethod = String(order?.delivery_final_payment_method || "").trim().toUpperCase();
  const finalCash = toAmount(order?.delivery_final_cash_amount);
  const configuredPayment = String(order?.delivery_payment || "").trim().toUpperCase();
  const configuredMethodRaw = String(order?.delivery_payment_method || "").trim().toUpperCase();
  const configuredMethod =
    configuredMethodRaw ||
    (configuredPayment === "COBRAR_EN_ENTREGA"
      ? "EFECTIVO"
      : configuredPayment === "PAGO_ENTREGA_TRANSFERENCIA"
        ? "TRANSFERENCIA"
        : "");
  const expectedCash = toAmount(order?.delivery_expected_cash_amount);

  if (finalMethod === "MIXTO") return finalCash > 0 ? finalCash : 0;
  if (finalMethod === "EFECTIVO") return finalCash > 0 ? finalCash : saleTotal;
  if (finalMethod === "TRANSFERENCIA") return 0;

  if (configuredMethod === "MIXTO") return expectedCash > 0 ? expectedCash : 0;
  if (configuredPayment === "COBRAR_EN_ENTREGA" && configuredMethod === "EFECTIVO") {
    return expectedCash > 0 ? expectedCash : saleTotal;
  }
  if (configuredPayment === "COBRAR_EN_ENTREGA" && configuredMethod === "TRANSFERENCIA") {
    return 0;
  }

  return 0;
}
