import { useState, useEffect, useMemo, useRef } from "react";
import api from "../api";
import PaymentModal from "./PaymentModal";
import SearchableSelect from "./SearchableSelect";
import ProductSearchModal from "./ProductSearchModal";
import { DEFAULT_TICKET_CONFIG, loadTicketConfig } from "../utils/ticketConfig";
import { DEFAULT_DELIVERY_CONDITIONS, loadDeliveryConditions } from "../utils/deliveryPaymentConditions";


const ROLES_VENDEDOR_HABILITADOS = ["VENDEDOR", "CAJERO", "ADMIN"];
const VENDEDOR_LOCAL_KEY = "vendedorActivoLocal";

export default function Ventas({ user, setToast }) {
  const LISTAS_PRECIO = ["MINORISTA", "MAYORISTA"];

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [savingQuickClient, setSavingQuickClient] = useState(false);
  const [showQtyEditModal, setShowQtyEditModal] = useState(false);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printPreviewLines, setPrintPreviewLines] = useState([]);
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [printPromptTitle, setPrintPromptTitle] = useState("Imprimir comprobante");
  const [ticketConfig, setTicketConfig] = useState(DEFAULT_TICKET_CONFIG);
  const [deliveryConditions, setDeliveryConditions] = useState(DEFAULT_DELIVERY_CONDITIONS);
  const [qtyEditValue, setQtyEditValue] = useState("");
  const [listaActiva, setListaActiva] = useState("MINORISTA");
  const [listaClienteOriginal, setListaClienteOriginal] = useState("MINORISTA");
  const [cambioManualLista, setCambioManualLista] = useState(false);
  const [isDelivery, setIsDelivery] = useState(false);

  const customerSelectRef = useRef(null);
  const codeInputRef = useRef(null);
  const printPromptResolverRef = useRef(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [quickClientDraft, setQuickClientDraft] = useState({
    name: "",
    phone: "",
    address: "",
    zone: "",
    notes: "",
  });

  const [draft, setDraft] = useState({
    customerId: "",
    customerName: "CONSUMIDOR FINAL",
    sellerId: user?.id || "",
    paymentMethod: "EFECTIVO",
    invoiceType: "Factura B",
    items: [],
    shift: "MANIANA",
    paymentCondition: "PAGADO_LOCAL",
    deliveryAddress: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [p, c, u] = await Promise.all([
          api.get("/products"),
          api.get("/customers").catch(() => ({ data: [] })),
          api.get("/users").catch(() => ({ data: [] })),
        ]);
        setProducts((p.data || []).filter((x) => x.is_active !== false));
        setCustomers(c.data || []);
        setUsers(u.data || []);
      } catch {
        setToast?.({ message: "No se pudieron cargar datos de ventas", type: "error" });
      }
    };
    load();
    setTicketConfig(loadTicketConfig());
    setDeliveryConditions(loadDeliveryConditions());
  }, [setToast]);

  useEffect(() => {
    if (!deliveryConditions.length) return;
    const exists = deliveryConditions.some((c) => c.value === draft.paymentCondition);
    if (!exists) {
      setDraft((prev) => ({ ...prev, paymentCondition: deliveryConditions[0].value }));
    }
  }, [deliveryConditions, draft.paymentCondition]);

  useEffect(() => {
    const onKeyDown = (e) => {
      // Si el modal de pago esta abierto o el modal de productos esta abierto, 
      // dejamos que sus propios listeners manejen las teclas
      if (document.querySelector(".fixed.inset-0")) return;

      if (e.key === "F3") {
        e.preventDefault();
        customerSelectRef.current?.focus();
      }
      if (e.key === "F5") {
        e.preventDefault();
        setShowProductModal(true);
      }
      if (e.key === "*") {
        e.preventDefault();
        if (!draft.items.length) return;
        const currentIdx = selectedIdx;
        if (currentIdx >= 0 && currentIdx < draft.items.length) {
          const currentItem = draft.items[currentIdx];
          setQtyEditValue(String(currentItem.qty || 1));
          setShowQtyEditModal(true);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIdx, draft.items]); // need selectedIdx dependency to access current value

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

  const resolvePrintConfirmation = (value) => {
    const resolver = printPromptResolverRef.current;
    printPromptResolverRef.current = null;
    setShowPrintPrompt(false);
    if (typeof resolver === "function") {
      resolver({ shouldPrint: Boolean(value), deviceName: selectedPrinter || undefined });
    }
  };

  useEffect(() => {
    if (!showPrintPrompt) return undefined;
    const onKeyDown = (e) => {
      const key = String(e.key || "").toLowerCase();
      if (key === "y") {
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
    const normalized = String(lista || "MINORISTA").toUpperCase();
    return LISTAS_PRECIO.includes(normalized) ? normalized : "MINORISTA";
  };

  const obtenerPrecioPorLista = (product, lista) => {
    if (!product) return 0;
    const minorista = Number(product.price_minorista || 0);
    const mayorista = Number(product.price_mayorista || 0);
    if (normalizarLista(lista) === "MAYORISTA") {
      return mayorista > 0 ? mayorista : minorista;
    }
    return minorista;
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
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return item;
        return { ...item, unitPrice: obtenerPrecioPorLista(product, listaNormalizada) };
      }),
    }));
    const hayClienteRegistrado = Boolean(draft.customerId);
    setCambioManualLista(hayClienteRegistrado && listaNormalizada !== listaClienteOriginal);
  };

  const vendedoresActivos = useMemo(() => {
    return (users || []).filter((u) => {
      const role = String(u.role || "").toUpperCase();
      const isActive = u.is_active !== false;
      return isActive && ROLES_VENDEDOR_HABILITADOS.includes(role);
    });
  }, [users]);

  const setVendedorActual = (sellerId) => {
    if (!sellerId) return;
    setDraft((prev) => ({ ...prev, sellerId }));
    localStorage.setItem(VENDEDOR_LOCAL_KEY, sellerId);
  };

  useEffect(() => {
    if (!vendedoresActivos.length) return;
    const persistedSellerId = localStorage.getItem(VENDEDOR_LOCAL_KEY);
    const sellerExiste = (id) => vendedoresActivos.some((u) => u.id === id);
    const fallbackSellerId = sellerExiste(user?.id) ? user.id : vendedoresActivos[0].id;
    const initialSellerId = sellerExiste(persistedSellerId) ? persistedSellerId : fallbackSellerId;
    if (!sellerExiste(persistedSellerId)) localStorage.removeItem(VENDEDOR_LOCAL_KEY);
    setDraft((prev) => (prev.sellerId === initialSellerId ? prev : { ...prev, sellerId: initialSellerId }));
    localStorage.setItem(VENDEDOR_LOCAL_KEY, initialSellerId);
  }, [vendedoresActivos, user?.id]);

  const subtotal = useMemo(
    () => draft.items.reduce((acc, i) => acc + Number(i.qty) * Number(i.unitPrice), 0),
    [draft.items]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 20);
  }, [products, search]);

  const addItem = (product) => {
    setDraft((prev) => {
      const idx = prev.items.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        const next = [...prev.items];
        next[idx] = { ...next[idx], qty: Number(next[idx].qty) + Number(qty || 1) };
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
            qty: Number(qty || 1),
            unitPrice: obtenerPrecioPorLista(product, listaActiva),
            discount: 0,
          },
        ],
      };
    });
    setSearch("");
    setQty(1);
  };

  const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

  const buildTicketLines = ({ saleData, paymentData }, opts = {}) => {
    const MAX = 32;
    const docLabel = opts.docLabel || "Factura B";
    const includePayment = opts.includePayment !== false;
    const budgetNotice = Boolean(opts.budgetNotice);
    const repeat = (char, len) => new Array(Math.max(0, len) + 1).join(char);
    const center = (text) => {
      const t = String(text || "").slice(0, MAX);
      const left = Math.max(0, Math.floor((MAX - t.length) / 2));
      return `${repeat(" ", left)}${t}`;
    };
    const leftRight = (left, right) => {
      const l = String(left || "");
      const r = String(right || "");
      const avail = Math.max(1, MAX - r.length);
      const trimmedLeft = l.length > avail ? `${l.slice(0, avail - 1)}.` : l;
      const spaces = Math.max(1, MAX - trimmedLeft.length - r.length);
      return `${trimmedLeft}${repeat(" ", spaces)}${r}`;
    };

    const now = new Date();
    const saleNumber = opts.ticketNumberOverride || saleData?.sale_number || saleData?.number || saleData?.id || "S/N";
    const sellerName = vendedoresActivos.find((u) => u.id === draft.sellerId);
    const sellerLabel = String(
      sellerName?.full_name || sellerName?.fullName || sellerName?.username || user?.username || "N/A"
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

    const lines = [];
    if (ticketConfig.businessName) lines.push(center(ticketConfig.businessName));
    if (ticketConfig.addressLine) lines.push(center(ticketConfig.addressLine));
    if (ticketConfig.cityLine) lines.push(center(ticketConfig.cityLine));
    lines.push(repeat("-", MAX));
    if (ticketConfig.includeComprobante) lines.push(leftRight("Comprobante", docLabel));
    if (ticketConfig.includeTicketNumber) lines.push(leftRight("Ticket", ticketNumber));
    if (ticketConfig.includeDate) lines.push(leftRight("Fecha", formatDate));
    if (ticketConfig.includeTime) lines.push(leftRight("Hora", formatTime));
    if (ticketConfig.includeSeller) lines.push(leftRight("Vendedor", sellerLabel.slice(0, 16)));
    lines.push(repeat("-", MAX));
    if (ticketConfig.includeClient) {
      lines.push(`Cliente: ${customerLabel.slice(0, MAX - 9)}`);
      lines.push(repeat("-", MAX));
    }
    lines.push(leftRight("Cant x P.Unit", "Importe"));

    draft.items.forEach((item) => {
      const qtyLabel = Number(item.qty || 0).toString();
      const unitPrice = Number(item.unitPrice || 0);
      const lineTotal = Number(item.qty || 0) * unitPrice;
      lines.push(String(item.name || "").toUpperCase().slice(0, MAX));
      lines.push(leftRight(`${qtyLabel} x ${formatMoney(unitPrice)}`, formatMoney(lineTotal)));
    });

    lines.push(repeat("-", MAX));
    lines.push(leftRight("TOTAL", formatMoney(subtotal)));
    if (ticketConfig.includePaymentDetail && includePayment) {
      lines.push(leftRight("Pago", paymentMethod));
      if (paymentMethod === "MIXTO") {
        lines.push(leftRight("Efectivo", formatMoney(paymentData?.cashAmount)));
        lines.push(leftRight("Transfer.", formatMoney(paymentData?.transferAmount)));
      } else if (paymentMethod === "EFECTIVO") {
        lines.push(leftRight("Abona con", formatMoney(paymentData?.cashGiven)));
        lines.push(leftRight("Vuelto", formatMoney(paymentData?.changeAmount)));
      }
    }

    const customLines = Array.isArray(ticketConfig.customLines) ? ticketConfig.customLines : [];
    if (customLines.length) {
      lines.push(repeat("-", MAX));
      customLines.forEach((line) => {
        const rendered = applyTemplate(line);
        if (rendered) lines.push(rendered.slice(0, MAX));
      });
    }

    if (budgetNotice) {
      lines.push(repeat("-", MAX));
      lines.push(center("PRESUPUESTO SIN VALIDEZ FISCAL"));
    }
    lines.push(repeat("-", MAX));
    if (ticketConfig.footerText) lines.push(center(ticketConfig.footerText));
    lines.push("");
    lines.push("");
    lines.push("");
    return lines;
  };

  const printReceipt = async ({ lines, deviceName }) => {
    const ticket = { lines: Array.isArray(lines) ? lines : [] };
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
      body { font-family: 'Courier New', monospace; width: 58mm; margin: 0; padding: 2mm; font-size: 11px; }
      .line { white-space: pre; }
      </style></head><body>
      ${ticket.lines.map((line) => `<div class="line">${String(line).replace(/</g, "&lt;")}</div>`).join("")}
      </body></html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
    printable.close();
  };

  const submit = async (paymentData) => {
    if (!draft.items.length) {
      setToast?.({ message: "Venta vacia", type: "error" });
      return;
    }
    if (isDelivery && !draft.customerId) {
      setToast?.({ message: "Para envio debes seleccionar un cliente registrado", type: "error" });
      return;
    }
    if (isDelivery && !String(draft.deliveryAddress || "").trim()) {
      setToast?.({ message: "Para envio la direccion es obligatoria", type: "error" });
      return;
    }
    if (!isDelivery && !draft.customerId && !String(draft.customerName || "").trim()) {
      setToast?.({ message: "Ingresa un nombre para el cliente de mostrador", type: "error" });
      return;
    }

    try {
      const vendedorId = draft.sellerId || localStorage.getItem(VENDEDOR_LOCAL_KEY) || user.id;
      const selectedCondition = String(draft.paymentCondition || "PAGADO_LOCAL").toUpperCase();
      const payload = {
        ...draft,
        sellerId: vendedorId,
        vendedorId,
        customerId: draft.customerId || null,
        ...paymentData,
        items: draft.items.map((i) => ({
          productId: i.productId,
          qty: Number(i.qty),
          unitPrice: Number(i.unitPrice),
        })),
        saleType: isDelivery ? "ENVIO" : "MOSTRADOR",
        shift: isDelivery ? draft.shift : null,
        paymentCondition: isDelivery ? selectedCondition : null,
        deliveryAddress: isDelivery ? draft.deliveryAddress : null,
      };

      const saleResponse = await api.post("/sales", payload);

      const lines = buildTicketLines({ saleData: saleResponse?.data, paymentData }, { docLabel: "Factura B" });
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

      if (draft.customerId && cambioManualLista && listaActiva !== listaClienteOriginal) {
        const confirmarGuardar = window.confirm(
          `Cambio la lista a ${listaActiva}. Desea guardar esta lista como predeterminada para futuras compras de ${draft.customerName}?`
        );
        if (confirmarGuardar) {
          await actualizarPerfilCliente(draft.customerId, listaActiva);
        }
      }

      setToast?.({ message: "Venta confirmada", type: "success" });
      setShowPaymentModal(false);
      setDraft((prev) => ({
        ...prev,
        customerId: "",
        customerName: "CONSUMIDOR FINAL",
        items: [],
        paymentCondition: "PAGADO_LOCAL",
        deliveryAddress: "",
      }));
      setListaActiva("MINORISTA");
      setListaClienteOriginal("MINORISTA");
      setCambioManualLista(false);
      setIsDelivery(false);
      setDeliveryConditions(loadDeliveryConditions());
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error al guardar", type: "error" });
    }
  };

  const submitBudget = async () => {
    if (!draft.items.length) {
      setToast?.({ message: "Presupuesto vacio", type: "error" });
      return;
    }
    if (isDelivery && !draft.customerId) {
      setToast?.({ message: "Para envio debes seleccionar un cliente registrado", type: "error" });
      return;
    }
    if (isDelivery && !String(draft.deliveryAddress || "").trim()) {
      setToast?.({ message: "Para envio la direccion es obligatoria", type: "error" });
      return;
    }
    if (!isDelivery && !draft.customerId && !String(draft.customerName || "").trim()) {
      setToast?.({ message: "Ingresa un nombre para el cliente del presupuesto", type: "error" });
      return;
    }

    const now = new Date();
    const budgetNumber = `PRES-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate()
    ).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    const lines = buildTicketLines(
      { saleData: { sale_number: budgetNumber }, paymentData: {} },
      {
        docLabel: "PRESUPUESTO",
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
          message: "No se pudo imprimir el presupuesto",
          type: "error",
        });
        return;
      }
    }
    setToast?.({ message: "Presupuesto generado", type: "success" });
    setDeliveryConditions(loadDeliveryConditions());
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
        preferredPriceList: listaActiva,
      };
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

      setQuickClientDraft({ name: "", phone: "", address: "", zone: "", notes: "" });
      setShowQuickClientModal(false);
      setToast?.({ message: "Cliente registrado y seleccionado", type: "success" });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "No se pudo registrar cliente", type: "error" });
    } finally {
      setSavingQuickClient(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-3 text-white">
      {/* Header */}
      <div className="px-1">
        <h1 className="text-[28px] font-bold leading-none text-white tracking-tight">Ventas</h1>
        <p className="text-xs text-zinc-400 mt-1">Fase 1 - sistema interno</p>
      </div>

      {/* Row 1: Top parameters */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 shrink-0">
        <div>
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Comprobante</label>
          <div className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-xs font-black text-[#e85d04]">
            {draft.invoiceType}
          </div>
        </div>
        <div>
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Vendedor</label>
          <select
            className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-xs font-bold text-white outline-none focus:border-[#e85d04]"
            value={draft.sellerId}
            onChange={(e) => setVendedorActual(e.target.value)}
          >
            {vendedoresActivos.map((u) => (
              <option key={u.id} value={u.id}>
                {String(u.full_name || u.fullName || u.username || "SIN NOMBRE").toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Cond. Pago / Lista</label>
          <select
            className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-xs font-bold text-white outline-none focus:border-[#e85d04]"
            value={listaActiva}
            onChange={(e) => handleCambioLista(e.target.value)}
          >
            <option value="MINORISTA">EFECTIVO (MINORISTA)</option>
            <option value="MAYORISTA">EFECTIVO (MAYORISTA)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Fecha</label>
          <div className="w-full p-2.5 text-xs text-zinc-300 font-mono flex items-center h-[38px]">
            {new Date().toLocaleDateString('en-US')}
          </div>
        </div>
      </div>

      {/* Row 2: Customer */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-3 flex flex-col gap-3 shrink-0">
        <div className="flex flex-col md:flex-row items-end gap-3 w-full">
          <div className="flex-1 w-full">
            <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Cliente</label>
            <SearchableSelect
              inputRef={customerSelectRef}
              options={[
                { id: "", label: "CONSUMIDOR FINAL", subtext: "-" },
                ...customers.map(c => ({
                  id: c.id,
                  label: String(c.name || "").toUpperCase(),
                  subtext: c.taxId || "Sin CUIT"
                }))
              ]}
              value={draft.customerId}
              onChange={(id) => {
                const c = customers.find((x) => x.id === id);
                const listaCliente = normalizarLista(c?.preferred_price_list || c?.preferredPriceList);
                setDraft((prev) => ({
                  ...prev,
                  customerId: id,
                  customerName: c?.name || prev.customerName || "CONSUMIDOR FINAL",
                  deliveryAddress: c?.address || "",
                }));
                setListaClienteOriginal(listaCliente);
                setCambioManualLista(false);
                handleCambioLista(listaCliente);
              }}
              placeholder="Buscar cliente..."
            />
          </div>

          <div
            className="flex items-center h-[38px] px-4 gap-2 bg-[#1a1a1a] border border-zinc-800/80 rounded cursor-pointer select-none"
            onClick={() => setIsDelivery(!isDelivery)}
          >
            <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Es Envío</span>
            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${isDelivery ? "bg-[#e85d04]" : "bg-zinc-700"}`}>
              <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isDelivery ? "translate-x-4" : "translate-x-0"}`} />
            </div>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <button
              className="flex-1 md:flex-none bg-[#2a2a2a] hover:bg-[#333] text-white border border-zinc-700/50 rounded-lg px-6 h-[38px] flex flex-col items-center justify-center transition-colors"
              onClick={() => customerSelectRef.current?.focus()}
            >
              <span className="text-xs font-bold leading-none mb-1">BUSCAR</span>
              <span className="text-[9px] text-zinc-400 leading-none">(F3)</span>
            </button>

            <button
              className="flex-1 md:flex-none bg-[#e85d04] hover:bg-[#d14f00] text-white border border-[#e85d04]/60 rounded-lg px-4 h-[38px] flex items-center justify-center transition-colors text-[10px] font-black uppercase tracking-widest"
              onClick={() => setShowQuickClientModal(true)}
              type="button"
            >
              Registrar
            </button>
          </div>
        </div>

        {!isDelivery && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">
                Nombre cliente mostrador (no registrado)
              </label>
              <input
                className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2 text-sm md:text-xs font-bold text-white outline-none focus:border-[#e85d04]"
                value={draft.customerName}
                onChange={(e) => setDraft((prev) => ({ ...prev, customerId: "", customerName: e.target.value }))}
                placeholder="Ej: Juan Perez"
              />
              <div className="text-[10px] text-zinc-500 mt-1">
                Si no seleccionas cliente registrado, este nombre se usa para la venta de mostrador.
              </div>
            </div>
          </div>
        )}

        {isDelivery && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-zinc-800/50 mt-1">
            <div>
              <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Salida Est.</label>
              <select className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2 text-sm md:text-xs font-bold text-white outline-none focus:border-[#e85d04]" value={draft.shift} onChange={(e) => setDraft((p) => ({ ...p, shift: e.target.value }))}>
                <option value="MANIANA">MAÑANA (11:00)</option>
                <option value="TARDE">TARDE (19:00)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Condición</label>
              <select
                className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2 text-sm md:text-xs font-bold text-white outline-none focus:border-[#e85d04]"
                value={draft.paymentCondition}
                onChange={(e) => setDraft((p) => ({ ...p, paymentCondition: e.target.value }))}
              >
                {deliveryConditions.map((condition) => (
                  <option key={condition.value} value={condition.value}>
                    {condition.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Dirección de Entrega</label>
              <input className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2 text-sm md:text-xs font-bold text-white outline-none focus:border-[#e85d04]" placeholder="Dirección..." value={draft.deliveryAddress} onChange={(e) => setDraft((p) => ({ ...p, deliveryAddress: e.target.value }))} />
            </div>
          </div>
        )}
      </div>

      {/* Row 3: Items Grid */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg flex-1 flex flex-col min-h-[380px] relative shrink-0">
        <div className="p-4 border-b border-zinc-800/50 flex flex-col gap-2 shrink-0">
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest block mb-1">Carga Rápida</label>
          <div className="flex gap-2 w-full items-end">

            <div className="flex-1 flex gap-2 w-full items-center">
              <label className="text-sm font-black text-zinc-400 uppercase hidden md:inline-block mr-2">Código:</label>
              <input
                ref={codeInputRef}
                className="w-full md:w-1/3 md:min-w-[200px] bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-lg font-bold text-white outline-none focus:border-[#e85d04] placeholder-zinc-700 font-mono"
                placeholder="Escanee o tipee el código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!search.trim()) {
                      setShowPaymentModal(true);
                      return;
                    }
                    const exact = products.find(p => String(p.sku).toLowerCase() === search.trim().toLowerCase() || String(p.id).toLowerCase() === search.trim().toLowerCase());
                    if (exact) {
                      addItem(exact);
                      setSearch("");
                    } else {
                      setToast?.({ message: "Artículo no encontrado", type: "error" });
                    }
                  } else if (e.key === "F5") {
                    e.preventDefault();
                    setShowProductModal(true);
                  }
                }}
                autoComplete="off"
              />
              <button
                className="bg-[#2a2a2a] hover:bg-[#333] border border-zinc-700/50 text-white rounded w-[50px] h-[46px] flex flex-col items-center justify-center transition-colors shadow-md shrink-0"
                onClick={() => setShowProductModal(true)}
                title="Búsqueda de Artículos (F5)"
              >
                <span className="text-lg">🔍</span>
                <span className="text-[9px] font-bold text-zinc-400 leading-none -mt-1 hidden">F5</span>
              </button>
            </div>

            <div className="w-full sm:w-24 relative flex items-center gap-3 bg-[#1a1a1a] border border-zinc-800/80 rounded p-2">
              <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest">CANT</label>
              <input
                type="number"
                min={1}
                className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded text-center text-lg font-bold py-1 text-white outline-none focus:border-[#e85d04]"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
          </div>

          {search && filteredProducts.length > 0 && (
            <div className="absolute top-[85px] left-4 right-4 z-50 bg-[#1a1a1a] border border-zinc-700 rounded-lg shadow-2xl max-h-60 overflow-auto">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  className="w-full text-left px-5 py-3 hover:bg-zinc-800 border-b border-zinc-800/50 last:border-b-0 flex justify-between items-center"
                  onClick={() => addItem(p)}
                >
                  <div>
                    <div className="text-sm font-bold text-white uppercase">{p.name}</div>
                    <div className="text-xs text-zinc-400 mt-1">{p.codigo || p.sku || "-"}</div>
                  </div>
                  <div className="font-bold text-[#e85d04] text-lg">
                    ${Number(obtenerPrecioPorLista(p, listaActiva) || 0).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-xs md:text-[11px] text-left min-w-[600px]">
            <thead className="text-[10px] md:text-[9px] uppercase text-zinc-500 tracking-widest bg-[#121212] border-b border-zinc-800/50 sticky top-0 z-10">
              <tr>
                <th className="px-5 py-3 font-black w-20">CANT</th>
                <th className="px-5 py-3 font-black w-40">CÓDIGO</th>
                <th className="px-5 py-3 font-black">DESCRIPCIÓN</th>
                <th className="px-5 py-3 font-black w-32 text-right">PRECIO</th>
                <th className="px-5 py-3 font-black w-24 text-center">DTO%</th>
                <th className="px-5 py-3 font-black w-32 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {draft.items.map((it, idx) => (
                <tr
                  key={`${it.productId}-${idx}`}
                  onClick={() => setSelectedIdx(idx)}
                  className={`border-b border-zinc-800/30 cursor-pointer ${selectedIdx === idx ? "bg-[#e85d04]/10" : "hover:bg-zinc-800/20"}`}
                >
                  <td className="px-5 py-3 text-zinc-300 font-medium">{it.qty}</td>
                  <td className="px-5 py-3 text-zinc-400">{it.codigo || "-"}</td>
                  <td className="px-5 py-3 font-bold text-zinc-200 uppercase">{it.name}</td>
                  <td className="px-5 py-3 text-right text-zinc-300">${Number(it.unitPrice).toFixed(2)}</td>
                  <td className="px-5 py-3 text-center text-zinc-500">{Number(it.discount || 0).toFixed(0)}</td>
                  <td className="px-5 py-3 text-right font-bold text-white">${(Number(it.qty) * Number(it.unitPrice)).toFixed(2)}</td>
                </tr>
              ))}
              {!draft.items.length && (
                <tr className="hover:bg-transparent">
                  <td colSpan={6} className="text-center py-16 text-zinc-600 focus:outline-none">
                    {/* Empty Table */}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer / Resumen */}
      <div className="flex flex-col md:flex-row gap-3 shrink-0">
        {/* Left summary blocks */}
        <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-3 flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 items-center shrink-0">
          <div>
            <div className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">Subtotal Neto</div>
            <div className="text-lg md:text-xl font-bold text-white">${subtotal.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">Descuento Global</div>
            <div className="text-lg md:text-xl font-bold text-white">$0.00</div>
          </div>
          <div>
            <div className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">Ítems</div>
            <div className="text-lg md:text-xl font-bold text-[#e85d04]">{draft.items.reduce((acc, i) => acc + Number(i.qty), 0)}</div>
          </div>

          <div className="flex justify-end pr-2 md:col-span-1 col-span-2">
            {selectedIdx >= 0 && draft.items.length > 0 && (
              <button
                className="text-rose-500 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20 transition-colors w-full md:w-auto"
                onClick={() => {
                  setDraft((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== selectedIdx) }));
                  setSelectedIdx((x) => Math.max(0, x - 1));
                }}
              >
                Quitar Selección
              </button>
            )}
          </div>
        </div>

        {/* Right total & action */}
        <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-3.5 w-full md:w-64 flex flex-col items-center justify-center text-center shrink-0">
          <div className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1 w-full flex justify-between px-2">
            <span>Total General</span>
          </div>
          <div className="text-3xl md:text-3xl leading-none font-black text-white w-full mb-3 px-2 text-right truncate">
            ${subtotal.toFixed(2)}
          </div>

          <div className="w-full grid grid-cols-2 md:grid-cols-1 gap-2 content-center">
            <button
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-black py-2.5 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 leading-none disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={submitBudget}
              disabled={draft.items.length === 0}
            >
              <span className="text-[11px] md:text-sm">PRESUPUESTO</span>
            </button>
            <button
              className="w-full bg-[#e85d04] hover:bg-[#d14f00] text-white font-black py-2.5 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 leading-none disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setShowPaymentModal(true)}
              disabled={draft.items.length === 0}
            >
              <span className="text-[11px] md:text-sm">COBRAR</span>
            </button>
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <PaymentModal
          total={subtotal}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={submit}
          requireCashGiven={String(user?.role || "").toUpperCase() !== "VENDEDOR"}
        />
      )}

      {showPrintPrompt && (
        <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-xl border border-zinc-800 bg-[#121212] p-5 space-y-4">
            <div className="text-lg font-black uppercase tracking-wider text-[#e85d04]">{printPromptTitle}</div>
            <div className="text-sm text-zinc-300">
              Vista previa y confirmacion de impresion
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-500">Impresora</label>
              <select
                className="input mt-1"
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
              >
                {!availablePrinters.length && <option value="">Predeterminada del sistema</option>}
                {availablePrinters.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="border border-zinc-800 rounded-lg bg-white text-black p-3 max-h-80 overflow-auto">
              <div className="mx-auto w-[58mm] font-mono text-[11px] leading-tight">
                {printPreviewLines.map((line, idx) => (
                  <div key={`${line}-${idx}`} className="whitespace-pre">
                    {line}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-zinc-500">
              Atajos: <span className="font-black text-zinc-300">Y</span> = SI,{" "}
              <span className="font-black text-zinc-300">N</span> = NO
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-muted" onClick={() => resolvePrintConfirmation(false)}>
                No (N)
              </button>
              <button type="button" className="btn btn-primary" onClick={() => resolvePrintConfirmation(true)}>
                Si (Y)
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductModal && (
        <ProductSearchModal
          products={products}
          onClose={() => {
            setShowProductModal(false);
            setTimeout(() => codeInputRef.current?.focus(), 50);
          }}
          onSelect={(product) => {
            addItem(product);
            setShowProductModal(false);
            setTimeout(() => codeInputRef.current?.focus(), 50);
          }}
        />
      )}

      {showQuickClientModal && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-[#121212] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black uppercase tracking-wider text-[#e85d04]">
                Registrar Cliente Rapido
              </div>
              <button
                className="btn btn-muted"
                onClick={() => setShowQuickClientModal(false)}
                type="button"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-zinc-500">Nombre *</label>
                <input
                  className="input mt-1"
                  value={quickClientDraft.name}
                  onChange={(e) => setQuickClientDraft((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Telefono</label>
                <input
                  className="input mt-1"
                  value={quickClientDraft.phone}
                  onChange={(e) => setQuickClientDraft((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Zona</label>
                <input
                  className="input mt-1"
                  value={quickClientDraft.zone}
                  onChange={(e) => setQuickClientDraft((p) => ({ ...p, zone: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-zinc-500">Direccion</label>
                <input
                  className="input mt-1"
                  value={quickClientDraft.address}
                  onChange={(e) => setQuickClientDraft((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-zinc-500">Notas</label>
                <input
                  className="input mt-1"
                  value={quickClientDraft.notes}
                  onChange={(e) => setQuickClientDraft((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={createQuickClient}
                disabled={savingQuickClient}
              >
                {savingQuickClient ? "Guardando..." : "Guardar y seleccionar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showQtyEditModal && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#121212] p-4 space-y-3">
            <div className="text-sm font-black uppercase tracking-wider text-[#e85d04]">
              Editar cantidad
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-500">Nueva cantidad</label>
              <input
                className="input mt-1"
                type="number"
                min="1"
                step="1"
                value={qtyEditValue}
                onChange={(e) => setQtyEditValue(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyQtyEdit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setShowQtyEditModal(false);
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-muted" onClick={() => setShowQtyEditModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={applyQtyEdit}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
