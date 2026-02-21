import { useState, useEffect, useMemo, useRef } from "react";
import api from "../api";
import SearchableSelect from "./SearchableSelect";
import ProductSearchModal from "./ProductSearchModal";

export default function Compras({ user, setToast }) {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const [showProductModal, setShowProductModal] = useState(false);
  const codeInputRef = useRef(null);
  const supplierSelectRef = useRef(null);

  const [draft, setDraft] = useState({
    supplierId: "",
    supplierName: "",
    invoiceNumber: "",
    invoiceType: "Factura A",
    items: [],
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [p, s] = await Promise.all([
          api.get("/products"),
          api.get("/suppliers").catch(() => ({ data: [] }))
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
    const onKeyDown = (e) => {
      if (document.querySelector(".fixed.inset-0")) return;
      if (e.key === "F2") {
        e.preventDefault();
        supplierSelectRef.current?.focus();
      }
      if (e.key === "F5") {
        e.preventDefault();
        setShowProductModal(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const subtotal = useMemo(
    () => draft.items.reduce((acc, i) => acc + Number(i.qty) * Number(i.unitCost), 0),
    [draft.items]
  );

  const addItem = (product) => {
    setDraft((prev) => {
      const costToUse = Number(unitCost) > 0 ? Number(unitCost) : Number(product.cost || 0);
      const idx = prev.items.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        const next = [...prev.items];
        next[idx] = {
          ...next[idx],
          qty: Number(next[idx].qty) + Number(qty || 1),
          unitCost: costToUse
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
            unitCost: costToUse
          },
        ],
      };
    });
    setSearch("");
    setQty(1);
    setUnitCost("");
  };

  const submit = async () => {
    if (!draft.supplierId) {
      setToast?.({ message: "Seleccione un proveedor", type: "error" });
      return;
    }
    if (!draft.items.length) {
      setToast?.({ message: "Compra vacía", type: "error" });
      return;
    }

    try {
      const payload = {
        supplierId: draft.supplierId,
        invoiceNumber: draft.invoiceNumber || "S/N",
        invoiceType: draft.invoiceType,
        date: draft.date,
        items: draft.items.map((i) => ({
          productId: i.productId,
          qty: Number(i.qty),
          unitCost: Number(i.unitCost),
        })),
        total: subtotal
      };

      await api.post("/purchases", payload); // Assuming this endpoint exists or will exist

      setToast?.({ message: "Compra registrada correctamente", type: "success" });
      setDraft({
        supplierId: "",
        supplierName: "",
        invoiceNumber: "",
        invoiceType: "Factura A",
        items: [],
        date: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error al registrar compra", type: "error" });
    }
  };

  return (
    <div className="h-full flex flex-col space-y-3 text-white">
      {/* Header */}
      <div className="px-1 flex justify-between items-end">
        <div>
          <h1 className="text-[28px] font-bold leading-none text-white tracking-tight">Compras</h1>
          <p className="text-xs text-zinc-400 mt-1">Ingreso de mercadería y stock</p>
        </div>
      </div>

      {/* Row 1: Top parameters */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div>
          <label className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Tipo Comprobante</label>
          <select
            className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-xs font-bold text-white outline-none focus:border-[#e85d04]"
            value={draft.invoiceType}
            onChange={(e) => setDraft(p => ({ ...p, invoiceType: e.target.value }))}
          >
            <option value="Factura A">Factura A</option>
            <option value="Factura B">Factura B</option>
            <option value="Factura C">Factura C</option>
            <option value="Remito">Remito</option>
            <option value="Orden de Compra">Orden de Compra</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Nº Comprobante</label>
          <input
            type="text"
            className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-xs font-bold text-white outline-none focus:border-[#e85d04]"
            placeholder="0001-00001234"
            value={draft.invoiceNumber}
            onChange={(e) => setDraft(p => ({ ...p, invoiceNumber: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Fecha Emisión</label>
          <input
            type="date"
            className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded p-2 text-xs font-bold text-white outline-none focus:border-[#e85d04]"
            value={draft.date}
            onChange={(e) => setDraft(p => ({ ...p, date: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Operador</label>
          <div className="w-full p-2.5 text-xs text-zinc-300 font-mono">
            {user?.username || "ADMIN"}
          </div>
        </div>
      </div>

      {/* Row 2: Supplier */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-3 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row items-end gap-3 w-full">
          <div className="flex-1 w-full">
            <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Proveedor</label>
            <SearchableSelect
              inputRef={supplierSelectRef}
              options={suppliers.map(s => ({
                id: s.id,
                label: String(s.businessName || s.name || "").toUpperCase(),
                subtext: s.taxId || s.cuit || "Sin CUIT"
              }))}
              value={draft.supplierId}
              onChange={(id) => {
                const s = suppliers.find((x) => x.id === id);
                setDraft((prev) => ({
                  ...prev,
                  supplierId: id,
                  supplierName: s?.businessName || s?.name || "",
                }));
              }}
              placeholder="Buscar proveedor..."
            />
          </div>

          <button
            className="bg-[#2a2a2a] hover:bg-[#333] text-white border border-zinc-700/50 rounded-lg px-6 h-[38px] flex flex-col items-center justify-center transition-colors"
            onClick={() => supplierSelectRef.current?.focus()}
          >
            <span className="text-xs font-bold leading-none mb-1">BUSCAR</span>
            <span className="text-[9px] text-zinc-400 leading-none">(F2)</span>
          </button>
        </div>
      </div>

      {/* Row 3: Items Grid */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg flex-1 flex flex-col min-h-0 relative">
        <div className="p-4 border-b border-zinc-800/50 flex flex-col gap-1">
          <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest block mb-1">Carga Rápida de Artículos</label>
          <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center">

            <div className="flex-1 flex gap-2 w-full items-center">
              <label className="text-sm font-black text-zinc-400 uppercase hidden md:inline-block mr-2">Código:</label>
              <input
                ref={codeInputRef}
                className="w-1/3 min-w-[200px] bg-[#1a1a1a] border border-zinc-800/80 rounded p-2.5 text-lg font-bold text-white outline-none focus:border-[#e85d04] placeholder-zinc-700 font-mono"
                placeholder="Escanee o tipee el código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!search.trim()) return;
                    const exact = products.find(p => String(p.codigo || p.sku).toLowerCase() === search.trim().toLowerCase() || String(p.id).toLowerCase() === search.trim().toLowerCase());
                    if (exact) {
                      addItem(exact);
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
                className="bg-[#2a2a2a] hover:bg-[#333] border border-zinc-700/50 text-white rounded w-[50px] h-[46px] flex flex-col items-center justify-center transition-colors shadow-md"
                onClick={() => setShowProductModal(true)}
                title="Búsqueda de Artículos (F5)"
              >
                <span className="text-lg">🔍</span>
                <span className="text-[9px] font-bold text-zinc-400 leading-none -mt-1 hidden">F5</span>
              </button>
            </div>

            <div className="w-full sm:w-32 relative flex items-center gap-3 bg-[#1a1a1a] border border-zinc-800/80 rounded p-2">
              <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest absolute -top-5 left-0">Costo Unit.</label>
              <span className="text-zinc-500 font-bold">$</span>
              <input
                type="number"
                min={0}
                placeholder="Auto"
                className="w-full bg-transparent text-lg font-bold text-white outline-none"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>

            <div className="w-full sm:w-24 relative flex items-center gap-3 bg-[#1a1a1a] border border-zinc-800/80 rounded p-2">
              <label className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest absolute -top-5 left-0">CANT</label>
              <input
                type="number"
                min={1}
                className="w-full bg-transparent text-lg font-bold text-[#e85d04] outline-none text-right"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>

            <button
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded px-4 h-[46px] transition-colors"
              onClick={() => {
                if (!search.trim()) return;
                const exact = products.find(p => String(p.codigo || p.sku).toLowerCase() === search.trim().toLowerCase() || String(p.id).toLowerCase() === search.trim().toLowerCase());
                if (exact) addItem(exact);
              }}
            >
              Cargar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-xs md:text-[11px] text-left min-w-[600px]">
            <thead className="text-[10px] md:text-[9px] uppercase text-zinc-500 tracking-widest bg-[#121212] border-b border-zinc-800/50 sticky top-0 z-10">
              <tr>
                <th className="px-5 py-3 font-black w-20">CANT</th>
                <th className="px-5 py-3 font-black w-40">CÓDIGO</th>
                <th className="px-5 py-3 font-black">DESCRIPCIÓN</th>
                <th className="px-5 py-3 font-black w-32 text-right">COSTO UNIT.</th>
                <th className="px-5 py-3 font-black w-32 text-right">SUBTOTAL</th>
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
                  <td className="px-5 py-3 text-right text-zinc-300">${Number(it.unitCost).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-bold text-white">${(Number(it.qty) * Number(it.unitCost)).toFixed(2)}</td>
                </tr>
              ))}
              {!draft.items.length && (
                <tr className="hover:bg-transparent">
                  <td colSpan={5} className="text-center py-16 text-zinc-600 focus:outline-none">
                    {/* Empty Table */}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer / Resumen */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left summary blocks */}
        <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-4 flex-1 flex justify-between items-center">

          <div className="flex gap-12">
            <div>
              <div className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1.5">Total Artículos</div>
              <div className="text-xl font-bold text-[#e85d04]">{draft.items.reduce((acc, i) => acc + Number(i.qty), 0)}</div>
            </div>
          </div>

          <div className="flex justify-end pr-2">
            {selectedIdx >= 0 && draft.items.length > 0 && (
              <button
                className="text-rose-500 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500/10 px-4 py-2.5 rounded-lg border border-rose-500/20 transition-colors"
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
        <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-5 w-full md:w-72 flex flex-col items-center justify-center text-center shrink-0">
          <div className="text-[10px] md:text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1 w-full flex justify-between px-2">
            <span>Total Compra</span>
          </div>
          <div className="text-4xl md:text-4xl leading-none font-black text-white w-full mb-4 px-2 text-right truncate">
            ${subtotal.toFixed(2)}
          </div>

          <button
            className="w-full bg-[#e85d04] hover:bg-[#d14f00] text-white font-black py-3 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2 leading-none disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={submit}
            disabled={draft.items.length === 0 || !draft.supplierId}
          >
            <span className="text-[11px] md:text-sm">GUARDAR COMPRA</span>
          </button>
        </div>
      </div>

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
    </div>
  );
}
