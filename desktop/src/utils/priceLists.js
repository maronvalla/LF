export const DEFAULT_PRICE_LISTS = [
  { key: "MINORISTA", label: "Minorista" },
  { key: "MAYORISTA", label: "Mayorista" },
];

export const DEFAULT_PRICE_LIST_KEY = "MAYORISTA";

export function normalizePriceListKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePriceListsConfig(input) {
  const unique = new Map(DEFAULT_PRICE_LISTS.map((row) => [row.key, row]));
  for (const row of input?.lists || []) {
    const key = normalizePriceListKey(row?.key);
    const label = String(row?.label || "").trim();
    if (!key || !label) continue;
    unique.set(key, { key, label });
  }
  const lists = Array.from(unique.values());
  const requestedDefault = normalizePriceListKey(input?.defaultKey);
  const fallbackDefault = lists.some((row) => row.key === DEFAULT_PRICE_LIST_KEY)
    ? DEFAULT_PRICE_LIST_KEY
    : normalizePriceListKey(lists?.[0]?.key) || "MINORISTA";
  const defaultKey = lists.some((row) => row.key === requestedDefault)
    ? requestedDefault
    : fallbackDefault;
  return { lists, defaultKey };
}

export function getPriceListLabel(priceLists, key) {
  const normalizedKey = normalizePriceListKey(key) || "MINORISTA";
  const match = (priceLists || []).find((row) => row.key === normalizedKey);
  return match?.label || normalizedKey;
}

export function getDefaultPriceListKey(priceLists) {
  if (Array.isArray(priceLists)) {
    return normalizePriceListKey(priceLists?.find((row) => row.key === DEFAULT_PRICE_LIST_KEY)?.key)
      || normalizePriceListKey(priceLists?.[0]?.key)
      || "MINORISTA";
  }
  return normalizePriceListKey(priceLists?.defaultKey)
    || normalizePriceListKey(priceLists?.lists?.find((row) => row.key === DEFAULT_PRICE_LIST_KEY)?.key)
    || normalizePriceListKey(priceLists?.lists?.[0]?.key)
    || "MINORISTA";
}
