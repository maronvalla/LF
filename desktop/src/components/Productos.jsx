import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import ConfirmModal from "./ventas/ConfirmModal";
import ImportExportModal from "./ImportExportModal";
import {
  DEFAULT_PRICE_LISTS,
  getPriceListLabel,
  normalizePriceListKey,
  normalizePriceListsConfig,
} from "../utils/priceLists";

const DEFAULT_UNIT_OPTIONS = ["Caja", "Cajon", "Pack", "Fardo", "Unidad"];
const UNIT_OPTIONS_KEY = "lf_product_unit_options";
const BULK_EDIT_PAGE_SIZE = 25;

function isTypingTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
}

function isTextEditingTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
}

function createFormState() {
  return {
    name: "",
    sku: "",
    imageDataUrl: "",
    categoryId: "",
    brandId: "",
    rubroId: "",
    cost: "",
    margin: "30",
    iva: "0",
    priceMinorista: "0",
    priceMayorista: "0",
    priceLists: {},
    minStock: "0",
    initialStock: "0",
    unitLabel: "Caja",
    hasReturnable: false,
    returnableUnitsPerItem: "0",
  };
}

function createBatchRow() {
  return {
    id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    ...createFormState(),
  };
}

function buildEditDraftFromProduct(product) {
  const customPriceLists = Object.fromEntries(
    Object.entries(product.price_lists || product.priceLists || {}).filter(
      ([key]) => key !== "MINORISTA" && key !== "MAYORISTA"
    )
  );
  return {
    id: product.id,
    name: product.name || "",
    sku: product.sku || "",
    imageDataUrl: product.image_data_url || product.imageDataUrl || "",
    categoryId: product.category_id || product.categoryId || "",
    brandId: product.brand_id || product.brandId || "",
    rubroId: product.rubro_id || product.rubroId || "",
    cost: String(product.cost ?? ""),
    margin: String(product.profit_margin ?? product.profitMargin ?? 30),
    iva: String(product.iva ?? 0),
    priceMinorista: String(product.price_minorista ?? product.priceMinorista ?? 0),
    priceMayorista: String(
      product.price_mayorista ?? product.priceMayorista ?? product.price_minorista ?? product.priceMinorista ?? 0
    ),
    priceLists: Object.fromEntries(
      Object.entries(customPriceLists).map(([key, value]) => [key, String(value ?? 0)])
    ),
    minStock: String(product.min_stock ?? product.minStock ?? 0),
    initialStock: String(product.stock_local ?? product.stockLocal ?? 0),
    unitLabel: product.unit_label || product.unitLabel || "Caja",
    hasReturnable: Boolean(product.has_returnable ?? product.hasReturnable),
    returnableUnitsPerItem: String(
      product.returnable_units_per_item ?? product.returnableUnitsPerItem ?? 0
    ),
  };
}

function normalizePayload(payload) {
  return JSON.stringify({
    ...payload,
    priceLists: Object.fromEntries(
      Object.entries(payload.priceLists || {}).sort(([a], [b]) => a.localeCompare(b))
    ),
  });
}

export default function Productos({ user, setToast }) {
  const CREATE_OPTION_VALUE = "__create_new__";
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [priceLists, setPriceLists] = useState(DEFAULT_PRICE_LISTS);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [unitOptions, setUnitOptions] = useState(DEFAULT_UNIT_OPTIONS);
  const [newUnitName, setNewUnitName] = useState("");
  const [manualMargin, setManualMargin] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [bulkCreateRows, setBulkCreateRows] = useState([createBatchRow()]);
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditDrafts, setBulkEditDrafts] = useState({});
  const [bulkEditOriginals, setBulkEditOriginals] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const [bulkEditPage, setBulkEditPage] = useState(1);
  const [bulkEditModeLabel, setBulkEditModeLabel] = useState("Edicion masiva de productos");
  const canImportExport = String(user?.role || "").toUpperCase() === "ADMIN";

  const [form, setForm] = useState(createFormState());
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolverRef = useRef(null);

  const showConfirm = (message) =>
    new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ message });
    });

  const resolveConfirm = (value) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmState(null);
    if (typeof resolver === "function") resolver(Boolean(value));
  };


  const calculateSalePrice = (costValue, marginValue, ivaValue) => {
    const cost = Number(costValue || 0);
    const margin = Number(marginValue || 0);
    const iva = Number(ivaValue || 0);
    const net = cost * (1 + margin / 100);
    return net * (1 + iva / 100);
  };

  const calculateMargin = (costValue, saleValue, ivaValue) => {
    const cost = Number(costValue || 0);
    const sale = Number(saleValue || 0);
    const iva = Number(ivaValue || 0);
    if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(sale) || sale <= 0) return 0;
    const saleWithoutIva = sale / (1 + iva / 100);
    const margin = ((saleWithoutIva - cost) / cost) * 100;
    return Number.isFinite(margin) ? margin : 0;
  };

  const buildPayloadFromDraft = (draft, options = {}) => {
    const includeInitialStock = options.includeInitialStock !== false;
    return {
      name: String(draft.name || "").trim(),
      sku: String(draft.sku || "").trim() || null,
      imageDataUrl: String(draft.imageDataUrl || "").trim() || null,
      categoryId: draft.categoryId || null,
      brandId: draft.brandId || null,
      rubroId: draft.rubroId || null,
      packSize: 1,
      unitLabel: String(draft.unitLabel || "Unidad").trim() || "Unidad",
      hasReturnable: Boolean(draft.hasReturnable),
      returnableUnitsPerItem: Number(draft.hasReturnable ? draft.returnableUnitsPerItem || 0 : 0),
      cost: Number(draft.cost || 0),
      profitMargin: Number(draft.margin || 0),
      iva: Number(draft.iva || 0),
      priceMinorista: Number(draft.priceMinorista || 0),
      priceMayorista: Number(draft.priceMayorista || draft.priceMinorista || 0),
      priceLists: {
        ...Object.fromEntries(
          Object.entries(draft.priceLists || {}).map(([key, value]) => [key, Number(value || 0)])
        ),
        MINORISTA: Number(draft.priceMinorista || 0),
        MAYORISTA: Number(draft.priceMayorista || draft.priceMinorista || 0),
      },
      minStock: Number(draft.minStock || 0),
      initialStock: includeInitialStock ? Number(draft.initialStock || 0) : 0,
      isActive: true,
    };
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UNIT_OPTIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        const next = Array.from(new Set(parsed.map((v) => String(v || "").trim()).filter(Boolean)));
        if (next.length) setUnitOptions(next);
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(UNIT_OPTIONS_KEY, JSON.stringify(unitOptions));
  }, [unitOptions]);

  useEffect(() => {
    const loadProductsData = async () => {
      const [p, c, b, r, pl] = await Promise.all([
        api.get("/products").catch(() => ({ data: [] })),
        api.get("/categories").catch(() => ({ data: [] })),
        api.get("/brands").catch(() => ({ data: [] })),
        api.get("/rubros").catch(() => ({ data: [] })),
        api.get("/settings/price-lists").catch(() => ({ data: { lists: DEFAULT_PRICE_LISTS } })),
      ]);
      setProducts(p.data || []);
      setCategories(c.data || []);
      setBrands(b.data || []);
      setRubros(r.data || []);
      setPriceLists(normalizePriceListsConfig(pl.data).lists);
    };

    const load = async () => {
      try {
        await loadProductsData();
      } catch {
        setToast?.({ message: "No se pudieron cargar productos", type: "error" });
      }
    };
    load();
  }, [setToast]);

  const resetForm = () => {
    setForm(createFormState());
    setManualMargin(false);
    setEditingProductId(null);
  };

  const resetBulkCreate = () => {
    setBulkCreateRows([createBatchRow()]);
  };

  const loadProductsOnly = async () => {
    const { data } = await api.get("/products");
    setProducts(data || []);
  };

  const openCreate = () => {
    resetForm();
    setShowNewProduct(true);
  };

  const openBulkCreate = () => {
    resetBulkCreate();
    setShowBulkCreate(true);
  };

  const openEdit = (product) => {
    setEditingProductId(product.id);
    setForm(buildEditDraftFromProduct(product));
    setManualMargin(true);
    setShowNewProduct(true);
  };

  const activeProducts = useMemo(
    () => products.filter((product) => product.is_active !== false && product.isActive !== false),
    [products]
  );

  const startBulkEdit = () => {
    const nextDrafts = {};
    const nextOriginals = {};
    activeProducts.forEach((product) => {
      const draft = buildEditDraftFromProduct(product);
      nextDrafts[product.id] = draft;
      nextOriginals[product.id] = normalizePayload(buildPayloadFromDraft(draft, { includeInitialStock: false }));
    });
    setBulkEditDrafts(nextDrafts);
    setBulkEditOriginals(nextOriginals);
    setBulkEditPage(1);
    setBulkEditModeLabel("Edicion masiva de productos");
    setBulkEditMode(true);
  };

  const stopBulkEdit = () => {
    setBulkEditMode(false);
    setBulkEditDrafts({});
    setBulkEditOriginals({});
    setBulkEditPage(1);
    setBulkEditModeLabel("Edicion masiva de productos");
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = String(event.key || "");
      const isPlusShortcut = key === "+" || key === "Add" || (key === "=" && event.shiftKey);

      if (event.key === "Escape" && showNewProduct) {
        event.preventDefault();
        event.stopPropagation();
        setShowNewProduct(false);
        resetForm();
        return;
      }

      if (event.key === "Escape" && showBulkCreate) {
        event.preventDefault();
        event.stopPropagation();
        setShowBulkCreate(false);
        resetBulkCreate();
        return;
      }

      if (!isPlusShortcut) return;

      if (showNewProduct || showBulkCreate) return;

      if (isTypingTarget(event.target) && !isTextEditingTarget(event.target)) return;

      event.preventDefault();
      openCreate();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showBulkCreate, showNewProduct]);

  const addCustomUnit = () => {
    const cleaned = String(newUnitName || "").trim();
    if (!cleaned) return;
    const exists = unitOptions.some((x) => x.toUpperCase() === cleaned.toUpperCase());
    if (!exists) {
      setUnitOptions((prev) => [...prev, cleaned]);
    }
    setForm((prev) => ({ ...prev, unitLabel: cleaned }));
    setNewUnitName("");
  };

  const addBulkCreateRow = () => {
    setBulkCreateRows((prev) => [...prev, createBatchRow()]);
  };

  const removeBulkCreateRow = (rowId) => {
    setBulkCreateRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== rowId) : prev));
  };

  const updateBulkCreateRow = (rowId, updater) => {
    setBulkCreateRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        return typeof updater === "function" ? updater(row) : { ...row, ...updater };
      })
    );
  };

  const updateBulkEditDraft = (productId, updater) => {
    setBulkEditDrafts((prev) => ({
      ...prev,
      [productId]:
        typeof updater === "function"
          ? updater(prev[productId] || buildEditDraftFromProduct({ id: productId }))
          : { ...prev[productId], ...updater },
    }));
  };

  const handleCustomPriceListChange = (key, value) => {
    const normalizedKey = normalizePriceListKey(key);
    if (!normalizedKey || normalizedKey === "MINORISTA" || normalizedKey === "MAYORISTA") return;
    setForm((prev) => ({
      ...prev,
      priceLists: {
        ...prev.priceLists,
        [normalizedKey]: value,
      },
    }));
  };

  const handleBulkCreatePriceListChange = (rowId, key, value) => {
    const normalizedKey = normalizePriceListKey(key);
    if (!normalizedKey || normalizedKey === "MINORISTA" || normalizedKey === "MAYORISTA") return;
    updateBulkCreateRow(rowId, (row) => ({
      ...row,
      priceLists: {
        ...row.priceLists,
        [normalizedKey]: value,
      },
    }));
  };

  const handleBulkEditPriceListChange = (productId, key, value) => {
    const normalizedKey = normalizePriceListKey(key);
    if (!normalizedKey || normalizedKey === "MINORISTA" || normalizedKey === "MAYORISTA") return;
    updateBulkEditDraft(productId, (draft) => ({
      ...draft,
      priceLists: {
        ...draft.priceLists,
        [normalizedKey]: value,
      },
    }));
  };

  const handleCostChange = (value) => {
    setForm((prev) => {
      if (manualMargin) {
        return {
          ...prev,
          cost: value,
          priceMinorista: calculateSalePrice(value, prev.margin, prev.iva).toFixed(2),
        };
      }

      return {
        ...prev,
        cost: value,
        margin: calculateMargin(value, prev.priceMinorista, prev.iva).toFixed(2),
      };
    });
  };

  const handleIvaChange = (value) => {
    setForm((prev) => {
      if (manualMargin) {
        return {
          ...prev,
          iva: value,
          priceMinorista: calculateSalePrice(prev.cost, prev.margin, value).toFixed(2),
        };
      }

      return {
        ...prev,
        iva: value,
        margin: calculateMargin(prev.cost, prev.priceMinorista, value).toFixed(2),
      };
    });
  };

  const handleMarginChange = (value) => {
    setManualMargin(true);
    setForm((prev) => ({
      ...prev,
      margin: value,
      priceMinorista: calculateSalePrice(prev.cost, value, prev.iva).toFixed(2),
    }));
  };

  const handlePriceMinoristaChange = (value) => {
    setForm((prev) => ({
      ...prev,
      priceMinorista: value,
      margin: manualMargin ? prev.margin : calculateMargin(prev.cost, value, prev.iva).toFixed(2),
    }));
  };

  const handleProductImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setToast?.({ message: "Selecciona una imagen valida", type: "error" });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, imageDataUrl: String(reader.result || "") }));
      event.target.value = "";
    };
    reader.onerror = () => {
      setToast?.({ message: "No se pudo leer la imagen", type: "error" });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const createCatalogOption = async ({ entity, label, endpoint, currentValueKey }) => {
    const name = String(window.prompt(`Nueva ${label}:`) || "").trim();
    if (!name) {
      return null;
    }

    try {
      const { data } = await api.post(endpoint, { name });
      if (!data?.id) {
        throw new Error(`No se pudo crear ${label}`);
      }

      if (entity === "category") {
        setCategories((prev) => {
          const next = [...prev, data];
          return next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        });
      } else if (entity === "brand") {
        setBrands((prev) => {
          const next = [...prev, data];
          return next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        });
      } else if (entity === "rubro") {
        setRubros((prev) => {
          const next = [...prev, data];
          return next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        });
      }

      if (currentValueKey) {
        setForm((prev) => ({ ...prev, [currentValueKey]: data.id }));
      }
      setToast?.({ message: `${label} creada`, type: "success" });
      return data.id;
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || `No se pudo crear ${label}`,
        type: "error",
      });
      return null;
    }
  };

  const handleCategoryChange = async (value) => {
    if (value === CREATE_OPTION_VALUE) {
      await createCatalogOption({
        entity: "category",
        label: "categoria",
        endpoint: "/categories",
        currentValueKey: "categoryId",
      });
      return;
    }
    setForm((prev) => ({ ...prev, categoryId: value }));
  };

  const handleBrandChange = async (value) => {
    if (value === CREATE_OPTION_VALUE) {
      await createCatalogOption({
        entity: "brand",
        label: "marca",
        endpoint: "/brands",
        currentValueKey: "brandId",
      });
      return;
    }
    setForm((prev) => ({ ...prev, brandId: value }));
  };

  const handleRubroChange = async (value) => {
    if (value === CREATE_OPTION_VALUE) {
      await createCatalogOption({
        entity: "rubro",
        label: "rubro",
        endpoint: "/rubros",
        currentValueKey: "rubroId",
      });
      return;
    }
    setForm((prev) => ({ ...prev, rubroId: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setToast?.({ message: "Nombre requerido", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayloadFromDraft(form, { includeInitialStock: true });
      if (editingProductId) {
        await api.put(`/products/${editingProductId}`, payload);
        setToast?.({ message: "Producto actualizado", type: "success" });
      } else {
        await api.post("/products", payload);
        setToast?.({ message: "Producto creado", type: "success" });
      }
      resetForm();
      await loadProductsOnly();
      setShowNewProduct(false);
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || `Error al ${editingProductId ? "actualizar" : "crear"} producto`,
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveBulkCreate = async () => {
    const rowsToCreate = bulkCreateRows.filter(
      (row) => row.name.trim() || row.sku.trim() || Number(row.cost || 0) > 0
    );
    if (!rowsToCreate.length) {
      setToast?.({ message: "No hay filas para guardar", type: "error" });
      return;
    }
    if (rowsToCreate.some((row) => !row.name.trim())) {
      setToast?.({ message: "Todas las filas cargadas deben tener nombre", type: "error" });
      return;
    }

    setBulkSaving(true);
    try {
      const results = await Promise.allSettled(
        rowsToCreate.map((row) => api.post("/products", buildPayloadFromDraft(row, { includeInitialStock: true })))
      );
      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const errorCount = results.length - successCount;

      if (successCount) {
        await loadProductsOnly();
      }

      if (errorCount) {
        const firstError = results.find((result) => result.status === "rejected");
        setToast?.({
          message:
            firstError?.reason?.response?.data?.message ||
            `Se guardaron ${successCount} productos y fallaron ${errorCount}`,
          type: successCount ? "warning" : "error",
        });
      } else {
        setToast?.({ message: `Se guardaron ${successCount} productos`, type: "success" });
      }

      if (successCount) {
        setShowBulkCreate(false);
        resetBulkCreate();
      }
    } finally {
      setBulkSaving(false);
    }
  };

  const saveBulkEdit = async () => {
    const changedEntries = products
      .map((product) => {
        const draft = bulkEditDrafts[product.id];
        if (!draft) return null;
        const payload = buildPayloadFromDraft(draft, { includeInitialStock: false });
        if (normalizePayload(payload) === bulkEditOriginals[product.id]) return null;
        return { id: product.id, payload };
      })
      .filter(Boolean);

    if (!changedEntries.length) {
      setToast?.({ message: "No hay productos modificados", type: "error" });
      return;
    }

    if (changedEntries.some((entry) => !entry.payload.name.trim())) {
      setToast?.({ message: "Todos los productos editados deben tener nombre", type: "error" });
      return;
    }

    setBulkSaving(true);
    try {
      const results = await Promise.allSettled(
        changedEntries.map((entry) => api.put(`/products/${entry.id}`, entry.payload))
      );
      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const errorCount = results.length - successCount;

      if (successCount) {
        await loadProductsOnly();
      }

      if (errorCount) {
        const firstError = results.find((result) => result.status === "rejected");
        setToast?.({
          message:
            firstError?.reason?.response?.data?.message ||
            `Se actualizaron ${successCount} productos y fallaron ${errorCount}`,
          type: successCount ? "warning" : "error",
        });
      } else {
        setToast?.({ message: `Se actualizaron ${successCount} productos`, type: "success" });
      }

      if (successCount) {
        stopBulkEdit();
      }
    } finally {
      setBulkSaving(false);
    }
  };

  const problematicProducts = useMemo(() => {
    return activeProducts
      .filter((product) => !dismissedAlertIds.includes(product.id))
      .map((product) => {
        const cost = Number(product.cost || 0);
        if (!(cost > 0)) return null;
        const prices = [
          { key: "MINORISTA", value: Number(product.price_minorista ?? product.priceMinorista ?? 0) },
          { key: "MAYORISTA", value: Number(product.price_mayorista ?? product.priceMayorista ?? product.price_minorista ?? product.priceMinorista ?? 0) },
          ...Object.entries(product.price_lists || product.priceLists || {})
            .filter(([key]) => key !== "MINORISTA" && key !== "MAYORISTA")
            .map(([key, value]) => ({ key, value: Number(value || 0) })),
        ].filter((row) => row.value > 0 && row.value < cost);
        if (!prices.length) return null;
        return { product, cost, prices };
      })
      .filter(Boolean);
  }, [activeProducts, dismissedAlertIds]);

  const currentProblem = problematicProducts[0] || null;

  const allowProblematicProduct = () => {
    if (!currentProblem?.product?.id) return;
    setDismissedAlertIds((prev) => [...prev, currentProblem.product.id]);
  };

  const allowAllProblematicProducts = () => {
    if (!problematicProducts.length) return;
    setDismissedAlertIds((prev) => [
      ...new Set([...prev, ...problematicProducts.map((entry) => entry.product.id)]),
    ]);
  };

  const reviewProblematicProduct = () => {
    if (!currentProblem?.product) return;
    openEdit(currentProblem.product);
    setDismissedAlertIds((prev) => [...prev, currentProblem.product.id]);
  };

  const reviewAllProblematicProducts = () => {
    if (!problematicProducts.length) return;
    const nextDrafts = {};
    const nextOriginals = {};
    problematicProducts.forEach(({ product }) => {
      const draft = buildEditDraftFromProduct(product);
      nextDrafts[product.id] = draft;
      nextOriginals[product.id] = normalizePayload(buildPayloadFromDraft(draft, { includeInitialStock: false }));
    });
    setBulkEditDrafts(nextDrafts);
    setBulkEditOriginals(nextOriginals);
    setBulkEditPage(1);
    setBulkEditModeLabel("Revision de alertas de precios");
    setBulkEditMode(true);
    setDismissedAlertIds((prev) => [
      ...new Set([...prev, ...problematicProducts.map((entry) => entry.product.id)]),
    ]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  }, [activeProducts, search]);

  const deleteProduct = async (product) => {
    if (!product?.id) return;
    const confirmed = await showConfirm(`Vas a borrar "${product.name}".\n¿El producto dejará de aparecer en el sistema. Deseas continuar?`);
    if (!confirmed) return;

    setDeletingProductId(product.id);
    try {
      await api.delete(`/products/${product.id}`);
      if (editingProductId === product.id) {
        setShowNewProduct(false);
        resetForm();
      }
      setDismissedAlertIds((prev) => prev.filter((id) => id !== product.id));
      await loadProductsOnly();
      setToast?.({ message: "Producto borrado", type: "success" });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo borrar el producto",
        type: "error",
      });
    } finally {
      setDeletingProductId(null);
    }
  };

  const bulkEditableRows = bulkEditMode
    ? filtered.filter((product) => Boolean(bulkEditDrafts[product.id]))
    : filtered;
  const bulkEditTotalPages = Math.max(1, Math.ceil(bulkEditableRows.length / BULK_EDIT_PAGE_SIZE));
  const bulkEditCurrentPage = Math.min(bulkEditPage, bulkEditTotalPages);
  const visibleRows = bulkEditMode
    ? bulkEditableRows.slice(
        (bulkEditCurrentPage - 1) * BULK_EDIT_PAGE_SIZE,
        bulkEditCurrentPage * BULK_EDIT_PAGE_SIZE
      )
    : filtered;

  const renderCatalogSelect = ({ value, options, onChange, emptyLabel, createLabel, disabled = false }) => (
    <select className="input mt-1 min-w-[140px]" value={value} onChange={onChange} disabled={disabled}>
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
      {createLabel ? <option value={CREATE_OPTION_VALUE}>{createLabel}</option> : null}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="card p-4 rounded-lg bg-zinc-900 border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black text-[#e85d04] uppercase">Productos</h2>
          <div className="flex flex-wrap justify-end gap-2">
            {canImportExport ? (
              <button
                type="button"
                className="btn bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg flex items-center gap-2"
                onClick={() => setShowImportExport(true)}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Importar / Exportar
              </button>
            ) : null}
            <button type="button" className="btn btn-muted rounded-lg" onClick={openBulkCreate}>
              Carga masiva
            </button>
            {bulkEditMode ? (
              <>
                <button
                  type="button"
                  className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg"
                  onClick={saveBulkEdit}
                  disabled={bulkSaving}
                >
                  {bulkSaving ? "Guardando..." : "Guardar edicion masiva"}
                </button>
                <button type="button" className="btn btn-muted rounded-lg" onClick={stopBulkEdit} disabled={bulkSaving}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-muted rounded-lg" onClick={startBulkEdit}>
                Editar varios
              </button>
            )}
            <button
              type="button"
              className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg"
              onClick={openCreate}
            >
              + Nuevo producto
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4 rounded-lg bg-zinc-900 border-zinc-800">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-lg font-black text-[#e85d04] uppercase">Listado</h2>
          <input
            className="input w-64"
            placeholder="Buscar por nombre o codigo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400 uppercase text-[10px]">
              <tr>
                <th className="text-left py-2">Foto</th>
                <th className="text-left py-2">Codigo</th>
                <th className="text-left py-2">Nombre</th>
                <th className="text-left py-2">Marca</th>
                <th className="text-left py-2">Categoria</th>
                <th className="text-left py-2">Rubro</th>
                <th className="text-left py-2">Unidad</th>
                <th className="text-right py-2">Envases x Unidad</th>
                <th className="text-right py-2">Costo</th>
                <th className="text-right py-2">Stock Local</th>
                <th className="text-right py-2">Stock Min.</th>
                <th className="text-right py-2">Minorista</th>
                <th className="text-right py-2">Mayorista</th>
                <th className="text-left py-2">Otras listas</th>
                <th className="text-right py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-zinc-800 cursor-pointer hover:bg-zinc-800/40"
                  onClick={() => openEdit(p)}
                >
                  <td className="py-2 pr-3">
                    {p.image_data_url || p.imageDataUrl ? (
                      <img
                        src={p.image_data_url || p.imageDataUrl}
                        alt={p.name}
                        className="h-12 w-12 rounded-lg object-cover border border-zinc-800 bg-zinc-950"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/60" />
                    )}
                  </td>
                  <td className="py-2">{p.sku || "-"}</td>
                  <td className="py-2 font-bold">{p.name}</td>
                  <td className="py-2">{p.brand_name || p.brandName || "-"}</td>
                  <td className="py-2">{p.category_name || p.categoryName || "-"}</td>
                  <td className="py-2">{p.rubro_name || p.rubroName || "-"}</td>
                  <td className="py-2">{p.unit_label || p.unitLabel || "Unidad"}</td>
                  <td className="py-2 text-right">
                    {Number(p.has_returnable || p.hasReturnable)
                      ? Number(p.returnable_units_per_item || p.returnableUnitsPerItem || 0)
                      : "-"}
                  </td>
                  <td className="py-2 text-right">${Number(p.cost || 0).toFixed(2)}</td>
                  <td className="py-2 text-right">{Number(p.stock_local || p.stockLocal || 0)}</td>
                  <td className="py-2 text-right">{Number(p.min_stock || p.minStock || 0)}</td>
                  <td className="py-2 text-right">${Number(p.price_minorista || p.priceMinorista || 0).toFixed(2)}</td>
                  <td className="py-2 text-right">${Number(p.price_mayorista || p.priceMayorista || 0).toFixed(2)}</td>
                  <td className="py-2 text-xs text-zinc-400">
                    {Object.entries(p.price_lists || p.priceLists || {})
                      .filter(([key]) => key !== "MINORISTA" && key !== "MAYORISTA")
                      .map(([key, value]) => `${getPriceListLabel(priceLists, key)}: $${Number(value || 0).toFixed(2)}`)
                      .join(" | ") || "-"}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="btn rounded-lg bg-rose-900/70 px-3 py-1 text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={deletingProductId === p.id}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteProduct(p);
                      }}
                    >
                      {deletingProductId === p.id ? "Borrando..." : "Borrar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNewProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowNewProduct(false);
              resetForm();
            }
          }}
        >
          <div className="w-full max-w-6xl card p-4 rounded-xl bg-zinc-900 border-zinc-800 max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-[#e85d04] uppercase">
                {editingProductId ? "Editar producto" : "Nuevo producto"}
              </h3>
              <button
                type="button"
                className="btn btn-muted rounded-lg"
                onClick={() => {
                  setShowNewProduct(false);
                  resetForm();
                }}
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={submit} className="grid md:grid-cols-5 gap-3">
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-zinc-500">Nombre</label>
                <input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Codigo</label>
                <input className="input mt-1" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Categoria</label>
                <select className="input mt-1" value={form.categoryId} onChange={(e) => handleCategoryChange(e.target.value)}>
                  <option value="">Sin categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={CREATE_OPTION_VALUE}>+ Crear nueva categoria...</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Marca</label>
                <select className="input mt-1" value={form.brandId} onChange={(e) => handleBrandChange(e.target.value)}>
                  <option value="">Sin marca</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  <option value={CREATE_OPTION_VALUE}>+ Crear nueva marca...</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-zinc-500">Foto del producto</label>
                <div className="mt-1 flex items-start gap-3">
                  <label className="flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/70">
                    {form.imageDataUrl ? (
                      <img
                        src={form.imageDataUrl}
                        alt={form.name || "Preview del producto"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="px-3 text-center text-xs font-bold uppercase text-zinc-500">
                        Sin foto
                      </span>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleProductImageChange} />
                  </label>
                  <div className="space-y-2">
                    <label className="btn btn-muted rounded-lg cursor-pointer">
                      Cargar foto
                      <input type="file" accept="image/*" className="hidden" onChange={handleProductImageChange} />
                    </label>
                    <div className="text-xs text-zinc-500">Se guarda en el producto y se muestra como preview.</div>
                    {form.imageDataUrl ? (
                      <button
                        type="button"
                        className="btn btn-muted rounded-lg"
                        onClick={() => setForm((prev) => ({ ...prev, imageDataUrl: "" }))}
                      >
                        Quitar foto
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Rubro</label>
                <select className="input mt-1" value={form.rubroId} onChange={(e) => handleRubroChange(e.target.value)}>
                  <option value="">Sin rubro</option>
                  {rubros.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  <option value={CREATE_OPTION_VALUE}>+ Crear nuevo rubro...</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Precio Costo</label>
                <input className="input mt-1" type="number" value={form.cost} onChange={(e) => handleCostChange(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">% Ganancia</label>
                <input className="input mt-1" type="number" value={form.margin} onChange={(e) => handleMarginChange(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">IVA</label>
                <select className="input mt-1" value={form.iva} onChange={(e) => handleIvaChange(e.target.value)}>
                  <option value="0">0%</option>
                  <option value="10.5">10.5%</option>
                  <option value="21">21%</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Precio Venta Minorista</label>
                <input
                  className="input mt-1 font-bold text-[#e85d04]"
                  type="number"
                  value={form.priceMinorista}
                  onChange={(e) => handlePriceMinoristaChange(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Precio Mayorista</label>
                <input
                  className="input mt-1"
                  type="number"
                  value={form.priceMayorista}
                  onChange={(e) => setForm({ ...form, priceMayorista: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Stock inicial</label>
                <input
                  className="input mt-1"
                  type="number"
                  min="0"
                  step="1"
                  value={form.initialStock}
                  onChange={(e) => setForm({ ...form, initialStock: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Stock minimo</label>
                <input
                  className="input mt-1"
                  type="number"
                  min="0"
                  step="1"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Unidad de Medida</label>
                <select
                  className="input mt-1"
                  value={form.unitLabel}
                  onChange={(e) => setForm({ ...form, unitLabel: e.target.value })}
                >
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Agregar otra unidad</label>
                <div className="mt-1 flex gap-2">
                  <input
                    className="input"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    placeholder="Ej: Bidon"
                  />
                  <button type="button" className="btn btn-muted" onClick={addCustomUnit}>
                    Agregar
                  </button>
                </div>
              </div>
              {priceLists
                .filter((row) => row.key !== "MINORISTA" && row.key !== "MAYORISTA")
                .map((row) => (
                  <div key={row.key}>
                    <label className="text-[10px] uppercase font-bold text-zinc-500">
                      Precio {row.label}
                    </label>
                    <input
                      className="input mt-1"
                      type="number"
                      min="0"
                      value={form.priceLists[row.key] || "0"}
                      onChange={(e) => handleCustomPriceListChange(row.key, e.target.value)}
                    />
                  </div>
                ))}
              <div className="md:col-span-2 flex items-center gap-2 pt-6">
                <input
                  id="hasReturnable"
                  type="checkbox"
                  className="h-4 w-4 accent-[#e85d04]"
                  checked={Boolean(form.hasReturnable)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      hasReturnable: e.target.checked,
                      returnableUnitsPerItem: e.target.checked ? prev.returnableUnitsPerItem || "1" : "0",
                    }))
                  }
                />
                <label htmlFor="hasReturnable" className="text-xs font-bold uppercase text-zinc-400">
                  Tiene envases retornables
                </label>
              </div>
              {form.hasReturnable ? (
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Envases por producto</label>
                  <input
                    className="input mt-1"
                    type="number"
                    min="1"
                    step="1"
                    value={form.returnableUnitsPerItem}
                    onChange={(e) => setForm({ ...form, returnableUnitsPerItem: e.target.value })}
                  />
                </div>
              ) : null}

              <div className="md:col-span-5 flex justify-end gap-2">
                {editingProductId ? (
                  <button
                    type="button"
                    className="btn rounded-lg bg-rose-900/70 text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={saving || deletingProductId === editingProductId}
                    onClick={() => deleteProduct({ id: editingProductId, name: form.name })}
                  >
                    {deletingProductId === editingProductId ? "Borrando..." : "Borrar producto"}
                  </button>
                ) : null}
                <button className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg" disabled={saving}>
                  {saving ? "Guardando..." : editingProductId ? "Guardar cambios" : "Guardar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBulkCreate(false);
              resetBulkCreate();
            }
          }}
        >
          <div className="w-full max-w-[96vw] card p-4 rounded-xl bg-zinc-900 border-zinc-800 max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div>
                <h3 className="text-xl font-black text-[#e85d04] uppercase">Carga masiva de productos</h3>
                <p className="text-sm text-zinc-400">Carga varias filas y luego guarda todo de una sola vez.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-muted rounded-lg" onClick={addBulkCreateRow}>
                  Agregar
                </button>
                <button
                  type="button"
                  className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg"
                  onClick={saveBulkCreate}
                  disabled={bulkSaving}
                >
                  {bulkSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="text-left py-2">Codigo</th>
                    <th className="text-left py-2">Nombre</th>
                    <th className="text-left py-2">Categoria</th>
                    <th className="text-left py-2">Marca</th>
                    <th className="text-left py-2">Rubro</th>
                    <th className="text-right py-2">Costo</th>
                    <th className="text-right py-2">Minorista</th>
                    <th className="text-right py-2">Mayorista</th>
                    {priceLists
                      .filter((row) => row.key !== "MINORISTA" && row.key !== "MAYORISTA")
                      .map((row) => (
                        <th key={row.key} className="text-right py-2">
                          {row.label}
                        </th>
                      ))}
                    <th className="text-right py-2">Stock inicial</th>
                    <th className="text-right py-2">Stock min.</th>
                    <th className="text-left py-2">Unidad</th>
                    <th className="text-right py-2">Quitar</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkCreateRows.map((row) => (
                    <tr key={row.id} className="border-t border-zinc-800 align-top">
                      <td className="py-2">
                        <input
                          className="input min-w-[120px]"
                          value={row.sku}
                          onChange={(e) => updateBulkCreateRow(row.id, { sku: e.target.value })}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          className="input min-w-[220px]"
                          value={row.name}
                          onChange={(e) => updateBulkCreateRow(row.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="py-2">
                        {renderCatalogSelect({
                          value: row.categoryId,
                          options: categories,
                          onChange: (e) => updateBulkCreateRow(row.id, { categoryId: e.target.value }),
                          emptyLabel: "Sin categoria",
                        })}
                      </td>
                      <td className="py-2">
                        {renderCatalogSelect({
                          value: row.brandId,
                          options: brands,
                          onChange: (e) => updateBulkCreateRow(row.id, { brandId: e.target.value }),
                          emptyLabel: "Sin marca",
                        })}
                      </td>
                      <td className="py-2">
                        {renderCatalogSelect({
                          value: row.rubroId,
                          options: rubros,
                          onChange: (e) => updateBulkCreateRow(row.id, { rubroId: e.target.value }),
                          emptyLabel: "Sin rubro",
                        })}
                      </td>
                      <td className="py-2">
                        <input
                          className="input w-28 text-right"
                          type="number"
                          min="0"
                          value={row.cost}
                          onChange={(e) => updateBulkCreateRow(row.id, { cost: e.target.value })}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          className="input w-28 text-right"
                          type="number"
                          min="0"
                          value={row.priceMinorista}
                          onChange={(e) => updateBulkCreateRow(row.id, { priceMinorista: e.target.value })}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          className="input w-28 text-right"
                          type="number"
                          min="0"
                          value={row.priceMayorista}
                          onChange={(e) => updateBulkCreateRow(row.id, { priceMayorista: e.target.value })}
                        />
                      </td>
                      {priceLists
                        .filter((list) => list.key !== "MINORISTA" && list.key !== "MAYORISTA")
                        .map((list) => (
                          <td key={list.key} className="py-2">
                            <input
                              className="input w-28 text-right"
                              type="number"
                              min="0"
                              value={row.priceLists[list.key] || "0"}
                              onChange={(e) => handleBulkCreatePriceListChange(row.id, list.key, e.target.value)}
                            />
                          </td>
                        ))}
                      <td className="py-2">
                        <input
                          className="input w-24 text-right"
                          type="number"
                          min="0"
                          value={row.initialStock}
                          onChange={(e) => updateBulkCreateRow(row.id, { initialStock: e.target.value })}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          className="input w-24 text-right"
                          type="number"
                          min="0"
                          value={row.minStock}
                          onChange={(e) => updateBulkCreateRow(row.id, { minStock: e.target.value })}
                        />
                      </td>
                      <td className="py-2">
                        <select
                          className="input min-w-[120px]"
                          value={row.unitLabel}
                          onChange={(e) => updateBulkCreateRow(row.id, { unitLabel: e.target.value })}
                        >
                          {unitOptions.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <button type="button" className="btn btn-muted rounded-lg" onClick={() => removeBulkCreateRow(row.id)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {bulkEditMode && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !bulkSaving) {
              stopBulkEdit();
            }
          }}
        >
          <div className="w-full max-w-[98vw] card p-4 rounded-xl bg-zinc-900 border-zinc-800 max-h-[94vh] overflow-auto">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-[#e85d04] uppercase">{bulkEditModeLabel}</h3>
                <p className="text-sm text-zinc-400">
                  {bulkEditModeLabel === "Revision de alertas de precios"
                    ? "Aqui solo aparecen los productos con costo por encima de algun precio de venta. `Stock local` queda bloqueado."
                    : "Modifica varios productos desde esta tabla. `Stock local` queda bloqueado."}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-muted rounded-lg"
                  onClick={stopBulkEdit}
                  disabled={bulkSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg"
                  onClick={saveBulkEdit}
                  disabled={bulkSaving}
                >
                  {bulkSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
              <div>
                {bulkEditModeLabel === "Revision de alertas de precios" ? "Revisando" : "Editando en lote"}{" "}
                {bulkEditableRows.length} productos. Se muestran {visibleRows.length} por pagina para evitar bloqueos.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-muted rounded-lg px-3 py-1"
                  onClick={() => setBulkEditPage((prev) => Math.max(1, prev - 1))}
                  disabled={bulkEditCurrentPage <= 1}
                >
                  Anterior
                </button>
                <span className="min-w-[72px] text-center">
                  {bulkEditCurrentPage} / {bulkEditTotalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-muted rounded-lg px-3 py-1"
                  onClick={() => setBulkEditPage((prev) => Math.min(bulkEditTotalPages, prev + 1))}
                  disabled={bulkEditCurrentPage >= bulkEditTotalPages}
                >
                  Siguiente
                </button>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="text-left py-2">Codigo</th>
                    <th className="text-left py-2">Nombre</th>
                    <th className="text-left py-2">Marca</th>
                    <th className="text-left py-2">Categoria</th>
                    <th className="text-left py-2">Rubro</th>
                    <th className="text-left py-2">Unidad</th>
                    <th className="text-right py-2">Envases x Unidad</th>
                    <th className="text-right py-2">Costo</th>
                    <th className="text-right py-2">Stock Local</th>
                    <th className="text-right py-2">Stock Min.</th>
                    <th className="text-right py-2">Minorista</th>
                    <th className="text-right py-2">Mayorista</th>
                    <th className="text-left py-2">Otras listas</th>
                    <th className="text-right py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((p) => {
                    const draft = bulkEditDrafts[p.id];
                    if (!draft) return null;
                    return (
                      <tr key={p.id} className="border-t border-zinc-800 align-top">
                        <td className="py-2">
                          <input
                            className="input min-w-[110px]"
                            value={draft.sku}
                            onChange={(e) => updateBulkEditDraft(p.id, { sku: e.target.value })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            className="input min-w-[220px]"
                            value={draft.name}
                            onChange={(e) => updateBulkEditDraft(p.id, { name: e.target.value })}
                          />
                        </td>
                        <td className="py-2">
                          {renderCatalogSelect({
                            value: draft.brandId,
                            options: brands,
                            onChange: (e) => updateBulkEditDraft(p.id, { brandId: e.target.value }),
                            emptyLabel: "Sin marca",
                          })}
                        </td>
                        <td className="py-2">
                          {renderCatalogSelect({
                            value: draft.categoryId,
                            options: categories,
                            onChange: (e) => updateBulkEditDraft(p.id, { categoryId: e.target.value }),
                            emptyLabel: "Sin categoria",
                          })}
                        </td>
                        <td className="py-2">
                          {renderCatalogSelect({
                            value: draft.rubroId,
                            options: rubros,
                            onChange: (e) => updateBulkEditDraft(p.id, { rubroId: e.target.value }),
                            emptyLabel: "Sin rubro",
                          })}
                        </td>
                        <td className="py-2">
                          <select
                            className="input min-w-[120px]"
                            value={draft.unitLabel}
                            onChange={(e) => updateBulkEditDraft(p.id, { unitLabel: e.target.value })}
                          >
                            {unitOptions.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2">
                          <input
                            className="input w-24 text-right"
                            type="number"
                            min="0"
                            value={draft.hasReturnable ? draft.returnableUnitsPerItem : "0"}
                            onChange={(e) =>
                              updateBulkEditDraft(p.id, {
                                hasReturnable: Number(e.target.value || 0) > 0,
                                returnableUnitsPerItem: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="py-2">
                          <input
                            className="input w-28 text-right"
                            type="number"
                            min="0"
                            value={draft.cost}
                            onChange={(e) => updateBulkEditDraft(p.id, { cost: e.target.value })}
                          />
                        </td>
                        <td className="py-2 text-right text-zinc-300">{Number(p.stock_local || p.stockLocal || 0)}</td>
                        <td className="py-2">
                          <input
                            className="input w-24 text-right"
                            type="number"
                            min="0"
                            value={draft.minStock}
                            onChange={(e) => updateBulkEditDraft(p.id, { minStock: e.target.value })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            className="input w-28 text-right"
                            type="number"
                            min="0"
                            value={draft.priceMinorista}
                            onChange={(e) => updateBulkEditDraft(p.id, { priceMinorista: e.target.value })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            className="input w-28 text-right"
                            type="number"
                            min="0"
                            value={draft.priceMayorista}
                            onChange={(e) => updateBulkEditDraft(p.id, { priceMayorista: e.target.value })}
                          />
                        </td>
                        <td className="py-2 space-y-2">
                          {priceLists
                            .filter((row) => row.key !== "MINORISTA" && row.key !== "MAYORISTA")
                            .map((row) => (
                              <div key={row.key} className="flex items-center gap-2">
                                <span className="w-24 text-[10px] uppercase text-zinc-500">{row.label}</span>
                                <input
                                  className="input w-28 text-right"
                                  type="number"
                                  min="0"
                                  value={draft.priceLists[row.key] || "0"}
                                  onChange={(e) => handleBulkEditPriceListChange(p.id, row.key, e.target.value)}
                                />
                              </div>
                            ))}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            className="btn rounded-lg bg-rose-900/70 px-3 py-1 text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={bulkSaving || deletingProductId === p.id}
                            onClick={() => deleteProduct(p)}
                          >
                            {deletingProductId === p.id ? "Borrando..." : "Borrar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {currentProblem ? (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-rose-900/50 bg-zinc-950 p-6 shadow-2xl">
            <div className="text-xl font-black uppercase text-rose-400">Alerta de precios</div>
            <div className="mt-3 text-sm text-zinc-200">
              El producto <span className="font-bold text-white">{currentProblem.product.name}</span> tiene un costo
              de <span className="font-bold text-rose-300"> ${Number(currentProblem.cost).toFixed(2)}</span> superior a:
            </div>
            <div className="mt-3 space-y-1 text-sm text-zinc-300">
              {currentProblem.prices.map((row) => (
                <div key={row.key}>
                  {getPriceListLabel(priceLists, row.key)}: ${Number(row.value).toFixed(2)}
                </div>
              ))}
            </div>
            <div className="mt-5 text-sm text-zinc-300">
              Quieres permitirlo o revisar el producto?
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-muted rounded-lg"
                onClick={allowAllProblematicProducts}
              >
                Permitir todos
              </button>
              <button
                type="button"
                className="btn btn-muted rounded-lg"
                onClick={reviewAllProblematicProducts}
              >
                Revisar todos
              </button>
              <button type="button" className="btn btn-muted rounded-lg" onClick={allowProblematicProduct}>
                Permitir
              </button>
              <button type="button" className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white rounded-lg" onClick={reviewProblematicProduct}>
                Revisar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showImportExport && (
        <ImportExportModal
          entity="products"
          entityLabel="Productos"
          onClose={() => setShowImportExport(false)}
          onSuccess={async () => {
            const [p, c, b, r] = await Promise.all([
              api.get("/products").catch(() => ({ data: [] })),
              api.get("/categories").catch(() => ({ data: [] })),
              api.get("/brands").catch(() => ({ data: [] })),
              api.get("/rubros").catch(() => ({ data: [] })),
            ]);
            setProducts(p.data || []);
            setCategories(c.data || []);
            setBrands(b.data || []);
            setRubros(r.data || []);
          }}
        />
      )}
      {confirmState ? (
        <ConfirmModal
          message={confirmState.message}
          onCancel={() => resolveConfirm(false)}
          onConfirm={() => resolveConfirm(true)}
        />
      ) : null}
    </div>
  );
}
