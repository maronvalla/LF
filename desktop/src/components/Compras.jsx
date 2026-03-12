import { useState, useEffect, useMemo, useRef } from "react";
import api from "../api";
import { PurchaseModals } from "./compras/modals";
import { usePurchaseReceipts } from "./compras/usePurchaseReceipts";
import { PurchaseHeader, PurchaseItemsSection, PurchaseMetaSection, PurchaseSupplierSection, PurchaseSummarySection } from "./compras/sections";
import { buildEmptyPurchaseDraft, formatQuantity, getDefaultSalePrice, getProductMayoristaPrice, getPurchaseDraftStorageKey, isMobileKeyboardViewport, isPriceShortcut, isQtyShortcut, isTypingTarget, loadPersistedPurchaseState, normalizeActiveProducts, parseDecimal, persistPurchaseState } from "./compras/utils";

export default function Compras({ user, setToast }) {
  const role = String(user?.role || "").toUpperCase();
  const defaultCanOverrideLinePrice = ["ADMIN", "CAJERO"].includes(role);
  const storageKey = getPurchaseDraftStorageKey(user);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [showQtyEditModal, setShowQtyEditModal] = useState(false);
  const [showCostEditModal, setShowCostEditModal] = useState(false);
  const [showMayoristaEditModal, setShowMayoristaEditModal] = useState(false);
  const [showSalePriceEditModal, setShowSalePriceEditModal] = useState(false);
  const [qtyEditValue, setQtyEditValue] = useState("");
  const [costEditValue, setCostEditValue] = useState("");
  const [mayoristaEditValue, setMayoristaEditValue] = useState("");
  const [salePriceEditValue, setSalePriceEditValue] = useState("");
  const [canOverrideLinePrice, setCanOverrideLinePrice] = useState(defaultCanOverrideLinePrice);
  const [showProductModal, setShowProductModal] = useState(false);
  const [draft, setDraft] = useState(buildEmptyPurchaseDraft);
  const codeInputRef = useRef(null);
  const itemsPanelRef = useRef(null);
  const supplierSelectRef = useRef(null);
  const {
    purchaseReceiptInputRef,
    historyReceiptInputRef,
    showHistoryModal,
    setShowHistoryModal,
    historyRows,
    historyLoading,
    selectedReceipt,
    setSelectedReceipt,
    openHistory,
    openAttachReceipt,
    handleDraftReceiptChange,
    handleHistoryReceiptChange,
    closeReceipt,
  } = usePurchaseReceipts({ setToast, setDraft });
  const hasComprasModalOpen = showQtyEditModal || showCostEditModal || showMayoristaEditModal || showSalePriceEditModal || showProductModal || showHistoryModal;
  const subtotal = useMemo(() => draft.items.reduce((acc, item) => acc + Number(item.qty) * Number(item.unitCost), 0), [draft.items]);
  const totalItems = useMemo(() => draft.items.reduce((acc, item) => acc + Number(item.qty), 0), [draft.items]);
  const selectedSupplier = useMemo(() => suppliers.find((supplier) => supplier.id === draft.supplierId) || null, [suppliers, draft.supplierId]);
  const supplierHasCurrentAccount = Boolean(selectedSupplier?.enable_current_account ?? selectedSupplier?.enableCurrentAccount);

  const fetchProductsFromDb = async ({ silent = false } = {}) => {
    try {
      const { data } = await api.get("/products");
      const nextProducts = normalizeActiveProducts(data);
      setProducts(nextProducts);
      return nextProducts;
    } catch {
      if (!silent) setToast?.({ message: "No se pudo refrescar articulos", type: "error" });
      return null;
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [nextProducts, suppliersResponse] = await Promise.all([
          fetchProductsFromDb({ silent: true }),
          api.get("/suppliers").catch(() => ({ data: [] })),
        ]);
        if (!nextProducts) throw new Error("products-load-failed");
        setSuppliers(suppliersResponse.data || []);
      } catch {
        setToast?.({ message: "Error al cargar datos de compras", type: "error" });
      }
    };
    load();
  }, [setToast]);

  useEffect(() => {
    let cancelled = false;
    const loadPriceOverridePermission = async () => {
      try {
        const { data } = await api.get("/settings/price-overrides");
        if (cancelled) return;
        const allowedIds = Array.isArray(data?.userIds) ? data.userIds.map(String) : [];
        setCanOverrideLinePrice(defaultCanOverrideLinePrice || allowedIds.includes(String(user?.id || "")));
      } catch {
        if (!cancelled) setCanOverrideLinePrice(defaultCanOverrideLinePrice);
      }
    };
    loadPriceOverridePermission();
    return () => {
      cancelled = true;
    };
  }, [defaultCanOverrideLinePrice, user?.id]);

  useEffect(() => {
    setDraftReady(false);
    const restored = loadPersistedPurchaseState(storageKey);
    setDraft(restored.draft);
    setSearch(restored.search);
    setSelectedIdx(restored.selectedIdx);
    setDraftReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      persistPurchaseState({ storageKey, draft, search, qty: "1", unitCost: "", salePrice: "", selectedIdx });
    } catch {
      // Ignore storage failures; the in-memory draft remains available.
    }
  }, [draft, draftReady, search, selectedIdx, storageKey]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (hasComprasModalOpen) return;
      const typing = isTypingTarget(event.target);
      const qtyShortcut = isQtyShortcut(event);
      const priceShortcut = isPriceShortcut(event);
      const supplierShortcut = event.key === "F2";
      const productShortcut = event.key === "F5";
      const removeShortcut = (event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "x";
      const navigationShortcut = event.key === "ArrowDown" || event.key === "ArrowUp";
      const allowNavigationWhileTyping = event.target === codeInputRef.current;
      if (typing && !qtyShortcut && !priceShortcut && !supplierShortcut && !productShortcut && !removeShortcut && !(navigationShortcut && allowNavigationWhileTyping)) return;
      if (supplierShortcut) {
        event.preventDefault();
        supplierSelectRef.current?.focus();
      }
      if (productShortcut) {
        event.preventDefault();
        openProductSearch();
      }
      if (removeShortcut) {
        event.preventDefault();
        removeSelected();
      }
      if (qtyShortcut) {
        event.preventDefault();
        const currentItem = draft.items[selectedIdx];
        if (!currentItem) return;
        setQtyEditValue(String(currentItem.qty || 1));
        setShowQtyEditModal(true);
      }
      if (priceShortcut && canOverrideLinePrice) {
        event.preventDefault();
        openSelectedSalePriceEditor();
      }
      if (navigationShortcut && draft.items.length > 0 && (!typing || allowNavigationWhileTyping)) {
        event.preventDefault();
        setSelectedIdx((idx) => (event.key === "ArrowDown" ? Math.min(idx + 1, draft.items.length - 1) : Math.max(idx - 1, 0)));
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [canOverrideLinePrice, draft.items, hasComprasModalOpen, selectedIdx]);

  const restoreCodeFocusAfterModal = () => {
    if (isMobileKeyboardViewport()) return;
    window.setTimeout(() => codeInputRef.current?.focus(), 50);
  };

  const revealItemsForMobile = () => {
    if (!isMobileKeyboardViewport()) return;
    if (typeof document !== "undefined" && typeof document.activeElement?.blur === "function") document.activeElement.blur();
    codeInputRef.current?.blur?.();
    window.setTimeout(() => itemsPanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 90);
  };

  const updateSelectedItemNumericField = (field, rawValue, errorMessage, mustBePositive, onSuccess) => {
    const parsed = parseDecimal(rawValue, NaN);
    const isInvalid = !Number.isFinite(parsed) || (mustBePositive ? parsed <= 0 : parsed < 0);
    if (isInvalid) {
      setToast?.({ message: errorMessage, type: "error" });
      return;
    }
    setDraft((prev) => {
      if (selectedIdx < 0 || selectedIdx >= prev.items.length) return prev;
      const nextItems = [...prev.items];
      nextItems[selectedIdx] = { ...nextItems[selectedIdx], [field]: parsed };
      return { ...prev, items: nextItems };
    });
    onSuccess();
  };

  const openSelectedCostEditor = () => {
    const currentItem = draft.items[selectedIdx];
    if (!currentItem) return;
    setCostEditValue(String(currentItem.unitCost || 0));
    setShowCostEditModal(true);
  };

  const openSelectedMayoristaEditor = () => {
    const currentItem = draft.items[selectedIdx];
    if (!currentItem) return;
    setMayoristaEditValue(String(currentItem.priceMayorista ?? 0));
    setShowMayoristaEditModal(true);
  };

  const openSelectedSalePriceEditor = () => {
    const currentItem = draft.items[selectedIdx];
    if (!currentItem) return;
    setSalePriceEditValue(String(currentItem.salePrice ?? 0));
    setShowSalePriceEditModal(true);
  };

  const applyQtyEdit = () => updateSelectedItemNumericField("qty", qtyEditValue, "Cantidad invalida", true, () => setShowQtyEditModal(false));
  const applyCostEdit = () => updateSelectedItemNumericField("unitCost", costEditValue, "Precio invalido", false, () => setShowCostEditModal(false));
  const applyMayoristaEdit = () => updateSelectedItemNumericField("priceMayorista", mayoristaEditValue, "Precio mayorista invalido", false, () => setShowMayoristaEditModal(false));
  const applySalePriceEdit = () => updateSelectedItemNumericField("salePrice", salePriceEditValue, "Precio de venta invalido", false, () => setShowSalePriceEditModal(false));

  const addItem = (product) => {
    const qtyToAdd = 1;
    const existingIndex = draft.items.findIndex((item) => item.productId === product.id);
    setDraft((prev) => {
      const costToUse = Number(product.cost || 0);
      const mayoristaPriceToUse = getProductMayoristaPrice(product);
      const salePriceToUse = getDefaultSalePrice(product);
      const idx = prev.items.findIndex((item) => item.productId === product.id);
      if (idx >= 0) {
        const nextItems = [...prev.items];
        nextItems[idx] = {
          ...nextItems[idx],
          qty: Number(nextItems[idx].qty) + qtyToAdd,
          unitCost: costToUse,
          salePrice: salePriceToUse,
        };
        return { ...prev, items: nextItems };
      }
      return {
        ...prev,
        items: [...prev.items, { productId: product.id, codigo: product.codigo || product.sku, name: product.name, qty: qtyToAdd, unitCost: costToUse, priceMayorista: mayoristaPriceToUse, salePrice: salePriceToUse }],
      };
    });
    setSelectedIdx(existingIndex >= 0 ? existingIndex : draft.items.length);
    setSearch("");
    revealItemsForMobile();
  };

  const addCurrentSearchItem = async () => {
    if (!search.trim()) return;
    const refreshedProducts = await fetchProductsFromDb();
    if (!refreshedProducts) return;
    const normalizedSearch = search.trim().toLowerCase();
    const exact = refreshedProducts.find(
      (product) => String(product.codigo || product.sku).toLowerCase() === normalizedSearch || String(product.id).toLowerCase() === normalizedSearch
    );
    if (exact) addItem(exact);
    else setToast?.({ message: "Articulo no encontrado", type: "error" });
  };

  const openProductSearch = async () => {
    const refreshedProducts = await fetchProductsFromDb();
    if (refreshedProducts) setShowProductModal(true);
  };

  const submit = async () => {
    if (!draft.supplierId) {
      setToast?.({ message: "Seleccione un proveedor", type: "error" });
      return;
    }
    if (!draft.items.length) {
      setToast?.({ message: "Compra vacia", type: "error" });
      return;
    }
    try {
      await api.post("/purchases", {
        supplierId: draft.supplierId,
        invoiceNumber: draft.invoiceNumber || "S/N",
        invoiceType: draft.invoiceType,
        paymentMethod: draft.paymentMethod,
        location: draft.location,
        date: draft.date,
        items: draft.items.map((item) => ({
          productId: item.productId,
          qty: Number(item.qty),
          unitCost: Number(item.unitCost),
          mayoristaPrice: item.priceMayorista === null || item.priceMayorista === undefined || item.priceMayorista === "" ? null : Number(item.priceMayorista),
          salePrice: item.salePrice === null || item.salePrice === undefined || item.salePrice === "" ? null : Number(item.salePrice),
        })),
        total: subtotal,
        receiptImageDataUrl: draft.receiptImageDataUrl || null,
        receiptImageName: draft.receiptImageName || null,
      });
      setToast?.({ message: "Compra registrada correctamente", type: "success" });
      clearDraftEntry({ silent: true });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error al registrar compra", type: "error" });
    }
  };

  const removeSelected = () => {
    if (!draft.items.length || selectedIdx < 0 || selectedIdx >= draft.items.length) return;
    setDraft((prev) => ({ ...prev, items: prev.items.filter((_, index) => index !== selectedIdx) }));
    setSelectedIdx((current) => Math.min(current, Math.max(draft.items.length - 2, 0)));
  };

  const clearDraftEntry = ({ silent = false } = {}) => {
    setDraft(buildEmptyPurchaseDraft());
    setSearch("");
    setSelectedIdx(0);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage cleanup failures; in-memory draft was already reset.
      }
    }
    if (!silent) setToast?.({ message: "Borrador de compra limpiado", type: "success" });
  };

  return (
    <div className="min-h-full md:h-full md:min-h-0 flex flex-col gap-1 overflow-visible md:overflow-hidden rounded-xl bg-[#ededee] p-1 pb-20 md:pb-1 text-zinc-900">
      <PurchaseHeader onOpenHistory={openHistory} />
      <PurchaseMetaSection draft={draft} setDraft={setDraft} supplierHasCurrentAccount={supplierHasCurrentAccount} purchaseReceiptInputRef={purchaseReceiptInputRef} handleDraftReceiptChange={handleDraftReceiptChange} setSelectedReceipt={setSelectedReceipt} />
      <PurchaseSupplierSection suppliers={suppliers} draft={draft} setDraft={setDraft} supplierSelectRef={supplierSelectRef} />
      <PurchaseItemsSection itemsPanelRef={itemsPanelRef} codeInputRef={codeInputRef} search={search} setSearch={setSearch} addCurrentSearchItem={addCurrentSearchItem} openProductSearch={openProductSearch} draft={draft} selectedIdx={selectedIdx} setSelectedIdx={setSelectedIdx} formatQuantity={formatQuantity} />
      <PurchaseSummarySection totalItems={totalItems} subtotal={subtotal} clearDraftEntry={clearDraftEntry} selectedIdx={selectedIdx} draft={draft} openSelectedCostEditor={openSelectedCostEditor} openSelectedMayoristaEditor={openSelectedMayoristaEditor} openSelectedSalePriceEditor={openSelectedSalePriceEditor} removeSelected={removeSelected} submit={submit} formatQuantity={formatQuantity} />
      <PurchaseModals
        products={products}
        showProductModal={showProductModal}
        setShowProductModal={setShowProductModal}
        restoreCodeFocusAfterModal={restoreCodeFocusAfterModal}
        addItem={addItem}
        showQtyEditModal={showQtyEditModal}
        qtyEditValue={qtyEditValue}
        setQtyEditValue={setQtyEditValue}
        setShowQtyEditModal={setShowQtyEditModal}
        applyQtyEdit={applyQtyEdit}
        showCostEditModal={showCostEditModal}
        costEditValue={costEditValue}
        setCostEditValue={setCostEditValue}
        setShowCostEditModal={setShowCostEditModal}
        applyCostEdit={applyCostEdit}
        showMayoristaEditModal={showMayoristaEditModal}
        mayoristaEditValue={mayoristaEditValue}
        setMayoristaEditValue={setMayoristaEditValue}
        setShowMayoristaEditModal={setShowMayoristaEditModal}
        applyMayoristaEdit={applyMayoristaEdit}
        showSalePriceEditModal={showSalePriceEditModal}
        salePriceEditValue={salePriceEditValue}
        setSalePriceEditValue={setSalePriceEditValue}
        setShowSalePriceEditModal={setShowSalePriceEditModal}
        applySalePriceEdit={applySalePriceEdit}
        historyReceiptInputRef={historyReceiptInputRef}
        handleHistoryReceiptChange={handleHistoryReceiptChange}
        showHistoryModal={showHistoryModal}
        setShowHistoryModal={setShowHistoryModal}
        historyLoading={historyLoading}
        historyRows={historyRows}
        setSelectedReceipt={setSelectedReceipt}
        openAttachReceipt={openAttachReceipt}
        selectedReceipt={selectedReceipt}
        closeReceipt={closeReceipt}
      />
    </div>
  );
}







