export const TICKET_CONFIG_KEY = "lf_ticket_config_v1";

export const DEFAULT_TICKET_CONFIG = {
  businessName: "DISTRIBUIDORA LA FAMILIA",
  addressLine: "Avenida Mitre 831 - Aguilares",
  cityLine: "Tucuman - Argentina",
  footerText: "Gracias por su compra",
  logoDataUrl: "",
  fontSize: 15,
  paperWidthMm: 58,
  contentWidthMm: 50,
  includeComprobante: true,
  includeTicketNumber: true,
  includeDate: true,
  includeTime: true,
  includeSeller: true,
  includeClient: true,
  includePaymentDetail: true,
  includeItemSeparators: true,
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
    fontSize: Math.min(32, Math.max(9, Number(source.fontSize || DEFAULT_TICKET_CONFIG.fontSize) || DEFAULT_TICKET_CONFIG.fontSize)),
    paperWidthMm: Math.min(80, Math.max(48, Number(source.paperWidthMm || DEFAULT_TICKET_CONFIG.paperWidthMm) || DEFAULT_TICKET_CONFIG.paperWidthMm)),
    contentWidthMm: Math.min(
      Math.min(76, Math.max(40, Number(source.contentWidthMm || DEFAULT_TICKET_CONFIG.contentWidthMm) || DEFAULT_TICKET_CONFIG.contentWidthMm)),
      Math.min(80, Math.max(48, Number(source.paperWidthMm || DEFAULT_TICKET_CONFIG.paperWidthMm) || DEFAULT_TICKET_CONFIG.paperWidthMm)) - 6
    ),
    includeComprobante: Boolean(source.includeComprobante ?? DEFAULT_TICKET_CONFIG.includeComprobante),
    includeTicketNumber: Boolean(source.includeTicketNumber ?? DEFAULT_TICKET_CONFIG.includeTicketNumber),
    includeDate: Boolean(source.includeDate ?? DEFAULT_TICKET_CONFIG.includeDate),
    includeTime: Boolean(source.includeTime ?? DEFAULT_TICKET_CONFIG.includeTime),
    includeSeller: Boolean(source.includeSeller ?? DEFAULT_TICKET_CONFIG.includeSeller),
    includeClient: Boolean(source.includeClient ?? DEFAULT_TICKET_CONFIG.includeClient),
    includePaymentDetail: Boolean(source.includePaymentDetail ?? DEFAULT_TICKET_CONFIG.includePaymentDetail),
    includeItemSeparators: Boolean(source.includeItemSeparators ?? DEFAULT_TICKET_CONFIG.includeItemSeparators),
    customLines,
  };
}

export function getTicketPaperWidthMm(config) {
  return Math.min(
    80,
    Math.max(48, Number(config?.paperWidthMm || DEFAULT_TICKET_CONFIG.paperWidthMm) || DEFAULT_TICKET_CONFIG.paperWidthMm)
  );
}

export function getTicketContentWidthMm(config) {
  const paperWidth = getTicketPaperWidthMm(config);
  const requested = Number(config?.contentWidthMm || DEFAULT_TICKET_CONFIG.contentWidthMm) || DEFAULT_TICKET_CONFIG.contentWidthMm;
  return Math.min(paperWidth - 6, Math.max(40, requested));
}

export function getTicketMaxChars(config) {
  const paperWidth = getTicketPaperWidthMm(config);
  const fontSize = Math.min(32, Math.max(9, Number(config?.fontSize || DEFAULT_TICKET_CONFIG.fontSize) || DEFAULT_TICKET_CONFIG.fontSize));
  // Ajuste para el margen izquierdo de 6mm y derecho de 4mm (10mm total)
  const printableWidth = Math.max(38, paperWidth - 10);
  const estimated = Math.floor(32 * (printableWidth / 48) * (15 / fontSize));
  return Math.min(48, Math.max(16, estimated - 2));
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
