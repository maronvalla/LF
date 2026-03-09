import { useState, useEffect, useMemo, useRef } from "react";
import api, { isAndroidApk } from "../api";
import PaymentModal from "./PaymentModal";
import ProductSearchModal from "./ProductSearchModal";
import CustomerPanel from "./ventas/CustomerPanel";
import ItemsPanel from "./ventas/ItemsPanel";
import PrintPromptModal from "./ventas/PrintPromptModal";
import ConfirmModal from "./ventas/ConfirmModal";
import QtyEditModal from "./ventas/QtyEditModal";
import QuickClientModal from "./ventas/QuickClientModal";
import SalesMetaBar from "./ventas/SalesMetaBar";
import SalesSummary from "./ventas/SalesSummary";
import ClientMapPickerModal from "./clientes/ClientMapPickerModal";
import {
  DEFAULT_TICKET_CONFIG,
  getTicketContentWidthMm,
  getTicketMaxChars,
  getTicketPaperWidthMm,
  loadTicketConfig,
} from "../utils/ticketConfig";
import { DEFAULT_DELIVERY_CONDITIONS, loadDeliveryConditions } from "../utils/deliveryPaymentConditions";
import {
  DEFAULT_PRICE_LIST_KEY,
  DEFAULT_PRICE_LISTS,
  getDefaultPriceListKey,
  getPriceListLabel,
  normalizePriceListKey,
  normalizePriceListsConfig,
} from "../utils/priceLists";
import {
  DEFAULT_DELIVERY_SHIFT_CONFIG,
  getDeliveryShiftOptions,
  getScheduledDateForShift,
  getSuggestedDeliverySchedule,
  loadDeliveryShiftConfig,
} from "../utils/deliveryShiftConfig";
import { productMatchesSearch } from "../utils/productSearch";


const ROLES_VENDEDOR_HABILITADOS = ["VENDEDOR", "CAJERO", "ADMIN"];
const VENDEDOR_LOCAL_KEY = "vendedorActivoLocal";
const SELLER_SELECTION_SEPARATOR = "::";
const isTypingTarget = (target) => {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
};

const isQtyShortcut = (event) =>
  event.key === "*" || event.key === "Multiply" || event.code === "NumpadMultiply";

const isPriceShortcut = (event) =>
  event.key === "/" || event.key === "Divide" || event.code === "NumpadDivide";
const DEFAULT_MAP_CENTER = { lat: -27.432028, lng: -65.616528 };
const isPartialDeliveryCondition = (value) =>
  String(value || "").trim().toUpperCase() === "PAGO_PARCIAL";
const parseOptionalCoordinate = (value) => {
  if (value === null || value === undefined) return NaN;
  const text = String(value).trim();
  if (!text) return NaN;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
};
const getProductLocalStock = (product) => Number(product?.stock_local ?? product?.stockLocal ?? 0);
const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const getUserDisplayName = (user) =>
  String(user?.full_name || user?.fullName || user?.username || "SIN NOMBRE").trim();
const buildSellerSelectionKey = (sellerId, sellerName = "") =>
  `${String(sellerId || "")}${SELLER_SELECTION_SEPARATOR}${String(sellerName || "").trim()}`;
const parseSellerSelectionKey = (value) => {
  const [sellerId, ...rest] = String(value || "").split(SELLER_SELECTION_SEPARATOR);
  return {
    sellerId: String(sellerId || "").trim(),
    sellerName: rest.join(SELLER_SELECTION_SEPARATOR).trim(),
  };
};
const isMobileKeyboardViewport = () =>
  isAndroidApk || (typeof window !== "undefined" && window.innerWidth < 960);
const buildEmptySaleDraft = (schedule, sellerId = "", sellerName = "") => ({
  customerId: "",
  customerName: "CONSUMIDOR FINAL",
  customerPhone: "",
  sellerId: sellerId || "",
  sellerName: sellerName || "",
  paymentMethod: "EFECTIVO",
  invoiceType: "Factura B",
  items: [],
  shift: schedule.shift,
  scheduledDate: schedule.scheduledDate,
  paymentCondition: "PAGADO_LOCAL",
  deliveryAddress: "",
});

export default function Ventas({
  user,
  setToast,
  pendingOrderId = "",
  onPendingOrderHandled,
  onOrdersChanged,
}) {
  const role = String(user?.role || "").toUpperCase();
  const isSellerOnly = role === "VENDEDOR";
  const canChargeOrders = role === "ADMIN" || role === "CAJERO";
  const [activeOrderId, setActiveOrderId] = useState("");
  const readOnlyPendingOrder = Boolean(activeOrderId && canChargeOrders);
  const defaultPriceListKey = getDefaultPriceListKey({
    lists: DEFAULT_PRICE_LISTS,
    defaultKey: DEFAULT_PRICE_LIST_KEY,
  });

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [sellerAliasesByUser, setSellerAliasesByUser] = useState({});
  const [priceLists, setPriceLists] = useState(DEFAULT_PRICE_LISTS);
  const [priceListsConfig, setPriceListsConfig] = useState({
    lists: DEFAULT_PRICE_LISTS,
    defaultKey: defaultPriceListKey,
  });
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState("1");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [customerSearchOpenSignal, setCustomerSearchOpenSignal] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [loadingPendingOrder, setLoadingPendingOrder] = useState(false);
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [savingQuickClient, setSavingQuickClient] = useState(false);
  const [quickClientAddressSearch, setQuickClientAddressSearch] = useState("");
  const [quickClientAddressOptions, setQuickClientAddressOptions] = useState([]);
  const [quickClientAddressLoading, setQuickClientAddressLoading] = useState(false);
  const [quickClientAddressDropdownOpen, setQuickClientAddressDropdownOpen] = useState(false);
  const [quickClientGoogleSearchLoading, setQuickClientGoogleSearchLoading] = useState(false);
  const [showQuickClientMapPicker, setShowQuickClientMapPicker] = useState(false);
  const [quickClientMapPosition, setQuickClientMapPosition] = useState(DEFAULT_MAP_CENTER);
  const [quickClientMapResolvingAddress, setQuickClientMapResolvingAddress] = useState(false);
  const [showQtyEditModal, setShowQtyEditModal] = useState(false);
  const [showPriceEditModal, setShowPriceEditModal] = useState(false);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printPreviewLines, setPrintPreviewLines] = useState([]);
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [printPromptTitle, setPrintPromptTitle] = useState("Imprimir comprobante");
  const [ticketConfig, setTicketConfig] = useState(DEFAULT_TICKET_CONFIG);
  const [deliveryConditions, setDeliveryConditions] = useState(DEFAULT_DELIVERY_CONDITIONS);
  const [deliveryShiftConfig, setDeliveryShiftConfig] = useState(DEFAULT_DELIVERY_SHIFT_CONFIG);
  const [qtyEditValue, setQtyEditValue] = useState("");
  const [priceEditValue, setPriceEditValue] = useState("");
  const [listaActiva, setListaActiva] = useState(defaultPriceListKey);
  const [listaClienteOriginal, setListaClienteOriginal] = useState(defaultPriceListKey);
  const [cambioManualLista, setCambioManualLista] = useState(false);
  const [isDelivery, setIsDelivery] = useState(false);
  const [canOverrideLinePrice, setCanOverrideLinePrice] = useState(
    ["ADMIN", "CAJERO"].includes(role)
  );
  const [activeDeliveryPartialPlan, setActiveDeliveryPartialPlan] = useState({
    cashAmount: "",
    transferAmount: "",
  });

  const [confirmState, setConfirmState] = useState(null);
  const confirmResolverRef = useRef(null);

  const customerSelectRef = useRef(null);
  const codeInputRef = useRef(null);
  const itemsPanelRef = useRef(null);
  const printPromptResolverRef = useRef(null);
  const selectedPrinterRef = useRef("");
  const [showProductModal, setShowProductModal] = useState(false);
  const [quickClientDraft, setQuickClientDraft] = useState({
    name: "",
    phone: "",
    address: "",
    zone: "",
    notes: "",
    latitude: "",
    longitude: "",
  });

  const [draft, setDraft] = useState(
    buildEmptySaleDraft(getSuggestedDeliverySchedule(DEFAULT_DELIVERY_SHIFT_CONFIG), user?.id || "")
  );
  const hasVentasModalOpen =
    showPaymentModal ||
    loadingPendingOrder ||
    showQuickClientModal ||
    showQuickClientMapPicker ||
    showQtyEditModal ||
    showPriceEditModal ||
    showPrintPrompt ||
    showProductModal ||
    Boolean(confirmState);

  useEffect(() => {
    const load = async () => {
      try {
        const usersRequest =
          role === "ADMIN" ? api.get("/users") : Promise.resolve({ data: [] });
        const [productsRes, customersRes, usersRes, priceListsRes, sellerAliasesRes] = await Promise.allSettled([
          api.get("/products"),
          api.get("/customers"),
          usersRequest,
          api.get("/settings/price-lists"),
          api.get("/settings/seller-aliases"),
        ]);

        if (productsRes.status !== "fulfilled") {
          throw productsRes.reason;
        }

        setProducts((productsRes.value.data || []).filter((x) => x.is_active !== false));
        setCustomers(customersRes.status === "fulfilled" ? customersRes.value.data || [] : []);
        const loadedUsers = usersRes.status === "fulfilled" ? usersRes.value.data || [] : [];
        const hasCurrentUser = loadedUsers.some((row) => String(row.id) === String(user?.id || ""));
        setUsers(hasCurrentUser || !user?.id
          ? loadedUsers
          : [
            ...loadedUsers,
            {
              id: user.id,
              username: user.username,
              full_name: user.full_name || user.fullName || user.username,
              role: user.role,
              is_active: true,
            },
          ]);
        const normalizedPriceLists =
          priceListsRes.status === "fulfilled"
            ? normalizePriceListsConfig(priceListsRes.value.data)
            : { lists: DEFAULT_PRICE_LISTS, defaultKey: defaultPriceListKey };
        setPriceLists(normalizedPriceLists.lists);
        setPriceListsConfig(normalizedPriceLists);
        setSellerAliasesByUser(
          sellerAliasesRes.status === "fulfilled" && sellerAliasesRes.value.data?.aliasesByUser
            ? sellerAliasesRes.value.data.aliasesByUser
            : {}
        );

        const partialFailures = [];
        if (customersRes.status !== "fulfilled") partialFailures.push("clientes");
        if (partialFailures.length) {
          setToast?.({
            message: `Se cargaron ventas con datos parciales. Revisa ${partialFailures.join(" o ")}.`,
            type: "error",
          });
        }
      } catch {
        setToast?.({ message: "No se pudieron cargar datos de ventas", type: "error" });
      }
    };
    load();
    setTicketConfig(loadTicketConfig());
    setDeliveryConditions(loadDeliveryConditions());
    setDeliveryShiftConfig(loadDeliveryShiftConfig());
  }, [role, setToast, user]);

  useEffect(() => {
    let cancelled = false;

    const loadPriceOverridePermission = async () => {
      try {
        const { data } = await api.get("/settings/price-overrides");
        if (cancelled) return;
        const allowedIds = Array.isArray(data?.userIds) ? data.userIds.map(String) : [];
        setCanOverrideLinePrice(allowedIds.includes(String(user?.id || "")));
      } catch {
        if (cancelled) return;
        setCanOverrideLinePrice(["ADMIN", "CAJERO"].includes(role));
      }
    };

    loadPriceOverridePermission();
    return () => {
      cancelled = true;
    };
  }, [role, user?.id]);

  useEffect(() => {
    const query = quickClientAddressSearch.trim();
    if (!showQuickClientModal || !quickClientAddressDropdownOpen || query.length < 5) {
      setQuickClientAddressOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setQuickClientAddressLoading(true);
        const { data } = await api.get("/customers/address-search", { params: { q: query } });
        setQuickClientAddressOptions(Array.isArray(data) ? data : []);
      } catch {
        setQuickClientAddressOptions([]);
      } finally {
        setQuickClientAddressLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [quickClientAddressDropdownOpen, quickClientAddressSearch, showQuickClientModal]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.("[data-address-search-root='quick']")) return;
      setQuickClientAddressOptions([]);
      setQuickClientAddressDropdownOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const next = getSuggestedDeliverySchedule(deliveryShiftConfig);
    setDraft((prev) => {
      if (activeOrderId) return prev;
      if (prev.shift === next.shift && prev.scheduledDate === next.scheduledDate) return prev;
      return { ...prev, shift: next.shift, scheduledDate: next.scheduledDate };
    });
  }, [activeOrderId, deliveryShiftConfig]);

  useEffect(() => {
    if (!deliveryConditions.length) return;
    const exists = deliveryConditions.some((c) => c.value === draft.paymentCondition);
    if (!exists) {
      setDraft((prev) => ({ ...prev, paymentCondition: deliveryConditions[0].value }));
    }
  }, [deliveryConditions, draft.paymentCondition]);

  useEffect(() => {
    const fallback = getDefaultPriceListKey(priceListsConfig);
    setListaActiva((prev) => normalizarLista(prev || fallback));
    setListaClienteOriginal((prev) => normalizarLista(prev || fallback));
  }, [priceLists, priceListsConfig]);

  const resetSaleState = () => {
    const nextDefaultList = getDefaultPriceListKey(priceListsConfig);
    const persistedSeller = parseSellerSelectionKey(localStorage.getItem(VENDEDOR_LOCAL_KEY));
    const sellerId = persistedSeller.sellerId || draft.sellerId || user?.id || "";
    const sellerName = persistedSeller.sellerName || draft.sellerName || getUserDisplayName(user);
    setDraft(
      buildEmptySaleDraft(
        getSuggestedDeliverySchedule(deliveryShiftConfig),
        sellerId,
        sellerName
      )
    );
    setListaActiva(nextDefaultList);
    setListaClienteOriginal(nextDefaultList);
    setCambioManualLista(false);
    setIsDelivery(false);
    setSearch("");
    setQty("1");
    setSelectedIdx(0);
    setActiveOrderId("");
    setActiveDeliveryPartialPlan({ cashAmount: "", transferAmount: "" });
    onPendingOrderHandled?.();
  };

  const clearPendingOrderContext = () => {
    setActiveOrderId("");
    setActiveDeliveryPartialPlan({ cashAmount: "", transferAmount: "" });
    onPendingOrderHandled?.();
  };

  const handleEditActiveOrder = async () => {
    if (!activeOrderId) return;
    try {
      await api.post(`/sales/${activeOrderId}/anular`, { reason: "Editada y reemplazada desde caja" });
      clearPendingOrderContext();
      setToast?.({ message: "Orden desbloqueada para edición", type: "success" });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "No se pudo desbloquear la orden", type: "error" });
    }
  };

  const openCustomerSearch = () => {
    if (hasVentasModalOpen) return;
    customerSelectRef.current?.focus();
    setCustomerSearchOpenSignal((prev) => prev + 1);
  };

  const focusCodeSearch = () => {
    if (hasVentasModalOpen) return;
    codeInputRef.current?.focus();
  };

  const restoreCodeFocusAfterModal = () => {
    if (isMobileKeyboardViewport()) return;
    window.setTimeout(() => focusCodeSearch(), 50);
  };

  const revealItemsForMobile = () => {
    if (!isMobileKeyboardViewport()) return;
    if (typeof document !== "undefined" && typeof document.activeElement?.blur === "function") {
      document.activeElement.blur();
    }
    codeInputRef.current?.blur?.();
    window.setTimeout(() => {
      itemsPanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 90);
  };

  const openProductSearch = () => {
    if (hasVentasModalOpen || readOnlyPendingOrder) return;
    setShowProductModal(true);
  };

  const openQtyEditorForSelection = () => {
    if (hasVentasModalOpen || readOnlyPendingOrder) return;
    const currentItem = draft.items[selectedIdx];
    if (!currentItem) return;
    setQtyEditValue(String(currentItem.qty || 1));
    setShowQtyEditModal(true);
  };

  const openPriceEditorForSelection = () => {
    if (hasVentasModalOpen || readOnlyPendingOrder || !canOverrideLinePrice) return;
    const currentItem = draft.items[selectedIdx];
    if (!currentItem) return;
    setPriceEditValue(String(currentItem.unitPrice || 0));
    setShowPriceEditModal(true);
  };

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

  const removeSelectedItem = async () => {
    if (readOnlyPendingOrder) return;
    if (!draft.items.length) return;
    const confirmed = await showConfirm("¿Seguro que quieres borrar el producto seleccionado?");
    if (!confirmed) return;
    clearPendingOrderContext();
    const nextLength = draft.items.length - 1;
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((_, index) => index !== selectedIdx),
    }));
    setSelectedIdx((index) => Math.max(0, Math.min(index - 1, Math.max(0, nextLength - 1))));
  };

  const loadPendingOrder = async (orderId) => {
    if (!orderId || !canChargeOrders) return;
    try {
      setLoadingPendingOrder(true);
      const { data } = await api.get(`/sales/${orderId}`);
      const items = Array.isArray(data?.items)
        ? data.items.map((item) => ({
          productId: item.product_id,
          codigo: item.product_sku || item.product_id,
          name: item.product_name,
          qty: Number(item.qty || 0),
          unitPrice: Number(item.unit_price || 0),
          discount: 0,
        }))
        : [];
      const customerName =
        String(data?.customer_name || data?.customer_name_snapshot || "").trim() ||
        "CONSUMIDOR FINAL";
      const customerId = data?.customer_id || "";
      const customer = customers.find((row) => row.id === customerId);
      const customerList = normalizarLista(
        customer?.preferred_price_list || customer?.preferredPriceList || getDefaultPriceListKey(priceListsConfig)
      );

      const isPartialDeliveryOrder =
        String(data?.sale_type || "").toUpperCase() === "ENVIO" &&
        isPartialDeliveryCondition(data?.payment_condition || data?.delivery_payment);
      const expectedCashAmount = Number(data?.delivery_expected_cash_amount || 0);
      const expectedTransferAmount = Number(data?.delivery_expected_transfer_amount || 0);

      setDraft({
        customerId,
        customerName,
        customerPhone: customer?.phone || "",
        sellerId: data?.created_by || draft.sellerId || user?.id || "",
        sellerName: String(data?.created_by_name || draft.sellerName || getUserDisplayName(user)).trim(),
        paymentMethod: "EFECTIVO",
        invoiceType: data?.invoice_type || draft.invoiceType || "Factura B",
        items,
        shift: data?.shift || getSuggestedDeliverySchedule(deliveryShiftConfig).shift,
        scheduledDate:
          data?.scheduled_date || getSuggestedDeliverySchedule(deliveryShiftConfig).scheduledDate,
        paymentCondition: data?.payment_condition || "PAGADO_LOCAL",
        deliveryAddress: data?.delivery_address || "",
      });
      setActiveDeliveryPartialPlan({
        cashAmount: expectedCashAmount > 0 ? String(expectedCashAmount) : "",
        transferAmount: expectedTransferAmount > 0 ? String(expectedTransferAmount) : "",
      });
      setListaActiva(customerList);
      setListaClienteOriginal(customerList);
      setCambioManualLista(false);
      setIsDelivery(String(data?.sale_type || "").toUpperCase() === "ENVIO");
      setActiveOrderId(orderId);
      setSelectedIdx(0);
      setShowPaymentModal(false);
      setToast?.({
        message: isPartialDeliveryOrder
          ? "Orden cargada para definir pago parcial"
          : "Orden cargada para cobro",
        type: "success",
      });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo abrir la orden pendiente",
        type: "error",
      });
    } finally {
      setLoadingPendingOrder(false);
      onPendingOrderHandled?.();
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (hasVentasModalOpen) return;
      const typing = isTypingTarget(e.target);
      const qtyShortcut = isQtyShortcut(e);
      const priceShortcut = isPriceShortcut(e);
      const customerShortcut = e.key === "F3";
      const productShortcut = e.key === "F5";
      const focusSearchShortcut = e.key === "Enter";
      const removeShortcut =
        (e.ctrlKey || e.metaKey) && String(e.key || "").toLowerCase() === "x";
      const deliveryShortcut =
        (e.ctrlKey || e.metaKey) && String(e.key || "").toLowerCase() === "e";

      if (
        typing &&
        !qtyShortcut &&
        !priceShortcut &&
        !customerShortcut &&
        !productShortcut &&
        !focusSearchShortcut &&
        !removeShortcut &&
        !deliveryShortcut
      ) {
        return;
      }

      if (focusSearchShortcut && !typing) {
        e.preventDefault();
        if (draft.items.length > 0) {
          triggerPrimarySalesAction();
        } else {
          focusCodeSearch();
        }
      }
      if (customerShortcut) {
        e.preventDefault();
        openCustomerSearch();
      }
      if (productShortcut) {
        e.preventDefault();
        openProductSearch();
      }
      if (removeShortcut) {
        e.preventDefault();
        removeSelectedItem();
      }
      if (deliveryShortcut) {
        e.preventDefault();
        handleToggleDelivery();
      }
      if (qtyShortcut) {
        e.preventDefault();
        openQtyEditorForSelection();
      }
      if (priceShortcut && canOverrideLinePrice) {
        e.preventDefault();
        openPriceEditorForSelection();
      }
      if (!typing && (e.key === "ArrowDown" || e.key === "ArrowUp") && draft.items.length > 0) {
        e.preventDefault();
        setSelectedIdx((i) =>
          e.key === "ArrowDown"
            ? Math.min(i + 1, draft.items.length - 1)
            : Math.max(i - 1, 0)
        );
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    canOverrideLinePrice,
    draft.items,
    hasVentasModalOpen,
    readOnlyPendingOrder,
    selectedIdx,
  ]);

  useEffect(() => {
    const onEscape = async (event) => {
      if (event.key !== "Escape") return;
      if (hasVentasModalOpen) return;
      if (isTypingTarget(event.target)) {
        event.preventDefault();
        event.target.blur();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (draft.items.length > 0) {
        const confirmed = await showConfirm("Hay productos cargados.\n¿Seguro que quieres salir?");
        if (!confirmed) return;
      }
      window.dispatchEvent(new CustomEvent("app:navigate-dashboard"));
    };

    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [draft.items.length, hasVentasModalOpen]);


  useEffect(() => {
    if (!pendingOrderId || !canChargeOrders) return;
    loadPendingOrder(pendingOrderId);
  }, [canChargeOrders, pendingOrderId, customers, priceListsConfig]);

  const applyQtyEdit = () => {
    const parsed = Number(qtyEditValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setToast?.({ message: "Cantidad invalida", type: "error" });
      return;
    }
    setDraft((prev) => {
      const currentIdx = selectedIdx;
      if (currentIdx < 0 || currentIdx >= prev.items.length) return prev;
      const next = [...prev.items];
      next[currentIdx] = { ...next[currentIdx], qty: Number(parsed) };
      return { ...prev, items: next };
    });
    setShowQtyEditModal(false);
  };

  const applyPriceEdit = () => {
    const parsed = Number(priceEditValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setToast?.({ message: "Precio invalido", type: "error" });
      return;
    }
    setDraft((prev) => {
      const currentIdx = selectedIdx;
      if (currentIdx < 0 || currentIdx >= prev.items.length) return prev;
      const next = [...prev.items];
      next[currentIdx] = { ...next[currentIdx], unitPrice: Number(parsed) };
      return { ...prev, items: next };
    });
    setShowPriceEditModal(false);
  };

  const askPrintConfirmation = (lines, title = "Imprimir comprobante") =>
    new Promise(async (resolve) => {
      printPromptResolverRef.current = resolve;
      setPrintPreviewLines(Array.isArray(lines) ? lines : []);
      setPrintPromptTitle(title);
      try {
        const printerApi = window?.desktopEnv?.listPrinters;
        if (typeof printerApi === "function") {
          const printers = (await printerApi()) || [];
          setAvailablePrinters(printers);
          const xp58 = printers.find((p) => /xp-?58/i.test(String(p.name || p.displayName || "")));
          setSelectedPrinter(xp58?.name || printers[0]?.name || "");
        } else {
          setAvailablePrinters([]);
          setSelectedPrinter("");
        }
      } catch {
        setAvailablePrinters([]);
        setSelectedPrinter("");
      }
      setShowPrintPrompt(true);
    });

  // Keep ref always current so stale closures (e.g. keyboard handler) read the latest printer.
  selectedPrinterRef.current = selectedPrinter;

  const resolvePrintConfirmation = (value) => {
    const resolver = printPromptResolverRef.current;
    printPromptResolverRef.current = null;
    setShowPrintPrompt(false);
    if (typeof resolver === "function") {
      resolver({ shouldPrint: Boolean(value), deviceName: selectedPrinterRef.current || undefined });
    }
  };

  useEffect(() => {
    if (!showPrintPrompt) return undefined;
    const onKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;
      const key = String(e.key || "").toLowerCase();
      if (key === "y" || key === "enter") {
        e.preventDefault();
        resolvePrintConfirmation(true);
      } else if (key === "n" || key === "escape") {
        e.preventDefault();
        resolvePrintConfirmation(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showPrintPrompt]);

  useEffect(() => {
    return () => {
      if (printPromptResolverRef.current) {
        printPromptResolverRef.current(false);
        printPromptResolverRef.current = null;
      }
    };
  }, []);

  const normalizarLista = (lista) => {
    const normalized = normalizePriceListKey(lista);
    const available = priceLists.map((row) => row.key);
    return available.includes(normalized) ? normalized : getDefaultPriceListKey(priceListsConfig);
  };

  const obtenerPrecioPorLista = (product, lista) => {
    if (!product) return 0;
    const priceMap = product.price_lists || product.priceLists || {};
    const normalized = normalizarLista(lista);
    const explicit = Number(priceMap?.[normalized]);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    if (normalized === "MAYORISTA") {
      const mayorista = Number(product.price_mayorista || product.priceMayorista || 0);
      const minorista = Number(product.price_minorista || product.priceMinorista || 0);
      return mayorista > 0 ? mayorista : minorista;
    }
    return Number(product.price_minorista || product.priceMinorista || 0);
  };

  const actualizarPerfilCliente = async (clienteId, nuevaLista) => {
    if (!clienteId) return;
    const cliente = customers.find((c) => c.id === clienteId);
    if (!cliente) return;

    try {
      await api.put(`/customers/${clienteId}`, {
        name: cliente.name,
        phone: cliente.phone || "",
        address: cliente.address || "",
        zone: cliente.zone || "",
        notes: cliente.notes || "",
        preferredPriceList: normalizarLista(nuevaLista),
      });
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === clienteId ? { ...c, preferred_price_list: normalizarLista(nuevaLista) } : c
        )
      );
    } catch {
      setToast?.({
        message: "No se pudo guardar la lista predeterminada del cliente",
        type: "error",
      });
    }
  };

  const handleCambioLista = (nuevaLista) => {
    const listaNormalizada = normalizarLista(nuevaLista);
    setListaActiva(listaNormalizada);
    setDraft((prev) => {
      const hayClienteRegistrado = Boolean(prev.customerId);
      setCambioManualLista(hayClienteRegistrado && listaNormalizada !== listaClienteOriginal);
      return {
        ...prev,
        items: prev.items.map((item) => {
          const product = products.find((p) => p.id === item.productId);
          if (!product) return item;
          return { ...item, unitPrice: obtenerPrecioPorLista(product, listaNormalizada) };
        }),
      };
    });
  };

  const vendedoresActivos = useMemo(() => {
    return (users || []).filter((u) => {
      const role = String(u.role || "").toUpperCase();
      const isActive = u.is_active !== false;
      return isActive && ROLES_VENDEDOR_HABILITADOS.includes(role);
    });
  }, [users]);

  const sellerOptions = useMemo(() => {
    const currentUserId = String(user?.id || "");
    const currentUser =
      vendedoresActivos.find((seller) => String(seller.id) === currentUserId) || user || null;
    if (!currentUserId || !currentUser) return [];

    const aliases = Array.isArray(sellerAliasesByUser?.[currentUserId])
      ? sellerAliasesByUser[currentUserId]
      : [];
    const labels = aliases.length ? aliases : [getUserDisplayName(currentUser)];

    return labels.map((label) => {
      const sellerName = String(label || "").trim() || getUserDisplayName(currentUser);
      return {
        key: buildSellerSelectionKey(currentUserId, sellerName),
        sellerId: currentUserId,
        sellerName,
        label: sellerName,
      };
    });
  }, [sellerAliasesByUser, user, vendedoresActivos]);

  const setVendedorActual = (selectionKey) => {
    const { sellerId, sellerName } = parseSellerSelectionKey(selectionKey);
    if (!sellerId) return;
    setDraft((prev) => ({ ...prev, sellerId, sellerName }));
    localStorage.setItem(VENDEDOR_LOCAL_KEY, buildSellerSelectionKey(sellerId, sellerName));
  };

  const selectedSellerOption = useMemo(() => {
    const currentKey = buildSellerSelectionKey(draft.sellerId, draft.sellerName);
    if (sellerOptions.some((option) => option.key === currentKey)) return currentKey;
    return sellerOptions[0]?.key || "";
  }, [draft.sellerId, draft.sellerName, sellerOptions]);

  useEffect(() => {
    if (!sellerOptions.length) return;
    const persistedSelection = localStorage.getItem(VENDEDOR_LOCAL_KEY);
    const currentSelection = buildSellerSelectionKey(draft.sellerId, draft.sellerName);
    const findOption = (selectionKey) => sellerOptions.find((option) => option.key === selectionKey);
    const fallbackOption =
      sellerOptions.find((option) => String(option.sellerId) === String(user?.id || "")) || sellerOptions[0];
    const initialOption = findOption(currentSelection) || findOption(persistedSelection) || fallbackOption;
    if (!findOption(persistedSelection)) localStorage.removeItem(VENDEDOR_LOCAL_KEY);
    setDraft((prev) =>
      prev.sellerId === initialOption.sellerId && prev.sellerName === initialOption.sellerName
        ? prev
        : { ...prev, sellerId: initialOption.sellerId, sellerName: initialOption.sellerName }
    );
    localStorage.setItem(VENDEDOR_LOCAL_KEY, initialOption.key);
  }, [draft.sellerId, draft.sellerName, sellerOptions, user?.id]);

  const subtotal = useMemo(
    () => draft.items.reduce((acc, i) => acc + Number(i.qty) * Number(i.unitPrice), 0),
    [draft.items]
  );
  const isActivePartialDeliveryOrder = Boolean(
    activeOrderId &&
      readOnlyPendingOrder &&
      isDelivery &&
      isPartialDeliveryCondition(draft.paymentCondition)
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    const normalizedQuery = normalizeSearchText(q);
    return products
      .filter((p) => productMatchesSearch(p, q))
      .sort((a, b) => {
        const aStock = getProductLocalStock(a);
        const bStock = getProductLocalStock(b);
        const aAvailable = aStock > 0 ? 1 : 0;
        const bAvailable = bStock > 0 ? 1 : 0;
        if (aAvailable !== bAvailable) return bAvailable - aAvailable;

        const aName = normalizeSearchText(a.name);
        const bName = normalizeSearchText(b.name);
        const aStartsWithName = aName.startsWith(normalizedQuery) ? 1 : 0;
        const bStartsWithName = bName.startsWith(normalizedQuery) ? 1 : 0;
        if (aStartsWithName !== bStartsWithName) return bStartsWithName - aStartsWithName;

        const aIncludesName = aName.includes(normalizedQuery) ? 1 : 0;
        const bIncludesName = bName.includes(normalizedQuery) ? 1 : 0;
        if (aIncludesName !== bIncludesName) return bIncludesName - aIncludesName;

        return aName.localeCompare(bName);
      })
      .slice(0, 20);
  }, [products, search]);

  const addItem = (product) => {
    if (readOnlyPendingOrder) return;
    clearPendingOrderContext();
    const qtyToAdd = Number(String(qty || "1").replace(",", ".")) || 1;
    const availableStock = getProductLocalStock(product);
    const existingQty = Number(
      draft.items.find((item) => item.productId === product.id)?.qty || 0
    );
    if (existingQty + qtyToAdd > availableStock) {
      setToast?.({
        message: `Stock insuficiente. Disponible: ${availableStock}`,
        type: "error",
      });
      return;
    }

    const existingIndex = draft.items.findIndex((item) => item.productId === product.id);

    setDraft((prev) => {
      const idx = prev.items.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        const next = [...prev.items];
        next[idx] = { ...next[idx], qty: Number(next[idx].qty) + qtyToAdd };
        return { ...prev, items: next };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            productId: product.id,
            codigo: product.codigo || product.sku,
            name: product.name,
            qty: qtyToAdd,
            unitPrice: obtenerPrecioPorLista(product, listaActiva),
            discount: 0,
          },
        ],
      };
    });
    setSelectedIdx(existingIndex >= 0 ? existingIndex : draft.items.length);
    setSearch("");
    setQty("1");
    revealItemsForMobile();
  };

  const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

  const buildTicketLines = ({ saleData, paymentData }, opts = {}) => {
    const MAX = getTicketMaxChars(ticketConfig);
    const separatorLength = (() => {
      const size = Number(ticketConfig.fontSize || 15);
      if (size >= 30) return Math.min(MAX, 12);
      if (size >= 26) return Math.min(MAX, 14);
      if (size >= 22) return Math.min(MAX, 18);
      if (size >= 18) return Math.min(MAX, 24);
      return MAX;
    })();
    const docLabel = opts.docLabel || draft.invoiceType || "Factura B";
    const includePayment = opts.includePayment !== false;
    const budgetNotice = Boolean(opts.budgetNotice);
    const repeat = (char, len) => new Array(Math.max(0, len) + 1).join(char);
    const center = (text) => {
      const t = String(text || "").slice(0, MAX);
      const left = Math.max(0, Math.floor((MAX - t.length) / 2));
      return `${repeat(" ", left)}${t}`;
    };
    const leftRight = (left, right) => {
      return `${String(left || "")}\x1e${String(right || "")}`;
    };

    const now = new Date();
    const saleNumber = opts.ticketNumberOverride || saleData?.sale_number || saleData?.number || saleData?.id || "S/N";
    const sellerLabel = String(
      draft.sellerName || getUserDisplayName(vendedoresActivos.find((u) => u.id === draft.sellerId)) || user?.username || "N/A"
    ).toUpperCase();
    const paymentMethod = String(paymentData?.paymentMethod || "EFECTIVO").toUpperCase();

    const formatDate = now.toLocaleDateString("es-AR");
    const formatTime = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const ticketNumber = String(saleNumber);
    const customerLabel = String(draft.customerName || "CONSUMIDOR FINAL");

    const templateVars = {
      cliente: customerLabel,
      vendedor: sellerLabel,
      ticket: ticketNumber,
      fecha: formatDate,
      hora: formatTime,
      total: formatMoney(subtotal),
      pago: paymentMethod,
      tipo: docLabel,
    };

    const applyTemplate = (line) =>
      String(line || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => templateVars[key] ?? "");
    const formatCustomLine = (line) => {
      const rendered = applyTemplate(line);
      if (!rendered) return "";
      if (/^\[C\]\s*/i.test(rendered)) {
        return center(rendered.replace(/^\[C\]\s*/i, ""));
      }
      return rendered.slice(0, MAX);
    };

    const lines = [];
    if (ticketConfig.businessName) lines.push(center(ticketConfig.businessName));
    if (ticketConfig.addressLine) lines.push(center(ticketConfig.addressLine));
    if (ticketConfig.cityLine) lines.push(center(ticketConfig.cityLine));
    lines.push(repeat("-", separatorLength));
    if (ticketConfig.includeComprobante) lines.push(leftRight("Comprobante", docLabel));
    if (ticketConfig.includeTicketNumber) lines.push(leftRight("Ticket", ticketNumber));
    if (ticketConfig.includeDate) lines.push(leftRight("Fecha", formatDate));
    if (ticketConfig.includeTime) lines.push(leftRight("Hora", formatTime));
    if (ticketConfig.includeSeller) lines.push(leftRight("Vendedor", sellerLabel.slice(0, 16)));
    lines.push(repeat("-", separatorLength));
    if (ticketConfig.includeClient) {
      lines.push(`Cliente: ${customerLabel.slice(0, MAX - 9)}`);
      lines.push(repeat("-", separatorLength));
    }
    const totalQty = draft.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    draft.items.forEach((item, index) => {
      const qtyNum = Number(item.qty || 0);
      const qtyLabel = Number.isInteger(qtyNum) ? String(qtyNum) : qtyNum.toFixed(3).replace(/\.?0+$/, "");
      const unitPrice = Number(item.unitPrice || 0);
      const lineTotal = Number(item.qty || 0) * unitPrice;
      const itemName = String(item.name || "").toUpperCase();

      lines.push(leftRight(`${qtyLabel} x ${formatMoney(unitPrice)}`, formatMoney(lineTotal)));
      lines.push(itemName);

      if (ticketConfig.includeItemSeparators && index < draft.items.length - 1) {
        lines.push(repeat(".", Math.min(MAX, 20)));
      }
    });

    lines.push(repeat("-", separatorLength));
    lines.push(`Total: ${formatMoney(subtotal)}`);
    const totalQtyLabel = Number.isInteger(totalQty) ? String(totalQty) : totalQty.toFixed(3).replace(/\.?0+$/, "");
    lines.push(`Cantidad total: ${totalQtyLabel}`);
    if (ticketConfig.includePaymentDetail && includePayment) {
      lines.push(leftRight("Pago", paymentMethod));
      if (paymentMethod === "MIXTO") {
        lines.push(leftRight("Efectivo", formatMoney(paymentData?.cashAmount)));
        lines.push(leftRight("Transfer.", formatMoney(paymentData?.transferAmount)));
      }
    }

    const customLines = Array.isArray(ticketConfig.customLines) ? ticketConfig.customLines : [];
    if (customLines.length) {
      lines.push(repeat("-", separatorLength));
      customLines.forEach((line) => {
        const rendered = formatCustomLine(line);
        if (rendered) lines.push(rendered.slice(0, MAX));
      });
    }

    if (budgetNotice) {
      lines.push(repeat("-", separatorLength));
      lines.push(center("PRESUPUESTO SIN VALIDEZ FISCAL"));
    }
    lines.push(repeat("-", separatorLength));
    if (ticketConfig.footerText) lines.push(center(ticketConfig.footerText));
    lines.push("");
    lines.push("");
    lines.push("");
    return lines;
  };

  const printReceipt = async ({ lines, deviceName }) => {
    const ticket = {
      lines: Array.isArray(lines) ? lines : [],
      logoDataUrl: ticketConfig.logoDataUrl || "",
      fontSize: Number(ticketConfig.fontSize || 15),
      paperWidthMm: getTicketPaperWidthMm(ticketConfig),
      contentWidthMm: getTicketContentWidthMm(ticketConfig),
      marginLeftMm: Number(ticketConfig.marginLeftMm ?? 3) || 3,
    };
    const canUseElectronPrinter =
      typeof window !== "undefined" &&
      window.desktopEnv &&
      typeof window.desktopEnv.printTicket === "function";

    if (canUseElectronPrinter) {
      try {
        await window.desktopEnv.printTicket({ ticket, deviceName });
        return;
      } catch (err) {
        const msg = String(err?.message || err || "");
        if (!/No handler registered for 'ticket:print'/i.test(msg)) {
          throw err;
        }
      }
    }

    const printable = window.open("", "_blank", "width=420,height=900");
    if (!printable) throw new Error("No se pudo abrir ventana de impresion");
    printable.document.write(`
      <html><head><title>Ticket</title><style>
      @page { size: ${getTicketPaperWidthMm(ticketConfig)}mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; width: ${getTicketPaperWidthMm(ticketConfig)}mm; background: #fff; color: #000; box-sizing: border-box; overflow: hidden; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: ${Math.min(32, Math.max(9, Number(ticketConfig.fontSize || 15) || 15))}px; line-height: 1.18; font-weight: 600; padding: 1.6mm 0 2mm 1.6mm; box-sizing: border-box; }
      .ticket { width: ${getTicketContentWidthMm(ticketConfig)}mm; max-width: ${getTicketContentWidthMm(ticketConfig)}mm; padding: 0.8mm 0 0.4mm; box-sizing: border-box; }
      .logo-wrap { text-align: center; margin-bottom: 1.8mm; }
      .logo { max-width: 24mm; max-height: 12mm; width: auto; height: auto; filter: grayscale(1) contrast(1.35); }
      .line { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; margin: 0 0 0.55mm; }
      .line.center { text-align: center; }
      .line.title { font-weight: 900; font-size: 1.15em; text-align: center; margin-bottom: 0.5mm; }
      </style></head><body>
      <div class="ticket">
      ${ticket.logoDataUrl ? `<div class="logo-wrap"><img class="logo" src="${ticket.logoDataUrl}" alt="Logo" /></div>` : ""}
      ${ticket.lines.map((line) => {
      const raw = String(line || "");
      const isCenter = raw.match(/^\s+/) !== null;
      const text = raw.replace(/</g, "&lt;").trim() || "&nbsp;";
      let cls = "line";
      if (text === "DISTRIBUIDORA LA FAMILIA" || text === "BOLETA DE CONSOLIDADO") cls += " title";
      else if (isCenter) cls += " center";
      return `<div class="${cls}">${text}</div>`;
    }).join("")}
      </div>
      </body></html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
    printable.close();
  };

  const buildSalePayload = () => {
    if (!draft.items.length) {
      throw new Error("Venta vacia");
    }
    if (isDelivery && !String(draft.deliveryAddress || "").trim()) {
      throw new Error("Para envio la direccion es obligatoria");
    }
    if (!String(draft.customerName || "").trim()) {
      throw new Error(
        isDelivery
          ? "Ingresa al menos un nombre para el envio"
          : "Ingresa un nombre para el cliente de mostrador"
      );
    }
    if (!isDelivery && !draft.customerId && !String(draft.customerName || "").trim()) {
      throw new Error("Ingresa un nombre para el cliente de mostrador");
    }

    const persistedSeller = parseSellerSelectionKey(localStorage.getItem(VENDEDOR_LOCAL_KEY));
    const vendedorId = draft.sellerId || persistedSeller.sellerId || user.id;
    const sellerName = String(
      draft.sellerName || persistedSeller.sellerName || getUserDisplayName(user)
    ).trim();
    const selectedCondition = String(draft.paymentCondition || "PAGADO_LOCAL").toUpperCase();

    return {
      ...draft,
      sellerId: vendedorId,
      vendedorId,
      sellerName,
      sellerNameSnapshot: sellerName,
      customerId: draft.customerId || null,
      customerName: String(draft.customerName || "").trim() || "CONSUMIDOR FINAL",
      invoiceType: String(draft.invoiceType || "Factura B").trim() || "Factura B",
      items: draft.items.map((i) => ({
        productId: i.productId,
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
      })),
      saleType: isDelivery ? "ENVIO" : "MOSTRADOR",
      shift: isDelivery ? draft.shift : null,
      scheduledDate: isDelivery ? draft.scheduledDate : undefined,
      paymentCondition: isDelivery ? selectedCondition : null,
      deliveryAddress: isDelivery ? draft.deliveryAddress : null,
    };
  };

  const persistCustomerPriceListChange = async () => {
    if (!draft.customerId || !cambioManualLista || listaActiva === listaClienteOriginal) return;
    const confirmed = await showConfirm(
      `Lista cambiada a ${getPriceListLabel(priceLists, listaActiva)}.\n¿Guardar como predeterminada para ${draft.customerName}?`
    );
    if (confirmed) {
      await actualizarPerfilCliente(draft.customerId, listaActiva);
    }
  };

  const submitOrderOnly = async () => {
    try {
      const payload = {
        ...buildSalePayload(),
        paymentMethod: null,
      };
      const { data } = await api.post("/sales", payload);
      await persistCustomerPriceListChange();
      setToast?.({
        message: `Orden enviada a caja para ${data?.customer_name_snapshot || payload.customerName}`,
        type: "success",
      });
      resetSaleState();
      onOrdersChanged?.();
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || err.message || "Error al guardar", type: "error" });
    }
  };

  const confirmAndSubmitOrderOnly = async () => {
    const confirmed = await showConfirm("¿Seguro que desea enviar la orden?");
    if (!confirmed) return;
    await submitOrderOnly();
  };

  const openPaymentFlow = () => {
    if (!draft.items.length) {
      focusCodeSearch();
      return;
    }
    setShowPaymentModal(true);
  };

  const triggerPrimarySalesAction = () => {
    if (isSellerOnly) {
      return confirmAndSubmitOrderOnly();
    }
    openPaymentFlow();
    return undefined;
  };

  const submit = async (paymentData) => {
    try {
      if (isActivePartialDeliveryOrder) {
        await api.post(`/sales/${activeOrderId}/delivery-payment-plan`, {
          paymentMethod: paymentData.paymentMethod,
          cashAmount: Number(paymentData.cashAmount || 0),
          transferAmount: Number(paymentData.transferAmount || 0),
        });
        setShowPaymentModal(false);
        setToast?.({ message: "Pago parcial registrado para el envio", type: "success" });
        resetSaleState();
        onOrdersChanged?.();
        return;
      }

      const payload = buildSalePayload();
      const orderResponse = activeOrderId
        ? { data: { id: activeOrderId } }
        : await api.post("/sales", {
          ...payload,
          paymentMethod: null,
        });
      const checkoutResponse = await api.post(`/sales/${orderResponse.data.id}/checkout`, {
        paymentMethod: paymentData.paymentMethod,
        customerId: payload.customerId,
        customerName: payload.customerName,
        notes: payload.notes || null,
        cashAmount: Number(paymentData.cashAmount || 0),
        transferAmount: Number(paymentData.transferAmount || 0),
        proofImageBase64: paymentData.proofImageBase64 || "",
        proofImageMimeType: paymentData.proofImageMimeType || "",
        proofImageName: paymentData.proofImageName || "",
      });

      const lines = buildTicketLines(
        { saleData: checkoutResponse?.data, paymentData },
        { docLabel: draft.invoiceType || "Factura B" }
      );
      setShowPaymentModal(false);
      const printDecision = await askPrintConfirmation(lines, "Imprimir comprobante");
      if (printDecision?.shouldPrint) {
        try {
          await printReceipt({ lines, deviceName: printDecision?.deviceName });
        } catch (printError) {
          console.error("No se pudo imprimir ticket:", printError);
          setToast?.({
            message: "Venta guardada. No se pudo imprimir el comprobante.",
            type: "error",
          });
        }
      }

      await persistCustomerPriceListChange();
      setToast?.({ message: "Venta confirmada", type: "success" });
      resetSaleState();
      onOrdersChanged?.();
    } catch (err) {
      if (
        activeOrderId &&
        /la orden ya fue cobrada/i.test(String(err?.response?.data?.message || err?.message || ""))
      ) {
        clearPendingOrderContext();
      }
      setToast?.({ message: err.response?.data?.message || err.message || "Error al guardar", type: "error" });
    }
  };

  const submitBudget = async () => {
    if (!draft.items.length) {
      setToast?.({ message: "Presupuesto vacio", type: "error" });
      return;
    }
    if (isDelivery && !String(draft.deliveryAddress || "").trim()) {
      setToast?.({ message: "Para envio la direccion es obligatoria", type: "error" });
      return;
    }
    if (!String(draft.customerName || "").trim()) {
      setToast?.({
        message: isDelivery
          ? "Ingresa al menos un nombre para el envio"
          : "Ingresa un nombre para el cliente del presupuesto",
        type: "error",
      });
      return;
    }
    if (!String(draft.customerPhone || "").trim()) {
      setToast?.({
        message: "El celular es obligatorio para redactar un presupuesto",
        type: "error",
      });
      return;
    }

    const now = new Date();
    const budgetNumber = `PRES-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate()
    ).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    try {
      await api.post("/sales/budgets", {
        customerId: draft.customerId || null,
        customerName: String(draft.customerName || "").trim(),
        customerPhone: String(draft.customerPhone || "").trim(),
        sellerName: String(draft.sellerName || "").trim() || null,
        saleType: isDelivery ? "ENVIO" : "MOSTRADOR",
        shift: isDelivery ? draft.shift || null : null,
        scheduledDate: isDelivery ? draft.scheduledDate || null : null,
        deliveryAddress: isDelivery ? String(draft.deliveryAddress || "").trim() || null : null,
        notes: null,
        budgetNumber,
        invoiceType: draft.invoiceType || "Presupuesto",
        items: draft.items.map((item) => ({
          productId: item.productId,
          qty: Number(item.qty || 0),
          unitPrice: Number(item.unitPrice || 0),
        })),
      });

      const lines = buildTicketLines(
        { saleData: { sale_number: budgetNumber }, paymentData: {} },
        {
          docLabel: draft.invoiceType || "PRESUPUESTO",
          includePayment: false,
          ticketNumberOverride: budgetNumber,
          budgetNotice: true,
        }
      );

      const printDecision = await askPrintConfirmation(lines, "Imprimir presupuesto");
      if (printDecision?.shouldPrint) {
        try {
          await printReceipt({ lines, deviceName: printDecision?.deviceName });
        } catch (printError) {
          console.error("No se pudo imprimir presupuesto:", printError);
          setToast?.({
            message: "Presupuesto guardado. No se pudo imprimir.",
            type: "error",
          });
          return;
        }
      }

      setToast?.({ message: "Presupuesto generado y prospecto actualizado", type: "success" });
      resetSaleState();
      setDeliveryConditions(loadDeliveryConditions());
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo guardar el presupuesto",
        type: "error",
      });
    }
  };

  const createQuickClient = async () => {
    const name = String(quickClientDraft.name || "").trim();
    if (!name) {
      setToast?.({ message: "El nombre del cliente es obligatorio", type: "error" });
      return;
    }

    setSavingQuickClient(true);
    try {
      const payload = {
        name,
        phone: String(quickClientDraft.phone || "").trim() || null,
        address: String(quickClientDraft.address || "").trim() || null,
        zone: String(quickClientDraft.zone || "").trim() || null,
        notes: String(quickClientDraft.notes || "").trim() || null,
        latitude: quickClientDraft.latitude === "" ? null : Number(quickClientDraft.latitude),
        longitude: quickClientDraft.longitude === "" ? null : Number(quickClientDraft.longitude),
        preferredPriceList: listaActiva,
      };

      const { data: prospectMatch } = await api
        .get("/customers/prospect-match", { params: { name } })
        .catch(() => ({ data: null }));

      if (prospectMatch?.id) {
        const suggestedPhone = String(
          payload.phone || prospectMatch.customer_phone || prospectMatch.phone || ""
        ).trim();
        const confirmed = await showConfirm(
          `Se encontro un prospecto por presupuesto: ${prospectMatch.name}. ` +
            `Ultimo presupuesto: ${prospectMatch.budget_number || "N/A"}. ` +
            `Celular sugerido: ${suggestedPhone || "sin celular"}. ` +
            `Quieres usar ese prospecto como este cliente?`
        );

        if (confirmed) {
          payload.phone = suggestedPhone || null;
          payload.prospectMatchCustomerId = prospectMatch.id;
          setQuickClientDraft((prev) => ({ ...prev, phone: suggestedPhone }));
        }
      }

      const { data } = await api.post("/customers", payload);

      setCustomers((prev) => [data, ...prev]);
      setDraft((prev) => ({
        ...prev,
        customerId: data.id,
        customerName: data.name || name,
        deliveryAddress: data.address || prev.deliveryAddress,
      }));

      const listaCliente = normalizarLista(data?.preferred_price_list || data?.preferredPriceList);
      setListaClienteOriginal(listaCliente);
      setCambioManualLista(false);
      handleCambioLista(listaCliente);

      setQuickClientDraft({
        name: "",
        phone: "",
        address: "",
        zone: "",
        notes: "",
        latitude: "",
        longitude: "",
      });
      setQuickClientAddressSearch("");
      setQuickClientAddressOptions([]);
      setQuickClientAddressDropdownOpen(false);
      setShowQuickClientModal(false);
      setToast?.({ message: "Cliente registrado y seleccionado", type: "success" });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "No se pudo registrar cliente", type: "error" });
    } finally {
      setSavingQuickClient(false);
    }
  };

  const handleCustomerChange = (id) => {
    if (readOnlyPendingOrder) return;
    clearPendingOrderContext();
    if (!id) {
      setDraft((prev) => ({
        ...prev,
        customerId: "",
        customerPhone: "",
        deliveryAddress: "",
      }));
      setListaClienteOriginal(getDefaultPriceListKey(priceListsConfig));
      setCambioManualLista(false);
      return;
    }
    const customer = customers.find((item) => item.id === id);
    const listaCliente = normalizarLista(customer?.preferred_price_list || customer?.preferredPriceList);
    setDraft((prev) => ({
      ...prev,
      customerId: id,
      customerName: customer?.name || prev.customerName || "CONSUMIDOR FINAL",
      customerPhone: customer?.phone || prev.customerPhone || "",
      deliveryAddress: customer?.address || "",
    }));
    setListaClienteOriginal(listaCliente);
    setCambioManualLista(false);
    handleCambioLista(listaCliente);
  };

  const handleToggleDelivery = () => {
    if (readOnlyPendingOrder) return;
    clearPendingOrderContext();
    setIsDelivery((prev) => {
      const next = !prev;
      if (next) {
        const schedule = getSuggestedDeliverySchedule(deliveryShiftConfig);
        setDraft((current) => ({ ...current, shift: schedule.shift, scheduledDate: schedule.scheduledDate }));
      }
      return next;
    });
  };

  const handleSearchEnter = () => {
    if (readOnlyPendingOrder) return;
    if (!search.trim()) {
      triggerPrimarySalesAction();
      return;
    }

    const exact = products.find(
      (product) =>
        String(product.sku).toLowerCase() === search.trim().toLowerCase() ||
        String(product.codigo || "").toLowerCase() === search.trim().toLowerCase() ||
        String(product.id).toLowerCase() === search.trim().toLowerCase()
    );

    if (exact) {
      if (getProductLocalStock(exact) <= 0) {
        setToast?.({ message: "Sin stock disponible en local", type: "error" });
        return;
      }
      addItem(exact);
      setSearch("");
    } else {
      setToast?.({ message: "Articulo no encontrado", type: "error" });
    }
  };

  const searchQuickClientWithGoogle = async (query) => {
    if (!query || query.length < 5) return;
    try {
      setQuickClientGoogleSearchLoading(true);
      const { data } = await api.get("/customers/address-search", { params: { q: query, provider: "google" } });
      setQuickClientAddressOptions(Array.isArray(data) ? data : []);
      setQuickClientAddressDropdownOpen(true);
    } catch {
      setQuickClientAddressOptions([]);
    } finally {
      setQuickClientGoogleSearchLoading(false);
    }
  };

  const applyQuickClientAddressOption = (option) => {
    setQuickClientDraft((prev) => ({
      ...prev,
      address: option.address || option.label || prev.address,
      latitude: String(option.latitude ?? ""),
      longitude: String(option.longitude ?? ""),
    }));
    setQuickClientAddressSearch(option.address || option.label || "");
    setQuickClientAddressOptions([]);
    setQuickClientAddressDropdownOpen(false);
  };

  const useQuickClientAddressReference = (reference) => {
    setQuickClientDraft((prev) => ({
      ...prev,
      address: reference,
      latitude: "",
      longitude: "",
    }));
    setQuickClientAddressSearch(reference);
    setQuickClientAddressOptions([]);
    setQuickClientAddressDropdownOpen(false);
  };

  const openQuickClientMapPicker = () => {
    const lat = parseOptionalCoordinate(quickClientDraft.latitude);
    const lng = parseOptionalCoordinate(quickClientDraft.longitude);
    setQuickClientMapPosition(
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : DEFAULT_MAP_CENTER
    );
    setShowQuickClientMapPicker(true);
  };

  const applyQuickClientMapCoords = () => {
    setQuickClientDraft((prev) => ({
      ...prev,
      latitude: String(quickClientMapPosition.lat),
      longitude: String(quickClientMapPosition.lng),
    }));
    setShowQuickClientMapPicker(false);
  };

  const applyQuickClientMapWithAddress = async () => {
    try {
      setQuickClientMapResolvingAddress(true);
      const { data } = await api.get("/customers/reverse-geocode", {
        params: { lat: quickClientMapPosition.lat, lng: quickClientMapPosition.lng },
      });
      const detected = String(data?.address || "").trim();
      setQuickClientDraft((prev) => ({
        ...prev,
        latitude: String(quickClientMapPosition.lat),
        longitude: String(quickClientMapPosition.lng),
        address: detected || prev.address,
      }));
      if (detected) setQuickClientAddressSearch(detected);
      setQuickClientAddressOptions([]);
      setQuickClientAddressDropdownOpen(false);
      setShowQuickClientMapPicker(false);
    } catch {
      setQuickClientDraft((prev) => ({
        ...prev,
        latitude: String(quickClientMapPosition.lat),
        longitude: String(quickClientMapPosition.lng),
      }));
      setShowQuickClientMapPicker(false);
      setToast?.({ message: "No se pudo completar direccion desde el mapa", type: "warning" });
    } finally {
      setQuickClientMapResolvingAddress(false);
    }
  };

  const itemCount = useMemo(
    () => draft.items.reduce((acc, item) => acc + Number(item.qty), 0),
    [draft.items]
  );
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === draft.customerId) || null,
    [customers, draft.customerId]
  );
  const customerHasCurrentAccount = Boolean(
    selectedCustomer?.enable_current_account ?? selectedCustomer?.enableCurrentAccount
  );

  const deliveryShiftOptions = useMemo(
    () => getDeliveryShiftOptions(deliveryShiftConfig),
    [deliveryShiftConfig]
  );

  return (
    <div className="min-h-full md:h-full md:min-h-0 flex flex-col gap-1 overflow-visible md:overflow-hidden rounded-xl bg-[#ededee] p-1 pb-20 md:pb-1 text-zinc-900">
      {readOnlyPendingOrder ? (
        <div className="mx-1 shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-amber-800">
            {isActivePartialDeliveryOrder
              ? "Orden cargada para definir pago parcial. Items y cliente bloqueados."
              : "Orden cargada para cobro. Items y cliente bloqueados."}
          </span>
          <button
            type="button"
            className="shrink-0 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-400 font-black px-3 py-1 rounded-lg transition-colors text-[11px] uppercase"
            onClick={handleEditActiveOrder}
          >
            Editar orden
          </button>
        </div>
      ) : null}
      {loadingPendingOrder ? (
        <div className="mx-1 shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800">
          Cargando orden pendiente...
        </div>
      ) : null}
      {/* Row 1: Top parameters */}
      <SalesMetaBar
        draft={draft}
        sellerOptions={sellerOptions}
        selectedSellerOption={selectedSellerOption}
        listaActiva={listaActiva}
        priceLists={priceLists}
        onSellerChange={setVendedorActual}
        onPriceListChange={handleCambioLista}
        onInvoiceTypeChange={(value) =>
          setDraft((prev) => ({ ...prev, invoiceType: String(value || "") || "Factura B" }))
        }
        readOnly={readOnlyPendingOrder}
      />

      {/* Row 2: Customer */}
      <CustomerPanel
        customerSelectRef={customerSelectRef}
        customerForceOpenSignal={customerSearchOpenSignal}
        customers={customers}
        draft={draft}
        isDelivery={isDelivery}
        deliveryConditions={deliveryConditions}
        onCustomerChange={handleCustomerChange}
        onToggleDelivery={handleToggleDelivery}
        onOpenCustomerSearch={openCustomerSearch}
        onCustomerCommit={restoreCodeFocusAfterModal}
        onOpenQuickClient={() => setShowQuickClientModal(true)}
        onCustomerNameChange={(value) => {
          if (readOnlyPendingOrder) return;
          setDraft((prev) => ({ ...prev, customerId: "", customerName: value }));
        }}
        onCustomerPhoneChange={(value) => {
          if (readOnlyPendingOrder) return;
          setDraft((prev) => ({ ...prev, customerPhone: value }));
        }}
        shiftOptions={deliveryShiftOptions}
        onShiftChange={(value) =>
          !readOnlyPendingOrder &&
          setDraft((prev) => ({
            ...prev,
            shift: value,
            scheduledDate: getScheduledDateForShift(value, deliveryShiftConfig),
          }))
        }
        onPaymentConditionChange={(value) =>
          !readOnlyPendingOrder && setDraft((prev) => ({ ...prev, paymentCondition: value }))
        }
        onDeliveryAddressChange={(value) =>
          !readOnlyPendingOrder && setDraft((prev) => ({ ...prev, deliveryAddress: value }))
        }
        readOnly={readOnlyPendingOrder}
      />
      {/* Row 3: Items Grid */}
      <ItemsPanel
        panelRef={itemsPanelRef}
        codeInputRef={codeInputRef}
        search={search}
        filteredProducts={filteredProducts}
        draftItems={draft.items}
        selectedIdx={selectedIdx}
        listaActiva={listaActiva}
        onSearchChange={setSearch}
        onSearchEnter={handleSearchEnter}
        onOpenProductModal={openProductSearch}
        onSelectSuggestion={addItem}
        onSelectItem={setSelectedIdx}
        getProductPrice={obtenerPrecioPorLista}
        onAddCurrent={handleSearchEnter}
        disabled={readOnlyPendingOrder}
      />
      {/* Footer / Resumen */}
      <SalesSummary
        subtotal={subtotal}
        itemCount={itemCount}
        selectedIdx={selectedIdx}
        hasItems={draft.items.length > 0}
        onRemoveSelected={removeSelectedItem}
        onSubmitBudget={submitBudget}
        onPrimaryAction={triggerPrimarySalesAction}
        primaryLabel={
          isSellerOnly
            ? "Enviar orden"
            : isActivePartialDeliveryOrder
              ? "Registrar pago parcial"
              : activeOrderId
                ? "Cobrar orden"
                : "Registrar venta"
        }
        disableRemove={readOnlyPendingOrder}
        disableBudget={readOnlyPendingOrder}
      />

      {showPaymentModal && (
        <PaymentModal
          total={subtotal}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={submit}
          title={isActivePartialDeliveryOrder ? "Registrar Pago Parcial" : "Confirmar Cobro"}
          confirmLabel={isActivePartialDeliveryOrder ? "Guardar plan" : "Confirmar"}
          requireCashGiven={!isActivePartialDeliveryOrder && role !== "VENDEDOR"}
          requireProof={!isActivePartialDeliveryOrder}
          allowCurrentAccount={!isActivePartialDeliveryOrder && customerHasCurrentAccount}
          allowedMethods={
            isActivePartialDeliveryOrder
              ? ["MIXTO"]
              : customerHasCurrentAccount
                ? ["EFECTIVO", "TRANSFERENCIA", "MIXTO", "CUENTA_CORRIENTE"]
                : ["EFECTIVO", "TRANSFERENCIA", "MIXTO"]
          }
          initialMethod={isActivePartialDeliveryOrder ? "MIXTO" : "EFECTIVO"}
          initialCashAmount={isActivePartialDeliveryOrder ? activeDeliveryPartialPlan.cashAmount : ""}
          initialTransferAmount={
            isActivePartialDeliveryOrder ? activeDeliveryPartialPlan.transferAmount : ""
          }
        />
      )}
      {showPrintPrompt ? (
        <PrintPromptModal
          title={printPromptTitle}
          lines={printPreviewLines}
          availablePrinters={availablePrinters}
          selectedPrinter={selectedPrinter}
          onPrinterChange={setSelectedPrinter}
          onCancel={() => resolvePrintConfirmation(false)}
          onConfirm={() => resolvePrintConfirmation(true)}
        />
      ) : null}

      {showProductModal && (
        <ProductSearchModal
          products={products}
          onClose={() => {
            setShowProductModal(false);
            restoreCodeFocusAfterModal();
          }}
          onSelect={(product) => {
            addItem(product);
            setShowProductModal(false);
            restoreCodeFocusAfterModal();
          }}
        />
      )}
      {showQuickClientModal ? (
        <QuickClientModal
          draft={quickClientDraft}
          saving={savingQuickClient}
          addressSearch={quickClientAddressSearch}
          addressOptions={quickClientAddressOptions}
          addressLoading={quickClientAddressLoading}
          addressDropdownOpen={quickClientAddressDropdownOpen}
          onGoogleSearch={searchQuickClientWithGoogle}
          googleSearchLoading={quickClientGoogleSearchLoading}
          onClose={() => {
            setShowQuickClientModal(false);
            setQuickClientAddressOptions([]);
            setQuickClientAddressDropdownOpen(false);
          }}
          onChange={(field, value) => setQuickClientDraft((prev) => ({ ...prev, [field]: value }))}
          onAddressFocus={(value) => {
            setQuickClientAddressSearch(value || "");
            setQuickClientAddressDropdownOpen(true);
          }}
          onAddressSearchChange={(value) => {
            setQuickClientDraft((prev) => ({
              ...prev,
              address: value,
              latitude: "",
              longitude: "",
            }));
            setQuickClientAddressSearch(value);
            setQuickClientAddressDropdownOpen(true);
          }}
          onAddressSelect={applyQuickClientAddressOption}
          onUseAddressReference={useQuickClientAddressReference}
          onOpenMapPicker={openQuickClientMapPicker}
          onSubmit={createQuickClient}
        />
      ) : null}

      {showQuickClientMapPicker ? (
        <ClientMapPickerModal
          mapPosition={quickClientMapPosition}
          setMapPosition={setQuickClientMapPosition}
          mapResolvingAddress={quickClientMapResolvingAddress}
          onClose={() => setShowQuickClientMapPicker(false)}
          onApplyCoords={applyQuickClientMapCoords}
          onApplyWithAddress={applyQuickClientMapWithAddress}
        />
      ) : null}

      {showQtyEditModal ? (
        <QtyEditModal
          value={qtyEditValue}
          onChange={setQtyEditValue}
          onCancel={() => setShowQtyEditModal(false)}
          onApply={applyQtyEdit}
          min="0.001"
          step="0.001"
        />
      ) : null}
      {showPriceEditModal ? (
        <QtyEditModal
          value={priceEditValue}
          onChange={setPriceEditValue}
          onCancel={() => setShowPriceEditModal(false)}
          onApply={applyPriceEdit}
          title="Editar precio"
          label="Nuevo precio transaccional"
          min="0"
          step="0.01"
        />
      ) : null}
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
