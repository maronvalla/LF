import { useEffect, useState, useMemo } from "react";
import api from "../api";

export default function Inventario({ setToast }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("TRANSFER_GALPON_LOCAL");

  // Load Inventory
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get("/products");
      // Map and guarantee galpon/local properties in case backend doesn't provide them yet
      const list = (res.data || []).map(p => ({
        ...p,
        stock_galpon: p.stock_galpon || 0,
        stock_local: p.stock_local || 0
      }));
      setProducts(list);
    } catch {
      setToast?.({ message: "Error cargando inventario", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleTransfer = async () => {
    if (!selectedProductId) return setToast?.({ message: "Seleccione un producto", type: "error" });
    if (qty <= 0) return setToast?.({ message: "La cantidad debe ser mayor a 0", type: "error" });

    try {
      await api.post("/inventory/transfer", {
        productId: selectedProductId,
        quantity: Number(qty),
        reason
      });
      setToast?.({ message: "Transferencia realizada con éxito", type: "success" });
      setSelectedProductId("");
      setQty(1);
      // Reload inventory counts
      fetchProducts();
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "Error al transferir", type: "error" });
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 text-white">
      {/* Header */}
      <div className="px-1">
        <h1 className="text-3xl font-bold leading-none text-white tracking-tight">Inventario</h1>
        <p className="text-xs text-zinc-400 mt-1">Fase 1 - sistema interno</p>
      </div>

      {/* Transfer Panel */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-6 items-end">
          <div className="lg:col-span-2">
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Producto</label>
            <select
              className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded-lg p-3 text-sm font-bold text-white outline-none focus:border-[#e85d04]"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {String(p.name).toUpperCase()} - {p.sku || "N/A"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Cantidad</label>
            <input
              type="number"
              min={1}
              className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded-lg p-3 text-sm font-bold text-white outline-none focus:border-[#e85d04]"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 block">Motivo</label>
            <input
              readOnly
              className="w-full bg-[#1a1a1a] border border-zinc-800/80 rounded-lg p-3 text-sm font-bold text-white outline-none"
              value={reason}
            />
          </div>
          <div>
            <button
              className="w-full h-[46px] bg-[#e85d04] hover:bg-[#d14f00] text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
              onClick={handleTransfer}
              disabled={loading || !selectedProductId}
            >
              Transferir GALPON a LOCAL
            </button>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg flex-1 flex flex-col min-h-0 relative">
        <div className="flex-1 overflow-auto p-2">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase text-zinc-500 tracking-widest border-b border-zinc-800/50 sticky top-0 bg-[#121212] z-10">
              <tr>
                <th className="px-5 py-4 font-black">Producto</th>
                <th className="px-5 py-4 font-black w-48">SKU</th>
                <th className="px-5 py-4 font-black w-32 text-center text-[#e85d04]">GALPON</th>
                <th className="px-5 py-4 font-black w-32 text-center">LOCAL</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-zinc-600">
                    Cargando inventario...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-zinc-600">
                    No hay productos configurados
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors"
                  >
                    <td className="px-5 py-4 font-semibold text-zinc-200">{p.name}</td>
                    <td className="px-5 py-4 text-zinc-400 font-mono">{p.sku || "-"}</td>
                    <td className="px-5 py-4 text-center font-bold text-[#e85d04]">{p.stock_galpon}</td>
                    <td className="px-5 py-4 text-center font-bold text-zinc-300">{p.stock_local}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
