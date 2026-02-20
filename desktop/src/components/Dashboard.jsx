import { useEffect, useState } from "react";
import api from "../api";

export default function Dashboard({ user, setToast }) {
  const [metrics, setMetrics] = useState({
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
        const [dashboardRes, salesRes] = await Promise.all([
          api.get("/dashboard").catch(() => ({ data: null })),
          api.get("/sales").catch(() => ({ data: [] })),
        ]);

        const dashboard = dashboardRes.data || {};
        const sales = Array.isArray(salesRes.data) ? salesRes.data : [];

        const fallbackTotalSales = sales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
        const fallbackOrders = sales.length;
        const fallbackCash = sales
          .filter((s) => String(s.payment_method || "").toUpperCase() === "EFECTIVO")
          .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
        const fallbackPending = sales.filter(
          (s) =>
            String(s.sale_type || "").toUpperCase() === "ENVIO" &&
            String(s.delivery_status || "").toUpperCase() !== "ENTREGADO"
        ).length;

        setMetrics({
          totalSales: Number(dashboard.total_sales ?? fallbackTotalSales ?? 0),
          cashAmount: Number(dashboard.cash_amount ?? dashboard.cash_in_box ?? fallbackCash ?? 0),
          totalOrders: Number(dashboard.total_orders ?? fallbackOrders ?? 0),
          pendingDeliveries: Number(dashboard.pending_deliveries ?? fallbackPending ?? 0),
        });
      } catch {
        setToast?.({ message: "No se pudieron cargar metricas del dashboard", type: "error" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [setToast]);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="text-2xl font-black text-[#e85d04] uppercase">Dashboard</div>
        <div className="text-zinc-400 mt-2">Usuario: {user?.fullName || user?.username}</div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <MetricCard
          label="Ventas del dia"
          value={loading ? "-" : `$${Number(metrics.totalSales || 0).toLocaleString("es-AR")}`}
          valueClass="text-emerald-400"
        />
        <MetricCard
          label="Monto de caja"
          value={loading ? "-" : `$${Number(metrics.cashAmount || 0).toLocaleString("es-AR")}`}
          valueClass="text-[#e85d04]"
        />
        <MetricCard
          label="Tickets"
          value={loading ? "-" : Number(metrics.totalOrders || 0)}
          valueClass="text-sky-400"
        />
        <MetricCard
          label="Envios pendientes"
          value={loading ? "-" : Number(metrics.pendingDeliveries || 0)}
          valueClass="text-yellow-400"
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, valueClass }) {
  return (
    <div className="card p-4 rounded-lg">
      <div className="text-zinc-400 text-sm italic uppercase font-bold tracking-wider">{label}</div>
      <div className={`text-2xl font-black ${valueClass}`}>{value}</div>
    </div>
  );
}
