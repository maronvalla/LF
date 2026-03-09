import { useEffect, useState } from "react";
import api from "../api";

function getLocalDashboardDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDashboardDate(value) {
  if (!value) return "Sin fecha";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

export default function Dashboard({ user, setToast }) {
  const [metrics, setMetrics] = useState({
    date: "",
    totalSales: 0,
    cashAmount: 0,
    totalOrders: 0,
    pendingDeliveries: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const today = getLocalDashboardDate();
        const [dashboardRes, salesRes] = await Promise.all([
          api.get("/dashboard/summary").catch(() => ({ data: null })),
          api.get(`/sales?from=${today}&to=${today}`).catch(() => ({ data: [] })),
        ]);

        const dashboard = dashboardRes.data || {};
        const sales = Array.isArray(salesRes.data) ? salesRes.data : [];

        const fallbackTotalSales = sales.reduce((acc, sale) => acc + Number(sale.total_amount || 0), 0);
        const fallbackOrders = sales.length;
        const fallbackCash = sales
          .filter((sale) => String(sale.payment_method || "").toUpperCase() === "EFECTIVO")
          .reduce((acc, sale) => acc + Number(sale.total_amount || 0), 0);
        const fallbackPending = sales.filter(
          (sale) =>
            String(sale.sale_type || "").toUpperCase() === "ENVIO" &&
            String(sale.delivery_status || "").toUpperCase() !== "ENTREGADO"
        ).length;

        setMetrics({
          date: String(dashboard.date || today),
          totalSales: Number(dashboard.total_sales ?? fallbackTotalSales ?? 0),
          cashAmount: Number(dashboard.cash_amount ?? dashboard.cash_in_box ?? fallbackCash ?? 0),
          totalOrders: Number(dashboard.total_orders ?? fallbackOrders ?? 0),
          pendingDeliveries: Number(dashboard.pending_deliveries ?? fallbackPending ?? 0),
        });
      } catch {
        setToast({ message: "No se pudieron cargar metricas del dashboard", type: "error" });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [setToast]);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="text-2xl font-black text-burnt-500 uppercase">Dashboard</div>
        <div className="text-zinc-400 mt-2">Usuario: {user?.fullName || user?.username}</div>
        <div className="text-zinc-500 mt-1 text-xs uppercase tracking-[0.28em]">
          Fecha operativa: {loading ? "-" : formatDashboardDate(metrics.date)}
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">Ventas del dia</div>
          <div className="text-2xl font-black text-emerald-400">
            {loading ? "-" : `$${Number(metrics.totalSales || 0).toLocaleString("es-AR")}`}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">Monto de caja</div>
          <div className="text-2xl font-black text-burnt-500">
            {loading ? "-" : `$${Number(metrics.cashAmount || 0).toLocaleString("es-AR")}`}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">Tickets</div>
          <div className="text-2xl font-black text-sky-400">{loading ? "-" : Number(metrics.totalOrders || 0)}</div>
        </div>
        <div className="card p-4">
          <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">Envios pendientes</div>
          <div className="text-2xl font-black text-yellow-400">
            {loading ? "-" : Number(metrics.pendingDeliveries || 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
