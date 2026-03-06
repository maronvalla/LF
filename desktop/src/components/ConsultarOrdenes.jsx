import { useEffect, useMemo, useState } from "react";
import api from "../api";

export default function ConsultarOrdenes({ setToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/sales/my-orders-today");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setToast?.({
        message: err?.response?.data?.message || "No se pudieron cargar tus ordenes pendientes",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const total = useMemo(
    () => rows.reduce((acc, row) => acc + Number(row.total_amount || 0), 0),
    [rows]
  );

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden rounded-xl bg-[#ededee] p-3 text-zinc-900">
      <div className="flex items-center justify-between rounded-xl border border-zinc-300 bg-white px-4 py-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Consultar ordenes</div>
          <div className="text-sm font-bold text-zinc-800">Solo pendientes de cobro (hoy)</div>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
        >
          Actualizar
        </button>
      </div>

      <div className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-600">
        Ordenes: {rows.length} | Total: ${Number(total || 0).toFixed(2)}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-300 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700">
            <tr className="text-left text-[11px] font-black uppercase tracking-wider">
              <th className="px-3 py-2">Nro orden</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2">Monto</th>
              <th className="px-3 py-2">Hora</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-200">
                <td className="px-3 py-2 font-bold text-zinc-900">{row.sale_number || row.id}</td>
                <td className="px-3 py-2 font-semibold text-zinc-800">{row.customer_name || "CONSUMIDOR FINAL"}</td>
                <td className="px-3 py-2 font-semibold text-zinc-700">{row.seller_name || "N/A"}</td>
                <td className="px-3 py-2 font-black text-emerald-700">${Number(row.total_amount || 0).toFixed(2)}</td>
                <td className="px-3 py-2 font-semibold text-zinc-700">
                  {row.created_at
                    ? new Date(row.created_at).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </td>
                <td className="px-3 py-2 font-bold text-zinc-600">{String(row.status || "").toUpperCase() || "-"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                  No hay ordenes tuyas pendientes de cobro hoy.
                </td>
              </tr>
            ) : null}
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                  Cargando...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
