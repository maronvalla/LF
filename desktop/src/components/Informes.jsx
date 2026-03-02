import { useEffect, useMemo, useState } from "react";
import api from "../api";

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{title}</div>
      <div className="mt-2 text-3xl font-black text-zinc-900">{value}</div>
      {subtitle ? <div className="mt-1 text-sm text-zinc-500">{subtitle}</div> : null}
    </div>
  );
}

export default function Informes({ setToast }) {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({
    dateFrom: today.slice(0, 8) + "01",
    dateTo: today,
  });
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState({
    monthlySales: [],
    monthlyBudgets: [],
    productRanking: [],
    channelRanking: { envio: [], mostrador: [] },
    clientRanking: [],
    profits: {
      day: { soldAmount: 0, costAmount: 0, profit: 0 },
      month: { soldAmount: 0, costAmount: 0, profit: 0 },
      range: { soldAmount: 0, costAmount: 0, profit: 0 },
    },
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reports/overview", { params: filters });
      setReport({
        monthlySales: Array.isArray(data?.monthlySales) ? data.monthlySales : [],
        monthlyBudgets: Array.isArray(data?.monthlyBudgets) ? data.monthlyBudgets : [],
        productRanking: Array.isArray(data?.productRanking) ? data.productRanking : [],
        channelRanking: data?.channelRanking || { envio: [], mostrador: [] },
        clientRanking: Array.isArray(data?.clientRanking) ? data.clientRanking : [],
        profits: data?.profits || report.profits,
      });
    } catch (error) {
      setToast?.({
        message: error?.response?.data?.message || "No se pudieron cargar informes",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const topProducts = useMemo(() => report.productRanking.slice(0, 15), [report.productRanking]);
  const topClients = useMemo(() => report.clientRanking.slice(0, 15), [report.clientRanking]);

  return (
    <div className="flex h-full flex-col gap-4 text-zinc-900">
      <div className="px-1">
        <h1 className="text-[28px] font-bold leading-none tracking-tight text-zinc-900">Informes</h1>
        <div className="mt-1 text-sm text-zinc-500">
          Ventas, presupuestos, ranking de productos, clientes y ganancia.
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Desde</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-900"
              value={filters.dateFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Hasta</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-900"
              value={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="h-[44px] rounded-xl bg-[#e85d04] px-5 font-black text-white"
              onClick={load}
              disabled={loading}
            >
              {loading ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          title="Ganancia del dia"
          value={formatMoney(report.profits.day.profit)}
          subtitle={`Vendido ${formatMoney(report.profits.day.soldAmount)} / Costo ${formatMoney(report.profits.day.costAmount)}`}
        />
        <StatCard
          title="Ganancia del mes"
          value={formatMoney(report.profits.month.profit)}
          subtitle={`Vendido ${formatMoney(report.profits.month.soldAmount)} / Costo ${formatMoney(report.profits.month.costAmount)}`}
        />
        <StatCard
          title="Ganancia del rango"
          value={formatMoney(report.profits.range.profit)}
          subtitle={`Vendido ${formatMoney(report.profits.range.soldAmount)} / Costo ${formatMoney(report.profits.range.costAmount)}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2 min-h-0">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-h-0">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-zinc-600">Ventas por mes</div>
          <div className="mt-3 overflow-auto max-h-[320px]">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="py-2">Mes</th>
                  <th className="py-2 text-right">Ventas</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {report.monthlySales.map((row) => (
                  <tr key={row.monthKey} className="border-t border-zinc-100">
                    <td className="py-2 font-bold">{row.monthLabel}</td>
                    <td className="py-2 text-right">{row.count}</td>
                    <td className="py-2 text-right">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-h-0">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-zinc-600">Presupuestos por mes</div>
          <div className="mt-3 overflow-auto max-h-[320px]">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="py-2">Mes</th>
                  <th className="py-2 text-right">Presupuestos</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {report.monthlyBudgets.map((row) => (
                  <tr key={row.monthKey} className="border-t border-zinc-100">
                    <td className="py-2 font-bold">{row.monthLabel}</td>
                    <td className="py-2 text-right">{row.count}</td>
                    <td className="py-2 text-right">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 min-h-0">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-h-0">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-zinc-600">Ranking de productos</div>
          <div className="mt-3 overflow-auto max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Unid.</th>
                  <th className="py-2 text-right">Importe</th>
                  <th className="py-2 text-right">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((row) => (
                  <tr key={row.productId} className="border-t border-zinc-100 align-top">
                    <td className="py-2">
                      <div className="font-bold">{row.productName}</div>
                      <div className="text-xs text-zinc-500">{row.categoryName} / {row.brandName} / {row.rubroName}</div>
                    </td>
                    <td className="py-2 text-right">{row.units}</td>
                    <td className="py-2 text-right">{formatMoney(row.amount)}</td>
                    <td className="py-2 text-right">{formatMoney(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm min-h-0">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-zinc-600">Ranking de clientes</div>
          <div className="mt-3 overflow-auto max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th className="py-2 text-right">Compras</th>
                  <th className="py-2 text-right">Unid.</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {topClients.map((row) => (
                  <tr key={row.customerKey} className="border-t border-zinc-100">
                    <td className="py-2 font-bold">{row.customerName}</td>
                    <td className="py-2 text-right">{row.salesCount}</td>
                    <td className="py-2 text-right">{row.units}</td>
                    <td className="py-2 text-right">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
