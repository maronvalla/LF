import { useEffect, useMemo, useState } from "react";
import api from "../api";

const BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

function getBusinessDateString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

function formatDateLabel(value) {
  const [year, month, day] = String(value || "").split("-");
  if (!year || !month || !day) return value || "-";
  return `${day}/${month}/${year}`;
}

function formatMonthLabel(value) {
  const [year, month] = String(value || "").split("-");
  if (!year || !month) return "-";
  return `${month}/${year}`;
}

function buildEmptyProfits() {
  return {
    day: { soldAmount: 0, costAmount: 0, profit: 0 },
    month: { soldAmount: 0, costAmount: 0, profit: 0 },
    range: { soldAmount: 0, costAmount: 0, profit: 0 },
  };
}

function buildEmptyReport() {
  return {
    businessDate: getBusinessDateString(),
    businessTimeZone: BUSINESS_TIME_ZONE,
    monthlySales: [],
    monthlyBudgets: [],
    productRanking: [],
    channelRanking: { envio: [], mostrador: [] },
    clientRanking: [],
    profits: buildEmptyProfits(),
  };
}

function StatCard({ title, value, subtitle, meta, accentClass = "text-zinc-900" }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">{title}</div>
      {meta ? <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{meta}</div> : null}
      <div className={`mt-3 text-4xl font-black leading-none ${accentClass}`}>{value}</div>
      {subtitle ? <div className="mt-3 text-sm font-medium text-zinc-500">{subtitle}</div> : null}
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 text-center text-sm font-semibold text-zinc-500">
      {label}
    </div>
  );
}

function TableSection({ title, subtitle, rows, renderTable, emptyLabel }) {
  return (
    <section className="flex min-h-[290px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="shrink-0">
        <div className="text-sm font-black uppercase tracking-[0.22em] text-zinc-600">{title}</div>
        {subtitle ? <div className="mt-2 text-sm text-zinc-500">{subtitle}</div> : null}
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-auto">
        {rows.length ? renderTable() : <EmptyState label={emptyLabel} />}
      </div>
    </section>
  );
}

export default function Informes({ setToast }) {
  const [filters, setFilters] = useState(() => {
    const today = getBusinessDateString();
    return {
      dateFrom: `${today.slice(0, 8)}01`,
      dateTo: today,
    };
  });
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(buildEmptyReport);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reports/overview", { params: filters });
      const emptyProfits = buildEmptyProfits();
      setReport({
        businessDate: String(data?.businessDate || getBusinessDateString()),
        businessTimeZone: String(data?.businessTimeZone || BUSINESS_TIME_ZONE),
        monthlySales: Array.isArray(data?.monthlySales) ? data.monthlySales : [],
        monthlyBudgets: Array.isArray(data?.monthlyBudgets) ? data.monthlyBudgets : [],
        productRanking: Array.isArray(data?.productRanking) ? data.productRanking : [],
        channelRanking: data?.channelRanking || { envio: [], mostrador: [] },
        clientRanking: Array.isArray(data?.clientRanking) ? data.clientRanking : [],
        profits: {
          day: { ...emptyProfits.day, ...(data?.profits?.day || {}) },
          month: { ...emptyProfits.month, ...(data?.profits?.month || {}) },
          range: { ...emptyProfits.range, ...(data?.profits?.range || {}) },
        },
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
  const operationalDateLabel = formatDateLabel(report.businessDate);
  const monthLabel = formatMonthLabel(report.businessDate);
  const rangeLabel =
    filters.dateFrom === filters.dateTo
      ? formatDateLabel(filters.dateFrom)
      : `${formatDateLabel(filters.dateFrom)} al ${formatDateLabel(filters.dateTo)}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1 text-zinc-900">
      <div className="px-1">
        <h1 className="text-[28px] font-bold leading-none tracking-tight text-zinc-900">Informes</h1>
        <div className="mt-1 text-sm text-zinc-500">
          Fecha operativa actual: {operationalDateLabel}. La fecha del negocio se calcula en horario de Argentina para no saltar al día siguiente antes de medianoche.
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Desde</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-900 outline-none transition-colors focus:border-[#e85d04]"
              value={filters.dateFrom}
              max={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Hasta</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-900 outline-none transition-colors focus:border-[#e85d04]"
              value={filters.dateTo}
              min={filters.dateFrom}
              max={report.businessDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              className="h-[44px] rounded-xl border border-zinc-200 bg-zinc-100 px-4 text-xs font-black uppercase tracking-widest text-zinc-700 transition-colors hover:bg-zinc-200"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  dateFrom: report.businessDate,
                  dateTo: report.businessDate,
                }))
              }
            >
              Hoy
            </button>
            <button
              type="button"
              className="h-[44px] rounded-xl bg-[#e85d04] px-5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#d14f00]"
              onClick={load}
              disabled={loading}
            >
              {loading ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <StatCard
          title="Ganancia del dia"
          meta={`Fecha operativa ${operationalDateLabel}`}
          value={formatMoney(report.profits.day.profit)}
          subtitle={`Vendido ${formatMoney(report.profits.day.soldAmount)} / Costo ${formatMoney(report.profits.day.costAmount)}`}
          accentClass="text-emerald-700"
        />
        <StatCard
          title="Ganancia del mes"
          meta={`Mes operativo ${monthLabel}`}
          value={formatMoney(report.profits.month.profit)}
          subtitle={`Vendido ${formatMoney(report.profits.month.soldAmount)} / Costo ${formatMoney(report.profits.month.costAmount)}`}
          accentClass="text-zinc-900"
        />
        <StatCard
          title="Ganancia del rango"
          meta={rangeLabel}
          value={formatMoney(report.profits.range.profit)}
          subtitle={`Vendido ${formatMoney(report.profits.range.soldAmount)} / Costo ${formatMoney(report.profits.range.costAmount)}`}
          accentClass="text-[#e85d04]"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TableSection
          title="Ventas por mes"
          subtitle="Resumen mensual cerrado por fecha operativa."
          rows={report.monthlySales}
          emptyLabel="No hay ventas mensuales para mostrar."
          renderTable={() => (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Mes</th>
                  <th className="py-2 pr-3 text-right">Ventas</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {report.monthlySales.map((row) => (
                  <tr key={row.monthKey} className="border-t border-zinc-100">
                    <td className="py-3 pr-3 font-bold text-zinc-900">{row.monthLabel}</td>
                    <td className="py-3 pr-3 text-right text-zinc-600">{formatCount(row.count)}</td>
                    <td className="py-3 text-right font-semibold text-zinc-900">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        />

        <TableSection
          title="Presupuestos por mes"
          subtitle="Seguimiento comercial sobre presupuestos emitidos."
          rows={report.monthlyBudgets}
          emptyLabel="No hay presupuestos mensuales para mostrar."
          renderTable={() => (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Mes</th>
                  <th className="py-2 pr-3 text-right">Presupuestos</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {report.monthlyBudgets.map((row) => (
                  <tr key={row.monthKey} className="border-t border-zinc-100">
                    <td className="py-3 pr-3 font-bold text-zinc-900">{row.monthLabel}</td>
                    <td className="py-3 pr-3 text-right text-zinc-600">{formatCount(row.count)}</td>
                    <td className="py-3 text-right font-semibold text-zinc-900">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TableSection
          title="Ranking de productos"
          subtitle="Top 15 por unidades e importe dentro del rango elegido."
          rows={topProducts}
          emptyLabel="No hay productos vendidos en el rango seleccionado."
          renderTable={() => (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Producto</th>
                  <th className="py-2 pr-3 text-right">Unid.</th>
                  <th className="py-2 pr-3 text-right">Importe</th>
                  <th className="py-2 text-right">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((row) => (
                  <tr key={row.productId} className="border-t border-zinc-100 align-top">
                    <td className="py-3 pr-3">
                      <div className="font-bold text-zinc-900">{row.productName}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {row.categoryName} / {row.brandName} / {row.rubroName}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right text-zinc-600">{formatCount(row.units)}</td>
                    <td className="py-3 pr-3 text-right font-semibold text-zinc-900">{formatMoney(row.amount)}</td>
                    <td className="py-3 text-right font-semibold text-emerald-700">{formatMoney(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        />

        <TableSection
          title="Ranking de clientes"
          subtitle="Top 15 clientes por importe dentro del rango elegido."
          rows={topClients}
          emptyLabel="No hay clientes con ventas en el rango seleccionado."
          renderTable={() => (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3 text-right">Compras</th>
                  <th className="py-2 pr-3 text-right">Unid.</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {topClients.map((row) => (
                  <tr key={row.customerKey} className="border-t border-zinc-100 align-top">
                    <td className="py-3 pr-3 font-bold text-zinc-900">{row.customerName}</td>
                    <td className="py-3 pr-3 text-right text-zinc-600">{formatCount(row.salesCount)}</td>
                    <td className="py-3 pr-3 text-right text-zinc-600">{formatCount(row.units)}</td>
                    <td className="py-3 text-right font-semibold text-zinc-900">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        />
      </div>
    </div>
  );
}
