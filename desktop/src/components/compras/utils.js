import { isAndroidApk } from "../../api";

export const PURCHASE_DRAFT_STORAGE_PREFIX = "lf_purchase_draft_v1";
export const MAX_PERSISTED_RECEIPT_SIZE = 350000;

export const isTypingTarget = (target) => {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
};

export const isQtyShortcut = (event) =>
  event.key === "*" || event.key === "Multiply" || event.code === "NumpadMultiply";

export const isPriceShortcut = (event) =>
  event.key === "/" || event.key === "Divide" || event.code === "NumpadDivide";

export const normalizeActiveProducts = (rows) =>
  (Array.isArray(rows) ? rows : []).filter((product) => product?.is_active !== false);

export const isMobileKeyboardViewport = () =>
  isAndroidApk || (typeof window !== "undefined" && window.innerWidth < 960);

export const buildEmptyPurchaseDraft = () => ({
  supplierId: "",
  supplierName: "",
  invoiceNumber: "",
  invoiceType: "Factura A",
  paymentMethod: "EFECTIVO",
  location: "LOCAL",
  items: [],
  date: new Date().toISOString().split("T")[0],
  receiptImageDataUrl: "",
  receiptImageName: "",
});

export const buildEmptyPurchaseUiState = () => ({
  search: "",
  qty: "1",
  unitCost: "",
  salePrice: "",
  selectedIdx: 0,
});

export const parseDecimal = (value, fallback = 0) => {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatQuantity = (value) =>
  parseDecimal(value).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

const getNestedPriceLists = (product) =>
  (product?.priceLists && typeof product.priceLists === "object" ? product.priceLists : null) ||
  (product?.price_lists && typeof product.price_lists === "object" ? product.price_lists : null);

export const getProductMinoristaPrice = (product) => {
  const nestedPriceLists = getNestedPriceLists(product);
  const value =
    product?.priceMinorista ??
    product?.price_minorista ??
    nestedPriceLists?.MINORISTA ??
    nestedPriceLists?.minorista;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getProductMayoristaPrice = (product) => {
  const nestedPriceLists = getNestedPriceLists(product);
  const value =
    product?.priceMayorista ??
    product?.price_mayorista ??
    nestedPriceLists?.MAYORISTA ??
    nestedPriceLists?.mayorista;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getDefaultSalePrice = (product) => {
  const minorista = getProductMinoristaPrice(product);
  if (minorista > 0) return minorista;
  const mayorista = getProductMayoristaPrice(product);
  if (mayorista > 0) return mayorista;
  return 0;
};

export const getPurchaseDraftStorageKey = (user) =>
  `${PURCHASE_DRAFT_STORAGE_PREFIX}:${String(user?.id || user?.username || user?.role || "anon")}`;

export const sanitizeDraftItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: String(item?.productId || "").trim(),
      codigo: String(item?.codigo || "").trim(),
      name: String(item?.name || "").trim(),
      qty: Number(item?.qty || 0),
      unitCost: Number(item?.unitCost || 0),
      priceMayorista:
        item?.priceMayorista === null || item?.priceMayorista === undefined || item?.priceMayorista === ""
          ? null
          : Number(item.priceMayorista || 0),
      salePrice:
        item?.salePrice === null || item?.salePrice === undefined || item?.salePrice === ""
          ? null
          : Number(item.salePrice || 0),
    }))
    .filter(
      (item) =>
        item.productId &&
        item.name &&
        Number.isFinite(item.qty) &&
        item.qty > 0 &&
        Number.isFinite(item.unitCost) &&
        item.unitCost >= 0 &&
        (item.priceMayorista === null || (Number.isFinite(item.priceMayorista) && item.priceMayorista >= 0)) &&
        (item.salePrice === null || (Number.isFinite(item.salePrice) && item.salePrice >= 0))
    );

export const loadPersistedPurchaseState = (storageKey) => {
  const emptyDraft = buildEmptyPurchaseDraft();
  const emptyUi = buildEmptyPurchaseUiState();
  if (typeof window === "undefined" || !storageKey) {
    return { draft: emptyDraft, ...emptyUi };
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { draft: emptyDraft, ...emptyUi };
    }
    const parsed = JSON.parse(raw);
    const draft = {
      ...emptyDraft,
      ...(parsed?.draft && typeof parsed.draft === "object" ? parsed.draft : {}),
      items: sanitizeDraftItems(parsed?.draft?.items),
    };
    const selectedIdx = Math.min(
      Math.max(0, Number(parsed?.selectedIdx || 0) || 0),
      Math.max(draft.items.length - 1, 0)
    );
    return {
      draft,
      search: String(parsed?.search || ""),
      qty: String(parsed?.qty || "1"),
      unitCost: String(parsed?.unitCost || ""),
      salePrice: String(parsed?.salePrice || ""),
      selectedIdx,
    };
  } catch {
    return { draft: emptyDraft, ...emptyUi };
  }
};

export const persistPurchaseState = ({ storageKey, draft, search, qty, unitCost, salePrice, selectedIdx }) => {
  if (typeof window === "undefined" || !storageKey) return;
  const draftToPersist = {
    ...draft,
    items: sanitizeDraftItems(draft.items),
  };
  if (String(draftToPersist.receiptImageDataUrl || "").length > MAX_PERSISTED_RECEIPT_SIZE) {
    draftToPersist.receiptImageDataUrl = "";
    draftToPersist.receiptImageName = "";
  }

  localStorage.setItem(
    storageKey,
    JSON.stringify({
      draft: draftToPersist,
      search: String(search || ""),
      qty: String(qty || "1"),
      unitCost: String(unitCost || ""),
      salePrice: String(salePrice || ""),
      selectedIdx: Math.min(
        Math.max(0, Number(selectedIdx || 0) || 0),
        Math.max(draftToPersist.items.length - 1, 0)
      ),
    })
  );
};
