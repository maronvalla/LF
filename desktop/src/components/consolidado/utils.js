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
  if (!normalized) return [];

  const lines = [];
  const words = normalized.split(" ");
  let current = safePrefix;
  const baseWidth = Math.max(4, width - safePrefix.length);

  words.forEach((word) => {
    const token = String(word || "");
    const next = current.trim().length
      ? `${current} ${token}`.trimEnd()
      : `${safePrefix}${token}`;

    if (next.length <= width) {
      current = next;
      return;
    }

    if (current.trim().length) {
      lines.push(current.slice(0, width));
      current = safePrefix;
    }

    let remaining = token;
    while (remaining.length > baseWidth) {
      lines.push(`${safePrefix}${remaining.slice(0, baseWidth)}`.slice(0, width));
      remaining = remaining.slice(baseWidth);
    }
    current = remaining ? `${safePrefix}${remaining}` : safePrefix;
  });

  if (current.trim().length) {
    lines.push(current.slice(0, width));
  }

  return lines;
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
  const configuredMethod = String(order?.delivery_payment_method || "").trim().toUpperCase();
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
