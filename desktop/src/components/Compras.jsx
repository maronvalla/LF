import { useState, useEffect, useMemo, useRef } from "react";
import api from "../api";
import SearchableSelect from "./SearchableSelect";
import ProductSearchModal from "./ProductSearchModal";
import QtyEditModal from "./ventas/QtyEditModal";

const isTypingTarget = (target) => {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
};

const isQtyShortcut = (event) =>
  event.key === "*" || event.key === "Multiply" || event.code === "NumpadMultiply";

const isPriceShortcut = (event) =>
  event.key === "/" || event.key === "Divide" || event.code === "NumpadDivide";

export default function Compras({ user, setToast }) {
  const role = String(user?.role || "").toUpperCase();
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showQtyEditModal, setShowQtyEditModal] = useState(false);
  const [showCostEditModal, setShowCostEditModal] = useState(false);
  const [qtyEditValue, setQtyEditValue] = useState("");
  const [costEditValue, setCostEditValue] = useState("");
  const [canOverrideLinePrice, setCanOverrideLinePrice] = useState(
    ["ADMIN", "CAJERO"].includes(role)
  );

  const [showProductModal, setShowProductModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [attachingReceiptId, setAttachingReceiptId] = useState("");
  const codeInputRef = useRef(null);
  const supplierSelectRef = useRef(null);
  const purchaseReceiptInputRef = useRef(null);
  const historyReceiptInputRef = useRef(null);

  const [draft, setDraft] = useState({
    supplierId: "",
    supplierName: "",
    invoiceNumber: "",
    invoiceType: "Factura A",
    paymentMethod: "EFECTIVO",
    items: [],
    date: new Date().toISOString().split("T")[0],
    receiptImageDataUrl: "",
    receiptImageName: "",
  });
  const hasComprasModalOpen =
    showQtyEditModal || showCostEditModal || showProductModal || showHistoryModal;

  useEffect(() => {
    const load = async () => {
      try {
        const [p, s] = await Promise.all([
          api.get("/products"),
          api.get("/suppliers").catch(() => ({ data: [] })),
        ]);
        setProducts((p.data || []).filter((x) => x.is_active !== false));
        setSuppliers(s.data || []);
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
    const onKeyDown = (e) => {
      if (hasComprasModalOpen) return;
      const typing = isTypingTarget(e.target);
      const qtyShortcut = isQtyShortcut(e);
      const priceShortcut = isPriceShortcut(e);

      if (typing && !qtyShortcut && !priceShortcut) return;

      if (e.key === "F2") {
        e.preventDefault();
        supplierSelectRef.current?.focus();
      }
      if (e.key === "F5") {
        e.preventDefault();
        setShowProductModal(true);
      }
      if (qtyShortcut) {
        e.preventDefault();
        if (!draft.items.length) return;
        const currentItem = draft.items[selectedIdx];
        if (!currentItem) return;
        setQtyEditValue(String(currentItem.qty || 1));
        setShowQtyEditModal(true);
      }
      if (priceShortcut && canOverrideLinePrice) {
        e.preventDefault();
        if (!draft.items.length) return;
        const currentItem = draft.items[selectedIdx];
        if (!currentItem) return;
        setCostEditValue(String(currentItem.unitCost || 0));
        setShowCostEditModal(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canOverrideLinePrice, draft.items, hasComprasModalOpen, selectedIdx]);

  const subtotal = useMemo(
    () => draft.items.reduce((acc, i) => acc + Number(i.qty) * Number(i.unitCost), 0),
    [draft.items]
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === draft.supplierId) || null,
    [suppliers, draft.supplierId]
  );
  const supplierHasCurrentAccount = Boolean(
    selectedSupplier?.enable_current_account ?? selectedSupplier?.enableCurrentAccount
  );

  const totalItems = useMemo(
    () => draft.items.reduce((acc, i) => acc + Number(i.qty), 0),
    [draft.items]
  );

  const applyQtyEdit = () => {
    const parsed = Number(qtyEditValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setToast?.({ message: "Cantidad invalida", type: "error" });
      return;
    }
    setDraft((prev) => {
      if (selectedIdx < 0 || selectedIdx >= prev.items.length) return prev;
      const next = [...prev.items];
      next[selectedIdx] = { ...next[selectedIdx], qty: Number(parsed) };
      return { ...prev, items: next };
    });
    setShowQtyEditModal(false);
  };

  const applyCostEdit = () => {
    const parsed = Number(costEditValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setToast?.({ message: "Precio invalido", type: "error" });
      return;
    }
    setDraft((prev) => {
      if (selectedIdx < 0 || selectedIdx >= prev.items.length) return prev;
      const next = [...prev.items];
      next[selectedIdx] = { ...next[selectedIdx], unitCost: Number(parsed) };
      return { ...prev, items: next };
    });
    setShowCostEditModal(false);
  };

  const addItem = (product) => {
    setDraft((prev) => {
      const costToUse = Number(unitCost) > 0 ? Number(unitCost) : Number(product.cost || 0);
      const idx = prev.items.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        const next = [...prev.items];
        next[idx] = {
          ...next[idx],
          qty: Number(next[idx].qty) + Number(qty || 1),
          unitCost: costToUse,
        };
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
            unitCost: costToUse,
          },
        ],
      };
    });
    setSearch("");
    setQty(1);
    setUnitCost("");
  };

  const addCurrentSearchItem = () => {
    if (!search.trim()) return;
    const exact = products.find(
      (p) =>
        String(p.codigo || p.sku).toLowerCase() === search.trim().toLowerCase() ||
        String(p.id).toLowerCase() === search.trim().toLowerCase()
    );
    if (exact) {
      addItem(exact);
    } else {
      setToast?.({ message: "Articulo no encontrado", type: "error" });
    }
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
      const payload = {
        supplierId: draft.supplierId,
        invoiceNumber: draft.invoiceNumber || "S/N",
        invoiceType: draft.invoiceType,
        paymentMethod: draft.paymentMethod,
        date: draft.date,
        items: draft.items.map((i) => ({
          productId: i.productId,
          qty: Number(i.qty),
          unitCost: Number(i.unitCost),
        })),
        total: subtotal,
        receiptImageDataUrl: draft.receiptImageDataUrl || null,
        receiptImageName: draft.receiptImageName || null,
      };

      await api.post("/purchases", payload);

      setToast?.({ message: "Compra registrada correctamente", type: "success" });
        setDraft({
          supplierId: "",
          supplierName: "",
          invoiceNumber: "",
          invoiceType: "Factura A",
          paymentMethod: "EFECTIVO",
          items: [],
          date: new Date().toISOString().split("T")[0],
          receiptImageDataUrl: "",
        receiptImageName: "",
      });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "Error al registrar compra",
        type: "error",
      });
    }
  };

  const removeSelected = () => {
    setDraft((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== selectedIdx) }));
    setSelectedIdx((x) => Math.max(0, x - 1));
  };

  const readImageFile = (file, onLoad) => {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setToast?.({ message: "Selecciona una imagen valida para la boleta", type: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onLoad(String(reader.result || ""), file.name || "boleta");
    reader.onerror = () => {
      setToast?.({ message: "No se pudo leer la imagen de la boleta", type: "error" });
    };
    reader.readAsDataURL(file);
  };

  const handleDraftReceiptChange = (event) => {
    const file = event.target.files?.[0];
    readImageFile(file, (dataUrl, fileName) => {
      setDraft((prev) => ({
        ...prev,
        receiptImageDataUrl: dataUrl,
        receiptImageName: fileName,
      }));
    });
    event.target.value = "";
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const { data } = await api.get("/purchases/history");
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch {
      setToast?.({ message: "No se pudo cargar el historial de compras", type: "error" });
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = async () => {
    setShowHistoryModal(true);
    await fetchHistory();
  };

  const openAttachReceipt = (purchaseId) => {
    setAttachingReceiptId(purchaseId);
    historyReceiptInputRef.current?.click();
  };

  const handleHistoryReceiptChange = async (event) => {
    const file = event.target.files?.[0];
    const purchaseId = attachingReceiptId;
    if (!file || !purchaseId) {
      event.target.value = "";
      return;
    }

    readImageFile(file, async (dataUrl, fileName) => {
      try {
        await api.patch(`/purchases/${purchaseId}/receipt`, {
          receiptImageDataUrl: dataUrl,
          receiptImageName: fileName,
        });
        setToast?.({ message: "Boleta asociada correctamente", type: "success" });
        await fetchHistory();
      } catch (err) {
        setToast?.({
          message: err.response?.data?.message || "No se pudo asociar la boleta",
          type: "error",
        });
      } finally {
        setAttachingReceiptId("");
      }
    });

    event.target.value = "";
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-2 overflow-hidden rounded-2xl bg-[#ededee] p-2 text-zinc-900">
      <div className="px-1 flex items-center gap-3 shrink-0">
        <button
          type="button"
          className="bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] rounded-lg px-3 h-[34px] flex items-center justify-center transition-colors text-[11px] font-black uppercase"
        >
          Volver al inicio (Esc)
        </button>
        <h1 className="text-[18px] md:text-[20px] font-bold leading-none text-zinc-900 tracking-tight">
          Ingreso de mercaderia y stock
        </h1>
        <div className="ml-auto">
          <button
            type="button"
            className="bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] rounded-lg px-3 h-[34px] flex items-center justify-center transition-colors text-[11px] font-black uppercase"
            onClick={openHistory}
          >
            Ver historial
          </button>
        </div>
      </div>

      <div className="px-1 shrink-0 text-sm text-zinc-700">
        Fecha: {draft.date.split("-").reverse().join("/")}
      </div>

      <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="sm:col-span-2 lg:col-span-4 text-[14px] font-black text-zinc-900">Datos del Comprobante</div>
        <div>
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">Tipo Comprobante</label>
          <select
            className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-[#d97706]"
            value={draft.invoiceType}
            onChange={(e) => setDraft((p) => ({ ...p, invoiceType: e.target.value }))}
          >
            <option value="Factura A">Factura A</option>
            <option value="Factura B">Factura B</option>
            <option value="Factura C">Factura C</option>
            <option value="Remito">Remito</option>
            <option value="Orden de Compra">Orden de Compra</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">N° Comprobante</label>
          <input
            type="text"
            className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-[#d97706]"
            placeholder="0001-00001234"
            value={draft.invoiceNumber}
            onChange={(e) => setDraft((p) => ({ ...p, invoiceNumber: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">Fecha Emision</label>
          <input
            type="date"
            className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-[#d97706]"
            value={draft.date}
            onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">Operador</label>
          <div className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-900">
            {user?.username || "ADMIN"}
          </div>
        </div>
        <div>
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">Medio de Pago</label>
          <select
            className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-[#d97706]"
            value={draft.paymentMethod}
            onChange={(e) => setDraft((p) => ({ ...p, paymentMethod: e.target.value }))}
          >
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
            <option value="OTRO">OTRO</option>
            {supplierHasCurrentAccount ? (
              <option value="CUENTA_CORRIENTE">CUENTA CORRIENTE</option>
            ) : null}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">Boleta</label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              ref={purchaseReceiptInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleDraftReceiptChange}
            />
            <button
              type="button"
              className="bg-white hover:bg-zinc-50 text-[#b26a1e] border border-[#caa57f] rounded-lg px-3 h-[38px] flex items-center justify-center transition-colors text-[11px] font-black uppercase"
              onClick={() => purchaseReceiptInputRef.current?.click()}
            >
              {draft.receiptImageDataUrl ? "Cambiar boleta" : "Cargar boleta"}
            </button>
            {draft.receiptImageDataUrl ? (
              <>
                <button
                  type="button"
                  className="bg-white hover:bg-zinc-50 text-sky-700 border border-sky-300 rounded-lg px-3 h-[38px] flex items-center justify-center transition-colors text-[11px] font-black uppercase"
                  onClick={() =>
                    setSelectedReceipt({
                      title: draft.receiptImageName || "Boleta adjunta",
                      url: draft.receiptImageDataUrl,
                    })
                  }
                >
                  Ver preview
                </button>
                <button
                  type="button"
                  className="bg-white hover:bg-zinc-50 text-rose-600 border border-rose-300 rounded-lg px-3 h-[38px] flex items-center justify-center transition-colors text-[11px] font-black uppercase"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      receiptImageDataUrl: "",
                      receiptImageName: "",
                    }))
                  }
                >
                  Quitar
                </button>
                <span className="text-xs text-zinc-600 truncate">{draft.receiptImageName || "Boleta cargada"}</span>
              </>
            ) : (
              <span className="text-xs text-zinc-500">Sin boleta adjunta</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl p-3 flex flex-col gap-3 shrink-0">
        <div className="text-[14px] font-black text-zinc-900">Identificacion del Proveedor</div>
        <div className="flex flex-col md:flex-row items-end gap-3 w-full">
          <div className="flex-1 w-full">
            <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide mb-1 block">Proveedor</label>
            <SearchableSelect
              inputRef={supplierSelectRef}
              options={suppliers.map((s) => ({
                id: s.id,
                label: String(s.businessName || s.name || "").toUpperCase(),
                subtext: s.taxId || s.cuit || "Sin CUIT",
              }))}
              value={draft.supplierId}
              onChange={(id) => {
                const supplier = suppliers.find((x) => x.id === id);
                setDraft((prev) => ({
                  ...prev,
                  supplierId: id,
                  supplierName: supplier?.businessName || supplier?.name || "",
                  paymentMethod:
                    prev.paymentMethod === "CUENTA_CORRIENTE" &&
                    !(supplier?.enable_current_account ?? supplier?.enableCurrentAccount)
                      ? "EFECTIVO"
                      : prev.paymentMethod,
                }));
              }}
              placeholder="Buscar proveedor (CUIT/Nombre)..."
              inputClassName="bg-white border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 placeholder:text-zinc-500 focus:border-[#d97706]"
              dropdownClassName="bg-white border-[#cfcfd4]"
              optionClassName="border-[#ececf1]"
            />
          </div>

          <button
            className="bg-[#f07c0f] hover:bg-[#df6f08] text-white border border-[#d86b07] rounded-lg px-5 h-[38px] flex items-center justify-center transition-colors text-[11px] font-black uppercase"
            onClick={() => supplierSelectRef.current?.focus()}
            type="button"
          >
            Buscar (F2)
          </button>
        </div>
      </div>

      <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#d8d8dc] flex flex-col gap-2 shrink-0">
          <div className="text-[16px] md:text-[18px] font-black text-zinc-900">Carga Rapida de Items</div>
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end">
            <div className="flex-1 flex gap-2 w-full items-center">
              <label className="text-[11px] font-black text-zinc-700 uppercase mr-2 shrink-0">Codigo:</label>
              <input
                ref={codeInputRef}
                className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-[#d97706] placeholder:text-zinc-500"
                placeholder="Escanee o tipee el codigo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCurrentSearchItem();
                  } else if (e.key === "F5") {
                    e.preventDefault();
                    setShowProductModal(true);
                  }
                }}
                autoComplete="off"
              />
              <button
                className="bg-white hover:bg-zinc-50 border border-[#caa57f] text-[#b26a1e] rounded-lg w-[38px] h-[38px] flex items-center justify-center transition-colors"
                onClick={() => setShowProductModal(true)}
                title="Busqueda de Articulos (F5)"
                type="button"
              >
                <span className="text-lg font-black">?</span>
              </button>
            </div>

            <div className="w-full sm:w-20">
              <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide block mb-1">Cantidad</label>
              <input
                type="number"
                min={1}
                className="w-full bg-white border border-[#cfcfd4] rounded-lg text-center text-base font-bold py-1.5 text-zinc-900 outline-none focus:border-[#d97706]"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>

            <div className="w-full sm:w-28">
              <label className="text-[9px] text-zinc-700 uppercase font-black tracking-wide block mb-1">Costo Unit.</label>
              <input
                type="number"
                min={0}
                placeholder="Auto"
                className="w-full bg-white border border-[#cfcfd4] rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-900 outline-none focus:border-[#d97706]"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>

            <button
              className="w-full xl:w-auto bg-[#f07c0f] hover:bg-[#df6f08] text-white font-black rounded-lg px-5 h-[38px] transition-colors text-[11px] uppercase"
              onClick={addCurrentSearchItem}
              type="button"
            >
              + Agregar al ingreso
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[11px] md:text-xs text-left min-w-[560px]">
            <thead className="text-[9px] uppercase text-zinc-600 tracking-wide bg-[#f5f5f6] border-b border-[#d8d8dc] sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 font-black w-16">CANT</th>
                <th className="px-3 py-2.5 font-black w-24">CODIGO</th>
                <th className="px-3 py-2.5 font-black">DESCRIPCION</th>
                <th className="px-3 py-2.5 font-black w-24 text-right">COSTO UNIT.</th>
                <th className="px-3 py-2.5 font-black w-24 text-right">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              {draft.items.map((it, idx) => (
                <tr
                  key={`${it.productId}-${idx}`}
                  onClick={() => setSelectedIdx(idx)}
                  className={`border-b border-[#e5e5e8] cursor-pointer ${selectedIdx === idx ? "bg-[#ffe9d2]" : "hover:bg-[#f8f8f9]"}`}
                >
                  <td className="px-3 py-2.5 text-zinc-800 font-medium">{it.qty}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{it.codigo || "-"}</td>
                  <td className="px-3 py-2.5 font-semibold text-zinc-900 uppercase">{it.name}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-700">${Number(it.unitCost).toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-zinc-900">
                    ${(Number(it.qty) * Number(it.unitCost)).toFixed(2)}
                  </td>
                </tr>
              ))}
              {!draft.items.length ? (
                <tr className="hover:bg-transparent">
                  <td colSpan={5} className="text-center py-10 text-zinc-400 focus:outline-none" />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#ededee] border border-[#d1d1d4] rounded-xl px-3 py-2 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-2 items-center">
            <div>
              <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Total Articulos</div>
              <div className="text-sm md:text-base font-bold text-zinc-900">{totalItems}</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Items cargados</div>
              <div className="text-sm md:text-base font-bold text-[#d97706]">{draft.items.length}</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase font-black tracking-wide">Total Ingreso</div>
              <div className="text-xl md:text-2xl font-black text-zinc-900">${subtotal.toFixed(2)}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:justify-end gap-2 lg:min-w-[360px]">
            {selectedIdx >= 0 && draft.items.length > 0 ? (
              <button
                className="bg-white hover:bg-zinc-50 text-rose-600 border border-rose-300 font-black px-3 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase"
                onClick={removeSelected}
                type="button"
              >
                Quitar Seleccion
              </button>
            ) : null}

            <button
              className="bg-[#f07c0f] hover:bg-[#df6f08] text-white font-black px-4 py-2 rounded-lg transition-colors text-[10px] md:text-[11px] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={submit}
              disabled={draft.items.length === 0 || !draft.supplierId}
            >
              Guardar Ingreso
            </button>
          </div>
        </div>
      </div>

      {showProductModal ? (
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
      ) : null}
      {showQtyEditModal ? (
        <QtyEditModal
          value={qtyEditValue}
          onChange={setQtyEditValue}
          onCancel={() => setShowQtyEditModal(false)}
          onApply={applyQtyEdit}
        />
      ) : null}
      {showCostEditModal ? (
        <QtyEditModal
          value={costEditValue}
          onChange={setCostEditValue}
          onCancel={() => setShowCostEditModal(false)}
          onApply={applyCostEdit}
          title="Editar costo"
          label="Nuevo costo transaccional"
          min="0"
          step="0.01"
        />
      ) : null}
      <input
        ref={historyReceiptInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleHistoryReceiptChange}
      />
      {showHistoryModal ? (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-2xl bg-[#111214] border border-zinc-800 flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-lg font-black uppercase tracking-wide text-white">Historial de compras</div>
                <div className="text-xs text-zinc-400">Boletas adjuntas y compras registradas</div>
              </div>
              <button
                type="button"
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 h-[36px] text-[11px] font-black uppercase"
                onClick={() => setShowHistoryModal(false)}
              >
                Cerrar
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead className="sticky top-0 bg-[#18191d] text-zinc-300 text-[10px] uppercase">
                  <tr>
                    <th className="px-3 py-3 text-left font-black">Fecha</th>
                    <th className="px-3 py-3 text-left font-black">Comprobante</th>
                    <th className="px-3 py-3 text-left font-black">Proveedor</th>
                    <th className="px-3 py-3 text-right font-black">Items</th>
                    <th className="px-3 py-3 text-right font-black">Total</th>
                    <th className="px-3 py-3 text-center font-black">Boleta</th>
                    <th className="px-3 py-3 text-center font-black">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-zinc-400">
                        Cargando historial...
                      </td>
                    </tr>
                  ) : historyRows.length ? (
                    historyRows.map((row) => (
                      <tr key={row.id} className="border-t border-zinc-800 text-zinc-100">
                        <td className="px-3 py-3">{new Date(row.purchase_date).toLocaleDateString("es-AR")}</td>
                        <td className="px-3 py-3">{row.purchase_number || "S/N"}</td>
                        <td className="px-3 py-3">{row.supplier_name || "SIN PROVEEDOR"}</td>
                        <td className="px-3 py-3 text-right">{Number(row.total_items || 0)}</td>
                        <td className="px-3 py-3 text-right font-bold">${Number(row.total_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-3 text-center">
                          {row.receipt_image_data_url ? (
                            <span className="inline-flex rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-1 text-[10px] font-black uppercase">
                              Cargada
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-zinc-700 text-zinc-200 px-2 py-1 text-[10px] font-black uppercase">
                              Sin boleta
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-2">
                            {row.receipt_image_data_url ? (
                              <button
                                type="button"
                                className="bg-white hover:bg-zinc-50 text-sky-700 border border-sky-300 rounded-lg px-3 h-[34px] text-[10px] font-black uppercase"
                                onClick={() =>
                                  setSelectedReceipt({
                                    title: row.receipt_image_name || `Boleta ${row.purchase_number || "S/N"}`,
                                    url: row.receipt_image_data_url,
                                  })
                                }
                              >
                                Ver boleta
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="bg-[#f07c0f] hover:bg-[#df6f08] text-white rounded-lg px-3 h-[34px] text-[10px] font-black uppercase"
                                onClick={() => openAttachReceipt(row.id)}
                              >
                                Asociar boleta
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-zinc-400">
                        No hay compras registradas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {selectedReceipt ? (
        <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-[#111214] border border-zinc-800 flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="text-sm font-black uppercase tracking-wide text-white">
                {selectedReceipt.title || "Boleta"}
              </div>
              <button
                type="button"
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 h-[34px] text-[11px] font-black uppercase"
                onClick={() => setSelectedReceipt(null)}
              >
                Cerrar
              </button>
            </div>
            <div className="p-4 bg-[#18191d] flex-1 overflow-auto flex items-center justify-center">
              <img
                src={selectedReceipt.url}
                alt={selectedReceipt.title || "Boleta"}
                className="max-w-full max-h-[75vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
