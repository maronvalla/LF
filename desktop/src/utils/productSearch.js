function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

export function productMatchesSearch(product, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const fields = [
    product?.name,
    product?.codigo,
    product?.sku,
    product?.id,
  ].filter(Boolean);

  const haystack = normalizeSearchText(fields.join(" "));
  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const productTokens = tokenize(fields.join(" "));
  const queryTokens = tokenize(query);

  return queryTokens.every((queryToken) =>
    productTokens.some(
      (productToken) =>
        productToken.startsWith(queryToken) || productToken.includes(queryToken)
    )
  );
}
