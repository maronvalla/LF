import { Fragment, useRef, useState } from "react";
import ConfirmModal from "./ventas/ConfirmModal";
import ControlModal from "./consolidado/ControlModal";
import Stat from "./consolidado/Stat";
import { useConsolidadoData } from "./consolidado/useConsolidadoData";
import { usePrint } from "./consolidado/usePrint";
import { formatQuantity } from "./consolidado/utils";

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

export default function Consolidado({ user, setToast }) {
  const [theme] = useState(() => localStorage.getItem("appTheme") || "light");
  const isDark = theme === "dark";

  const [controlOpen, setControlOpen] = useState(false);
  const [controlStep, setControlStep] = useState("checklist");
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolverRef = useRef(null);

  const showConfirm = (message) =>
    new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ message });
    });

  const resolveConfirm = (value) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmState(null);
    if (typeof resolver === "function") resolver(Boolean(value));
  };

  const data = useConsolidadoData({ user, setToast });
  const {
    date, setDate, slot, setSlot, loading, load,
    consolidated, rejectedReturns, purchaseSuggestion,
    pickPlanByProduct, checklistByProduct, setChecklistByProduct,
    cashierName, setCashierName,
    driverName, setDriverName,
    cashierSignature, setCashierSignature,
    driverSignature, setDriverSignature,
    savingControl, cancellingControl, hasSavedControlForShift,
    canControl, role,
    saveControl, cancelControl, setPlan,
    pedidosEnvio,
    totalBultos, totalEnvasesRetornables, totalMercaderiaDevuelta,
    totalCashExpectedFromDriver,
    purchaseSuggestionItems,
    pickPlanRows,
    consolidatedSections, pickPlanSections, rejectedReturnSections,
    checklistDoneCount, allChecklistDone, allPickPlanValid,
  } = data;

  const print = usePrint({
    pedidosEnvio,
    date,
    slot,
    consolidatedSections,
    rejectedReturnSections,
    pickPlanByProduct,
    totalBultos,
    totalEnvasesRetornables,
    totalCashExpectedFromDriver,
    purchaseSuggestion,
    purchaseSuggestionItems,
    setToast,
  });
  const {
    showPrintPrompt,
    printPreviewLines,
    printPromptTitle,
    availablePrinters,
    selectedPrinter,
    setSelectedPrinter,
    resolvePrintConfirmation,
    printConsolidated,
    printAllDeliveryOrders,
  } = print;

  const handleApproveClick = async () => {
    if (hasSavedControlForShift) {
      if (role === "ADMIN") {
        const confirmed = await showConfirm("Ya hay un consolidado hecho. ¿Deseas anularlo?");
        if (!confirmed) return;
        await cancelControl();
      } else {
        setToast?.({ message: "Este turno ya tiene consolidado validado.", type: "warning" });
      }
      return;
    }
    const confirmed = await showConfirm(
      "¿Confirmas aprobar el consolidado? Los pedidos pasarán a CARGADO."
    );
    if (!confirmed) return;
    await saveControl();
    setControlOpen(false);
    setControlStep("checklist");
  };

  return (
    <div className={`h-full flex flex-col gap-4 ${isDark ? "text-white" : "text-zinc-900"}`}>
      {/* Header */}
      <div className="px-1 flex flex-col md:flex-row md:justify-between md:items-center gap-2">
        <div>
          <h1
            className={`text-[28px] font-bold leading-none tracking-tight ${
              isDark ? "text-zinc-100" : "text-zinc-900"
            }`}
          >
            Consolidado de carga
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-2 md:mt-0">
          <button
            type="button"
            className={`btn ${
              isDark
                ? "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
                : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
            }`}
            onClick={load}
            disabled={loading}
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>
          <button
            type="button"
            className={`btn ${
              isDark
                ? "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
                : "btn-muted"
            }`}
            onClick={printConsolidated}
          >
            Imprimir
          </button>
          <button
            type="button"
            className={`btn ${
              isDark
                ? "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
                : "btn-muted"
            }`}
            onClick={printAllDeliveryOrders}
          >
            Reimprimir ordenes
          </button>
          {canControl ? (
            <button
              type="button"
              className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white shadow-md"
              disabled={cancellingControl}
              onClick={handleApproveClick}
            >
              Aprobar consolidado
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter bar */}
      <div
        className={`${
          isDark ? "bg-[#1a1a1c] border-zinc-800" : "bg-white border-zinc-200"
        } border rounded-2xl p-4 md:p-5 flex flex-col md:flex-row gap-3 md:gap-4 items-end shadow-sm`}
      >
        <div className="flex-1 w-full relative">
          <label
            className={`text-[10px] md:text-[9px] uppercase font-black tracking-wider block mb-1 ${
              isDark ? "text-zinc-500" : "text-zinc-500"
            }`}
          >
            Fecha
          </label>
          <input
            type="date"
            className={`input mt-1 w-full focus:border-[#e85d04] ${
              isDark
                ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                : "bg-zinc-50 border-zinc-200 text-zinc-900"
            }`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex-1 w-full relative">
          <label
            className={`text-[10px] md:text-[9px] uppercase font-black tracking-wider block mb-1 ${
              isDark ? "text-zinc-500" : "text-zinc-500"
            }`}
          >
            Turno
          </label>
          <select
            className={`input mt-1 w-full focus:border-[#e85d04] ${
              isDark
                ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                : "bg-zinc-50 border-zinc-200 text-zinc-900"
            }`}
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
          >
            <option value="11">11:00 AM</option>
            <option value="19">19:00 PM</option>
          </select>
        </div>
        <div className="w-full md:w-auto mt-2 md:mt-0">
          <button
            type="button"
            className={`btn w-full md:w-auto h-[42px] px-6 flex items-center justify-center gap-2 ${
              isDark
                ? "bg-zinc-900/50 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
            }`}
            onClick={load}
          >
            <span className="text-lg">Y</span> Filtrar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat isDark={isDark} icon="📦" title="Pedidos" value={pedidosEnvio.length} />
        <Stat isDark={isDark} icon="🍱" title="Productos Diferentes" value={consolidated.length} />
        <Stat isDark={isDark} icon="🧮" title="Total Unidades" value={totalBultos} />
        <Stat
          isDark={isDark}
          icon="$"
          title="Efectivo Chofer"
          subtitle="A rendir"
          value={formatMoney(totalCashExpectedFromDriver)}
        />
        <Stat
          isDark={isDark}
          icon="♻️"
          title="Envases Retornables (Salida)"
          value={totalEnvasesRetornables}
        />
        <Stat
          isDark={isDark}
          icon="🚫"
          title="Devoluciones (Rechazos)"
          value={totalMercaderiaDevuelta}
        />
      </div>

      <div className="flex flex-col xl:flex-row gap-4">
        {/* Previsualización grande */}
        <div
          className={`${
            isDark ? "bg-[#1a1a1c] border-zinc-800" : "bg-white border-zinc-200"
          } border rounded-2xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0`}
        >
          <div
            className={`px-5 py-4 border-b text-sm font-black uppercase flex items-center justify-between ${
              isDark
                ? "border-zinc-800 text-zinc-100 bg-[#161618]"
                : "border-zinc-100 text-[#e85d04] bg-[#fdfaf8]"
            }`}
          >
            <span>1. PREVISUALIZACION DE MERCADERIA A SACAR</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead
                className={`uppercase text-[10px] ${
                  isDark ? "bg-[#161618] text-zinc-400" : "bg-zinc-50/80 text-zinc-500"
                }`}
              >
                <tr>
                  <th className="text-left px-5 py-3 whitespace-nowrap font-bold">Código</th>
                  <th className="text-left px-5 py-3 font-bold">Producto</th>
                  <th className="text-left px-5 py-3 whitespace-nowrap font-bold">Unidad</th>
                  <th className="text-right px-5 py-3 whitespace-nowrap font-bold">Cantidad</th>
                  <th className="text-right px-5 py-3 whitespace-nowrap font-bold">Envases</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedSections.map((section) => (
                  <Fragment key={`section-preview-${section.key}`}>
                    <tr className={`${isDark ? "bg-zinc-900/80" : "bg-[#fff7f1]"}`}>
                      <td colSpan={5} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={`font-black uppercase tracking-[0.16em] ${
                              isDark ? "text-[#ffb36c]" : "text-[#b45309]"
                            }`}
                          >
                            {section.label}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              isDark ? "text-zinc-400" : "text-zinc-500"
                            }`}
                          >
                            {section.items.length} item{section.items.length === 1 ? "" : "s"} -{" "}
                            {formatQuantity(section.totalQty)} unidades
                          </span>
                        </div>
                      </td>
                    </tr>
                    {section.items.map((row) => (
                      <tr
                        key={row.product_id}
                        className={`border-t transition-colors ${
                          isDark
                            ? "border-zinc-800/60 hover:bg-zinc-800/20"
                            : "border-zinc-100 hover:bg-zinc-50/50"
                        }`}
                      >
                        <td className={`px-5 py-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                          {row.sku || "-"}
                        </td>
                        <td
                          className={`px-5 py-3 font-bold ${
                            isDark ? "text-zinc-200" : "text-zinc-800"
                          }`}
                        >
                          {row.name}
                        </td>
                        <td
                          className={`px-5 py-3 uppercase ${
                            isDark ? "text-zinc-400" : "text-zinc-500"
                          }`}
                        >
                          {row.unit_label || "unidad"}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-black text-base ${
                            isDark ? "text-zinc-200" : "text-[#e85d04]"
                          }`}
                        >
                          {formatQuantity(row.total_qty || 0)}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-black text-base ${
                            isDark ? "text-zinc-200" : "text-emerald-600"
                          }`}
                        >
                          {formatQuantity(row.total_returnable_units || 0)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {!consolidated.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className={`text-center py-8 font-bold ${
                        isDark ? "text-zinc-500 bg-black/10" : "text-zinc-400 bg-zinc-50/30"
                      }`}
                    >
                      No hay mercadería
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6 items-start min-h-0">
          {/* Mercadería consolidada (card) */}
          <div
            className={`border rounded-2xl flex flex-col min-h-[400px] xl:min-h-0 xl:h-[600px] shadow-sm ${
              isDark ? "bg-[#121212] border-zinc-800" : "bg-white border-zinc-200"
            }`}
          >
            <div
              className={`p-4 xl:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isDark ? "border-zinc-800/60 bg-zinc-900/50" : "border-zinc-100 bg-zinc-50/50"
              }`}
            >
              <h2
                className={`font-black uppercase tracking-tight text-sm xl:text-base flex items-center gap-2 ${
                  isDark ? "text-zinc-100" : "text-zinc-800"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs ${
                    isDark ? "bg-[#e85d04]/80" : "bg-[#e85d04]"
                  }`}
                >
                  1
                </span>
                Previsualizacion de Mercaderia
              </h2>
              <div
                className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                  isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200/50 text-zinc-600"
                }`}
              >
                {consolidated.length} {consolidated.length === 1 ? "item" : "items"}
              </div>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[500px] text-xs xl:text-sm text-left">
                <thead
                  className={`text-[10px] xl:text-xs uppercase tracking-widest border-b sticky top-0 z-10 ${
                    isDark
                      ? "text-zinc-500 border-zinc-800/60 bg-[#121212]"
                      : "text-zinc-500 border-zinc-100 bg-white"
                  }`}
                >
                  <tr>
                    <th className="px-4 xl:px-5 py-3 xl:py-4 font-black">Codigo</th>
                    <th className="px-4 xl:px-5 py-3 xl:py-4 font-black">Producto</th>
                    <th className="px-4 xl:px-5 py-3 xl:py-4 font-black">Unidad</th>
                    <th className="text-right px-4 xl:px-5 py-3 xl:py-4 font-black">Total Prep.</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidatedSections.map((section) => (
                    <Fragment key={`section-items-${section.key}`}>
                      <tr className={`${isDark ? "bg-zinc-900/80" : "bg-[#fff7f1]"}`}>
                        <td colSpan={4} className="px-4 xl:px-5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className={`font-black uppercase tracking-[0.16em] ${
                                isDark ? "text-[#ffb36c]" : "text-[#b45309]"
                              }`}
                            >
                              {section.label}
                            </span>
                            <span
                              className={`text-xs font-bold ${
                                isDark ? "text-zinc-400" : "text-zinc-500"
                              }`}
                            >
                              {formatQuantity(section.totalQty)} unidades
                            </span>
                          </div>
                        </td>
                      </tr>
                      {section.items.map((row) => (
                        <tr
                          key={row.product_id}
                          className={`border-t transition-colors ${
                            isDark
                              ? "border-zinc-800/60 hover:bg-zinc-800/20"
                              : "border-zinc-100 hover:bg-zinc-50/50"
                          }`}
                        >
                          <td
                            className={`px-4 xl:px-5 py-3 xl:py-4 ${
                              isDark ? "text-zinc-400" : "text-zinc-500"
                            }`}
                          >
                            {row.sku || "-"}
                          </td>
                          <td
                            className={`px-4 xl:px-5 py-3 xl:py-4 font-bold ${
                              isDark ? "text-zinc-200" : "text-zinc-800"
                            }`}
                          >
                            {row.name}
                          </td>
                          <td
                            className={`px-4 xl:px-5 py-3 xl:py-4 uppercase ${
                              isDark ? "text-zinc-400" : "text-zinc-500"
                            }`}
                          >
                            {row.unit_label || "unidad"}
                          </td>
                          <td
                            className={`px-4 xl:px-5 py-3 xl:py-4 text-right font-black text-base xl:text-lg ${
                              isDark ? "text-zinc-200" : "text-[#e85d04]"
                            }`}
                          >
                            {formatQuantity(row.total_qty || 0)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {!consolidated.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className={`text-center py-10 font-bold ${
                          isDark ? "text-zinc-500 bg-black/10" : "text-zinc-400 bg-zinc-50/30"
                        }`}
                      >
                        No hay datos
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Asignación LOCAL/GALPÓN */}
          <div
            className={`${
              isDark ? "bg-[#1a1a1c] border-zinc-800" : "bg-white border-zinc-200"
            } border rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[400px] xl:min-h-0 xl:h-[600px]`}
          >
            <div
              className={`px-5 py-4 border-b text-sm font-black uppercase flex items-center justify-between ${
                isDark
                  ? "border-zinc-800 text-zinc-100 bg-[#161618]"
                  : "border-zinc-100 text-[#e85d04] bg-[#fdfaf8]"
              }`}
            >
              <span>2. ASIGNACIÓN DE STOCK (LOCAL/GALPÓN)</span>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full text-xs xl:text-sm min-w-[500px]">
                <thead
                  className={`uppercase text-[10px] xl:text-xs tracking-widest sticky top-0 z-10 ${
                    isDark ? "bg-[#161618] text-zinc-400" : "bg-zinc-50/80 text-zinc-500"
                  }`}
                >
                  <tr>
                    <th className="text-left px-5 py-3 xl:py-4 font-black">Producto</th>
                    <th className="text-right px-5 py-3 xl:py-4 whitespace-nowrap font-black">Total</th>
                    <th className="text-right px-5 py-3 xl:py-4 whitespace-nowrap font-black">LOCAL</th>
                    <th className="text-right px-5 py-3 xl:py-4 whitespace-nowrap font-black">GALPÓN</th>
                    <th className="text-center px-5 py-3 xl:py-4 whitespace-nowrap font-black">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pickPlanSections.map((section) => (
                    <Fragment key={`section-pick-${section.key}`}>
                      <tr className={`${isDark ? "bg-zinc-900/80" : "bg-[#fff7f1]"}`}>
                        <td colSpan={5} className="px-5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className={`font-black uppercase tracking-[0.16em] ${
                                isDark ? "text-[#ffb36c]" : "text-[#b45309]"
                              }`}
                            >
                              {section.label}
                            </span>
                            <span
                              className={`text-xs font-bold ${
                                isDark ? "text-zinc-400" : "text-zinc-500"
                              }`}
                            >
                              {formatQuantity(section.totalQty)} unidades
                            </span>
                          </div>
                        </td>
                      </tr>
                      {section.items.map((row) => (
                        <tr
                          key={row.product_id}
                          className={`border-t transition-colors ${
                            isDark
                              ? "border-zinc-800/60 hover:bg-zinc-800/20"
                              : "border-zinc-100 hover:bg-zinc-50/50"
                          }`}
                        >
                          <td
                            className={`px-5 py-3 font-bold ${
                              isDark ? "text-zinc-200" : "text-zinc-800"
                            }`}
                          >
                            {row.name}
                          </td>
                          <td
                            className={`px-5 py-3 text-right font-black text-base ${
                              isDark ? "text-zinc-200" : "text-[#e85d04]"
                            }`}
                          >
                            {formatQuantity(row.total_qty || 0)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <input
                              className={`input w-20 md:w-24 ml-auto text-right py-1 text-sm font-bold focus:border-[#e85d04] ${
                                isDark
                                  ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                                  : "bg-white border-zinc-200 text-zinc-900"
                              }`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.localQty}
                              onChange={(e) =>
                                setPlan(row.product_id, "localQty", e.target.value, row.total_qty)
                              }
                            />
                          </td>
                          <td className="px-5 py-3 text-right">
                            <input
                              className={`input w-20 md:w-24 ml-auto text-right py-1 text-sm font-bold focus:border-[#e85d04] ${
                                isDark
                                  ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                                  : "bg-white border-zinc-200 text-zinc-900"
                              }`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.galponQty}
                              onChange={(e) =>
                                setPlan(row.product_id, "galponQty", e.target.value, row.total_qty)
                              }
                            />
                          </td>
                          <td className="px-5 py-3 text-center">
                            {row.mismatch ? (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${
                                  isDark
                                    ? "bg-amber-500/20 text-amber-500 ring-1 ring-inset ring-amber-500/40"
                                    : "bg-rose-100 text-rose-600"
                                }`}
                              >
                                {isDark ? "Requerir Galpon" : "NO CUADRA"}
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${
                                  isDark
                                    ? "bg-emerald-500/20 text-emerald-500 ring-1 ring-inset ring-emerald-500/40"
                                    : "bg-emerald-100 text-emerald-600"
                                }`}
                              >
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {!pickPlanRows.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className={`text-center py-8 font-bold ${
                          isDark ? "text-zinc-500 bg-black/10" : "text-zinc-400 bg-zinc-50/30"
                        }`}
                      >
                        No hay mercadería
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Devoluciones por rechazos */}
        <div
          className={`${
            isDark ? "bg-[#1a1a1c] border-zinc-800" : "bg-white border-zinc-200"
          } border rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[300px] mt-2`}
        >
          <div
            className={`px-5 py-4 border-b text-sm font-black uppercase flex items-center justify-between ${
              isDark
                ? "border-zinc-800 text-zinc-100 bg-[#161618]"
                : "border-zinc-100 text-[#e85d04] bg-[#fdfaf8]"
            }`}
          >
            <span>MERCADERIA A DEVOLVER POR RECHAZOS (AYER)</span>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full text-xs xl:text-sm min-w-[500px]">
              <thead
                className={`uppercase text-[10px] xl:text-xs tracking-widest sticky top-0 z-10 ${
                  isDark ? "bg-[#161618] text-zinc-400" : "bg-zinc-50/80 text-zinc-500"
                }`}
              >
                <tr>
                  <th className="text-left px-5 py-3 xl:py-4 whitespace-nowrap font-black">Código</th>
                  <th className="text-left px-5 py-3 xl:py-4 font-black">Producto</th>
                  <th className="text-left px-5 py-3 xl:py-4 whitespace-nowrap font-black">Unidad</th>
                  <th className="text-right px-5 py-3 xl:py-4 whitespace-nowrap font-black">
                    Cantidad Dev.
                  </th>
                </tr>
              </thead>
              <tbody>
                {rejectedReturnSections.map((section) => (
                  <Fragment key={`section-return-${section.key}`}>
                    <tr className={`${isDark ? "bg-zinc-900/80" : "bg-[#fff7f1]"}`}>
                      <td colSpan={4} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={`font-black uppercase tracking-[0.16em] ${
                              isDark ? "text-[#ffb36c]" : "text-[#b45309]"
                            }`}
                          >
                            {section.label}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              isDark ? "text-zinc-400" : "text-zinc-500"
                            }`}
                          >
                            {formatQuantity(section.totalQty)} unidades
                          </span>
                        </div>
                      </td>
                    </tr>
                    {section.items.map((row) => (
                      <tr
                        key={row.product_id}
                        className={`border-t transition-colors ${
                          isDark
                            ? "border-zinc-800/60 hover:bg-zinc-800/20"
                            : "border-zinc-100 hover:bg-zinc-50/50"
                        }`}
                      >
                        <td
                          className={`px-5 py-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}
                        >
                          {row.sku || "-"}
                        </td>
                        <td
                          className={`px-5 py-3 font-bold ${
                            isDark ? "text-zinc-200" : "text-zinc-800"
                          }`}
                        >
                          {row.name}
                        </td>
                        <td
                          className={`px-5 py-3 uppercase ${
                            isDark ? "text-zinc-400" : "text-zinc-500"
                          }`}
                        >
                          {row.unit_label || "unidad"}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-black text-base ${
                            isDark ? "text-zinc-200" : "text-amber-500"
                          }`}
                        >
                          {formatQuantity(row.qty_to_return || 0)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {!rejectedReturns.length && (
                  <tr>
                    <td
                      colSpan={4}
                      className={`text-center py-8 font-bold ${
                        isDark ? "text-zinc-500 bg-black/10" : "text-zinc-400 bg-zinc-50/30"
                      }`}
                    >
                      No hay rechazos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Control modal */}
        <ControlModal
          isOpen={controlOpen && canControl}
          isDark={isDark}
          onClose={() => setControlOpen(false)}
          controlStep={controlStep}
          setControlStep={setControlStep}
          consolidatedSections={consolidatedSections}
          consolidated={consolidated}
          checklistByProduct={checklistByProduct}
          setChecklistByProduct={setChecklistByProduct}
          checklistDoneCount={checklistDoneCount}
          allChecklistDone={allChecklistDone}
          allPickPlanValid={allPickPlanValid}
          cashierName={cashierName}
          setCashierName={setCashierName}
          cashierSignature={cashierSignature}
          setCashierSignature={setCashierSignature}
          driverName={driverName}
          setDriverName={setDriverName}
          driverSignature={driverSignature}
          setDriverSignature={setDriverSignature}
          savingControl={savingControl}
          onSave={saveControl}
        />

        {/* Print prompt */}
        {showPrintPrompt ? (
          <div className="fixed inset-0 bg-zinc-900/60 dark:bg-black/70 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
            <div
              className={`w-full max-w-xl rounded-2xl border shadow-xl p-6 space-y-5 ${
                isDark ? "bg-[#121212] border-zinc-800" : "bg-white border-zinc-200"
              }`}
            >
              <div className="text-lg font-black uppercase tracking-tight text-[#e85d04]">
                {printPromptTitle}
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block">
                  Impresora
                </label>
                <select
                  className={`input w-full focus:border-[#e85d04] ${
                    isDark
                      ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                      : "bg-zinc-50 border-zinc-200 text-zinc-900"
                  }`}
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                >
                  {!availablePrinters.length && (
                    <option value="">Predeterminada del sistema</option>
                  )}
                  {availablePrinters.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.displayName || p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div
                className={`border rounded-xl p-4 max-h-80 overflow-auto shadow-inner ${
                  isDark
                    ? "bg-white text-black border-zinc-800"
                    : "bg-zinc-50 text-zinc-800 border-zinc-200"
                }`}
              >
                <div className="mx-auto w-[58mm] font-mono text-[11px] leading-tight">
                  {printPreviewLines.map((line, idx) => {
                    const raw = String(line || "");
                    const sepIdx = raw.indexOf("\x1e");
                    if (sepIdx >= 0) {
                      return (
                        <div
                          key={`${raw}-${idx}`}
                          className="flex justify-between whitespace-pre"
                        >
                          <span>{raw.slice(0, sepIdx)}</span>
                          <span>{raw.slice(sepIdx + 1)}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={`${raw}-${idx}`} className="whitespace-pre">
                        {raw || " "}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                className={`text-xs font-medium px-3 py-2 rounded-lg border flex items-center gap-2 ${
                  isDark
                    ? "bg-zinc-900 border-zinc-800 text-zinc-400"
                    : "bg-zinc-50 text-zinc-500 border-zinc-100"
                }`}
              >
                <span>Atajos:</span>
                <span
                  className={`font-black px-1.5 py-0.5 rounded border shadow-sm ${
                    isDark
                      ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                      : "bg-white text-zinc-800 border-zinc-200"
                  }`}
                >
                  Y
                </span>{" "}
                = SI,{" "}
                <span
                  className={`font-black px-1.5 py-0.5 rounded border shadow-sm ${
                    isDark
                      ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                      : "bg-white text-zinc-800 border-zinc-200"
                  }`}
                >
                  N
                </span>{" "}
                = NO
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  className={`btn ${
                    isDark
                      ? "btn-muted"
                      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                  }`}
                  onClick={() => resolvePrintConfirmation(false)}
                >
                  No (N)
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-6 shadow-md"
                  onClick={() => resolvePrintConfirmation(true)}
                >
                  Si (Y)
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {confirmState ? (
        <ConfirmModal
          message={confirmState.message}
          onCancel={() => resolveConfirm(false)}
          onConfirm={() => resolveConfirm(true)}
        />
      ) : null}
    </div>
  );
}
