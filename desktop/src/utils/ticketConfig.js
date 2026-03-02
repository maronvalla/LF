export const TICKET_CONFIG_KEY = "lf_ticket_config_v1";

export const DEFAULT_TICKET_CONFIG = {
  businessName: "DISTRIBUIDORA LA FAMILIA",
  addressLine: "Avenida Mitre 831 - Aguilares",
  cityLine: "Tucuman - Argentina",
  footerText: "Gracias por su compra",
  logoDataUrl: "",
  fontSize: 13,
  includeComprobante: true,
  includeTicketNumber: true,
  includeDate: true,
  includeTime: true,
  includeSeller: true,
  includeClient: true,
  includePaymentDetail: true,
  customLines: [],
};

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function normalizeTicketConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const customLines = Array.isArray(source.customLines)
    ? source.customLines.map((line) => asString(line, "")).filter(Boolean)
    : [];

  return {
    ...DEFAULT_TICKET_CONFIG,
    businessName: asString(source.businessName, DEFAULT_TICKET_CONFIG.businessName),
    addressLine: asString(source.addressLine, DEFAULT_TICKET_CONFIG.addressLine),
    cityLine: asString(source.cityLine, DEFAULT_TICKET_CONFIG.cityLine),
    footerText: asString(source.footerText, DEFAULT_TICKET_CONFIG.footerText),
    logoDataUrl: asString(source.logoDataUrl, DEFAULT_TICKET_CONFIG.logoDataUrl),
    fontSize: Math.min(18, Math.max(9, Number(source.fontSize || DEFAULT_TICKET_CONFIG.fontSize) || DEFAULT_TICKET_CONFIG.fontSize)),
    includeComprobante: Boolean(source.includeComprobante ?? DEFAULT_TICKET_CONFIG.includeComprobante),
    includeTicketNumber: Boolean(source.includeTicketNumber ?? DEFAULT_TICKET_CONFIG.includeTicketNumber),
    includeDate: Boolean(source.includeDate ?? DEFAULT_TICKET_CONFIG.includeDate),
    includeTime: Boolean(source.includeTime ?? DEFAULT_TICKET_CONFIG.includeTime),
    includeSeller: Boolean(source.includeSeller ?? DEFAULT_TICKET_CONFIG.includeSeller),
    includeClient: Boolean(source.includeClient ?? DEFAULT_TICKET_CONFIG.includeClient),
    includePaymentDetail: Boolean(source.includePaymentDetail ?? DEFAULT_TICKET_CONFIG.includePaymentDetail),
    customLines,
  };
}

export function loadTicketConfig() {
  try {
    const raw = localStorage.getItem(TICKET_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_TICKET_CONFIG };
    return normalizeTicketConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TICKET_CONFIG };
  }
}

export function saveTicketConfig(config) {
  const normalized = normalizeTicketConfig(config);
  localStorage.setItem(TICKET_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}
