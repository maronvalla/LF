import React, { useEffect, useMemo, useState } from "react";
import api from "../api";

interface Venta {
  id: string;
  saleNumber: string;
  fecha: string;
  cliente: string;
  sellerId: string;
  vendedor: string;
  total: number;
  metodoPago: "EFECTIVO" | "TRANSFERENCIA" | "MIXTO";
  estado: "COMPLETADO" | "ANULADO" | "PENDIENTE" | "PREPARADO" | "CARGADO" | "ENTREGADO" | "RECHAZADO" | "NO_ESTABA";
  comprobanteUrl?: string;
}

type ApiSale = Record<string, any>;

const resolveMetodoPago = (row: ApiSale): Venta["metodoPago"] => {
  const finalMethod = String(row.delivery_final_payment_method || "").toUpperCase();
  const baseMethod = String(row.payment_method || "").toUpperCase();
  const method = finalMethod || baseMethod;
  if (method === "TRANSFERENCIA") return "TRANSFERENCIA";
  if (method === "MIXTO") return "MIXTO";
  return "EFECTIVO";
};

const resolveEstado = (row: ApiSale): Venta["estado"] => {
  const raw = String(row.status || "").toUpperCase();
  const deliveryRaw = String(row.delivery_status || "").toUpperCase();

  if (raw === "ANULADO") return "ANULADO";
  if (deliveryRaw === "ENTREGADO") return "ENTREGADO";
  if (deliveryRaw === "RECHAZADO") return "RECHAZADO";
  if (deliveryRaw === "NO_ESTABA") return "NO_ESTABA";
  if (raw === "PENDIENTE") return "PENDIENTE";
  if (raw === "PREPARADO") return "PREPARADO";
  if (raw === "CARGADO") return "CARGADO";
  return "COMPLETADO";
};

const mapSale = (row: ApiSale): Venta => {
  const hasProof = Boolean(row.delivery_transfer_proof_base64);
  const mimeType = String(row.delivery_transfer_proof_mime_type || "image/jpeg");
  const proofData = String(row.delivery_transfer_proof_base64 || "");

  return {
    id: String(row.id || ""),
    saleNumber: String(row.sale_number || ""),
    fecha: String(row.created_at || new Date().toISOString()),
    cliente: String(row.customer_name || "CONSUMIDOR FINAL"),
    sellerId: String(row.created_by || ""),
    vendedor: String(row.created_by_name || row.created_by_username || "-"),
    total: Number(row.total_amount || 0),
    metodoPago: resolveMetodoPago(row),
    estado: resolveEstado(row),
    comprobanteUrl: hasProof ? `data:${mimeType};base64,${proofData}` : "",
  };
};

export default function ConsultarVentas() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [vendedorFilter, setVendedorFilter] = useState("");
  const [clienteFilter, setClienteFilter] = useState("");

  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const vendedorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const venta of ventas) {
      if (!venta.sellerId) continue;
      if (!map.has(venta.sellerId)) map.set(venta.sellerId, venta.vendedor || "SIN NOMBRE");
    }
    return Array.from(map.entries());
  }, [ventas]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedReceipt) {
        setSelectedReceipt(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedReceipt]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVentas();
    }, 250);
    return () => clearTimeout(timer);
  }, [fechaDesde, fechaHasta, vendedorFilter, clienteFilter]);

  const fetchVentas = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      const params: Record<string, string> = {};
      if (fechaDesde) params.from = fechaDesde;
      if (fechaHasta) params.to = fechaHasta;
      if (vendedorFilter) params.seller = vendedorFilter;
      if (clienteFilter.trim()) params.customer = clienteFilter.trim();

      const { data } = await api.get("/sales", { params });
      setVentas((Array.isArray(data) ? data : []).map(mapSale));
    } catch (err: any) {
      setVentas([]);
      setErrorMessage(err?.response?.data?.message || "No se pudieron cargar las ventas");
    } finally {
      setLoading(false);
    }
  };

  const handleAnular = (id: string) => {
    setCancelTargetId(id);
    setCancelReason("");
    setErrorMessage("");
  };

  const confirmAnular = async () => {
    if (!cancelTargetId) return;
    const reason = String(cancelReason || "").trim();
    if (reason.length < 3) {
      setErrorMessage("El motivo de anulacion debe tener al menos 3 caracteres");
      return;
    }

    try {
      await api.post(`/sales/${cancelTargetId}/anular`, { reason });
      await fetchVentas();
      setCancelTargetId(null);
      setCancelReason("");
      setErrorMessage("");
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || "No se pudo anular la venta");
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 text-white animate-in fade-in duration-300">
      <div className="card bg-graphite-900 border-zinc-800 p-4 shrink-0 shadow-lg">
        <h2 className="text-xl font-black text-burnt-500 uppercase mb-4 tracking-widest">Auditoria de Ventas</h2>
        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-300">
            {errorMessage}
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">Desde</label>
            <input
              type="date"
              className="w-full bg-zinc-950 border-2 border-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-burnt-500 rounded-lg text-zinc-300 transition-colors"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">Hasta</label>
            <input
              type="date"
              className="w-full bg-zinc-950 border-2 border-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-burnt-500 rounded-lg text-zinc-300 transition-colors"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">Vendedor / Chofer</label>
            <select
              className="w-full bg-zinc-950 border-2 border-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-burnt-500 rounded-lg text-zinc-300 transition-colors uppercase"
              value={vendedorFilter}
              onChange={(e) => setVendedorFilter(e.target.value)}
            >
              <option value="">TODOS</option>
              {vendedorOptions.map(([id, label]) => (
                <option key={id} value={id}>{String(label || "").toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1 block">Buscar Cliente</label>
            <input
              type="text"
              placeholder="Razon Social..."
              className="w-full bg-zinc-950 border-2 border-zinc-800 px-3 py-2 text-sm font-bold outline-none focus:border-burnt-500 rounded-lg text-zinc-300 transition-colors uppercase placeholder:text-zinc-600"
              value={clienteFilter}
              onChange={(e) => setClienteFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-graphite-900 border border-zinc-800 rounded-xl flex flex-col shadow-2xl">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead className="bg-zinc-950 text-[10px] text-zinc-500 uppercase sticky top-0 font-black z-10 shadow-sm border-b border-zinc-800">
              <tr>
                <th className="p-4 text-left border-r border-zinc-800 w-28 tracking-widest">Nro Venta</th>
                <th className="p-4 text-left border-r border-zinc-800 w-36">Fecha / Hora</th>
                <th className="p-4 text-left border-r border-zinc-800">Cliente</th>
                <th className="p-4 text-left border-r border-zinc-800 w-32">Vendedor</th>
                <th className="p-4 text-right border-r border-zinc-800 w-32">Monto Total</th>
                <th className="p-4 text-center border-r border-zinc-800 w-36">Metodo Pago</th>
                <th className="p-4 text-center border-r border-zinc-800 w-32">Estado</th>
                <th className="p-4 text-center w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-zinc-600 font-bold uppercase tracking-widest">
                    {loading ? "Cargando ventas..." : "Ninguna venta encontrada para estos filtros"}
                  </td>
                </tr>
              ) : (
                ventas.map((venta, idx) => (
                  <tr key={venta.id} className={`border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? "bg-black/20" : ""}`}>
                    <td className="p-4 font-mono text-zinc-500 text-xs font-bold border-r border-zinc-800">#{venta.saleNumber || venta.id.slice(0, 8)}</td>
                    <td className="p-4 text-xs font-mono text-zinc-400 border-r border-zinc-800">
                      {new Date(venta.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="p-4 font-bold uppercase truncate max-w-[200px] border-r border-zinc-800">{venta.cliente}</td>
                    <td className="p-4 uppercase text-xs text-zinc-400 font-bold border-r border-zinc-800">{venta.vendedor}</td>
                    <td className="p-4 text-right font-black text-emerald-400 border-r border-zinc-800 text-base">${venta.total.toLocaleString("es-AR")}</td>
                    <td className="p-4 text-center border-r border-zinc-800">
                      <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                        venta.metodoPago === "EFECTIVO"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : venta.metodoPago === "TRANSFERENCIA"
                          ? "bg-sky-500/10 text-sky-500 border-sky-500/20"
                          : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                      }`}>
                        {venta.metodoPago}
                      </span>
                    </td>
                    <td className="p-4 text-center border-r border-zinc-800">
                      <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                        venta.estado === "ANULADO"
                          ? "bg-rose-500/20 text-rose-500"
                          : venta.estado === "ENTREGADO"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : venta.estado === "RECHAZADO" || venta.estado === "NO_ESTABA"
                          ? "bg-orange-500/20 text-orange-400"
                          : venta.estado === "CARGADO"
                          ? "bg-sky-500/20 text-sky-400"
                          : venta.estado === "PREPARADO"
                          ? "bg-violet-500/20 text-violet-300"
                          : venta.estado === "PENDIENTE"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "text-zinc-500"
                      }`}>
                        {venta.estado}
                      </span>
                    </td>
                    <td className="p-3 text-center flex justify-center gap-2">
                      {(venta.metodoPago === "TRANSFERENCIA" || venta.metodoPago === "MIXTO" || Boolean(venta.comprobanteUrl)) ? (
                        <button
                          title="Ver Comprobante"
                          onClick={() => setSelectedReceipt(venta.comprobanteUrl || "")}
                          className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-sky-600 hover:border-sky-500 text-zinc-400 hover:text-white flex items-center justify-center transition-all shadow-md"
                        >
                          <span>OJO</span>
                        </button>
                      ) : (
                        <div className="w-8 h-8" />
                      )}

                      {venta.estado !== "ANULADO" ? (
                        <button
                          title="Anular Venta"
                          onClick={() => handleAnular(venta.id)}
                          className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-rose-600 hover:border-rose-500 text-zinc-500 hover:text-white flex items-center justify-center transition-all shadow-md font-black text-lg"
                        >
                          <span>X</span>
                        </button>
                      ) : (
                        <div className="w-8 h-8" />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReceipt && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-graphite-950 border border-zinc-800 rounded-3xl w-full max-w-md flex flex-col overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200">
            <div className="bg-zinc-950 p-5 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-zinc-300 font-black uppercase tracking-widest text-xs">Comprobante Adjunto</h3>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-white flex items-center justify-center text-xl font-black transition-colors"
                title="Cerrar"
              >
                X
              </button>
            </div>

            <div className="p-8 flex justify-center bg-zinc-900/50 min-h-[300px] items-center">
              {selectedReceipt.startsWith("http") || selectedReceipt.startsWith("data:image") ? (
                <img
                  src={selectedReceipt}
                  alt="Comprobante pago"
                  className="max-h-[60vh] object-contain rounded-xl shadow-2xl ring-1 ring-zinc-800/50"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-500 gap-3 opacity-60">
                  <span className="uppercase font-black text-[10px] tracking-widest block px-6 text-center">
                    COMPROBANTE NO DISPONIBLE O SIN FORMATO GRAFICO
                  </span>
                </div>
              )}
            </div>

            <div className="p-5 bg-zinc-950 text-center border-t border-zinc-800 flex justify-end">
              <button
                className="btn btn-muted px-6 h-10 text-[10px] font-black uppercase tracking-widest"
                onClick={() => setSelectedReceipt(null)}
              >
                Cerrar (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTargetId && (
        <div className="fixed inset-0 z-[520] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-graphite-950 border border-zinc-800 rounded-2xl w-full max-w-lg p-5 space-y-4">
            <div className="text-sm font-black uppercase tracking-wider text-rose-400">Anular venta {cancelTargetId}</div>
            <div>
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Motivo obligatorio</label>
              <textarea
                className="w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-white outline-none focus:border-rose-500 resize-none"
                rows={4}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Detalle del motivo de anulacion..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn btn-muted" onClick={() => setCancelTargetId(null)}>Cancelar</button>
              <button
                className="btn bg-rose-600 hover:bg-rose-500 text-white"
                onClick={confirmAnular}
              >
                Confirmar anulacion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
