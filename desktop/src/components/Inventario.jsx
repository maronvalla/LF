import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import ConfirmModal from "./ventas/ConfirmModal";
import useStockControlStatus from "../hooks/useStockControlStatus";
import { productMatchesSearch } from "../utils/productSearch";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildReportText(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const lines = ["CONTROL DE STOCK", ""];
  rows.forEach((row) => {
    lines.push(
      `${row.locationCode}: ${row.productName} | Esperado ${row.expectedQty} | Real ${row.actualQty} | Diferencia ${row.difference}`
    );
  });
  return lines.join("\n");
}

export default function Inventario({ user, setToast }) {
  const role = String(user?.role || "").toUpperCase();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason] = useState("TRANSFERENCIA");
  const [transferLocations, setTransferLocations] = useState([]);
  const [transferPairs, setTransferPairs] = useState([]);
  const [fromCode, setFromCode] = useState("GALPON");
  const [toCode, setToCode] = useState("LOCAL");
  const [showStartPrompt, setShowStartPrompt] = useState(false);
  const [controlDrafts, setControlDrafts] = useState({ LOCAL: {}, GALPON: {} });
  const [stockControlQuery, setStockControlQuery] = useState("");
  const [savingControlLocation, setSavingControlLocation] = useState(false);
  const [finalizingControl, setFinalizingControl] = useState(false);
  const [report, setReport] = useState(null);
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


  const {
    stockControlState,
    canManageStockControl,
    loadingStockControl,
    loadStockControlStatus,
  } = useStockControlStatus(setToast);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/balances");
      setProducts(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setProducts([]);
      setToast?.({ message: "Error cargando inventario", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchTransferSettings = async () => {
    try {
      const { data } = await api.get("/settings/inventory-transfer-pairs");
      const locations = Array.isArray(data?.locations) ? data.locations : [];
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      setTransferLocations(locations);
      setTransferPairs(pairs);
      if (pairs[0]) {
        setFromCode((prev) => prev || pairs[0].fromCode);
        setToCode((prev) => prev || pairs[0].toCode);
      }
    } catch {
      setTransferLocations([
        { code: "GALPON", name: "Galpon" },
        { code: "LOCAL", name: "Local" },
      ]);
      setTransferPairs([
        { fromCode: "GALPON", toCode: "LOCAL" },
        { fromCode: "LOCAL", toCode: "GALPON" },
      ]);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchTransferSettings();
  }, []);

  useEffect(() => {
    const nextDrafts = { LOCAL: {}, GALPON: {} };
    products.forEach((product) => {
      const localExpected = Number(product.stocks?.LOCAL?.quantity ?? 0);
      const galponExpected = Number(product.stocks?.GALPON?.quantity ?? 0);
      nextDrafts.LOCAL[product.product_id] = Number(
        stockControlState?.counts?.LOCAL?.[product.product_id] ?? localExpected
      );
      nextDrafts.GALPON[product.product_id] = Number(
        stockControlState?.counts?.GALPON?.[product.product_id] ?? galponExpected
      );
    });
    setControlDrafts(nextDrafts);
    setReport(stockControlState?.lastReport || null);
  }, [products, stockControlState]);

  const availableToOptions = useMemo(
    () =>
      transferPairs
        .filter((pair) => pair.fromCode === fromCode)
        .map((pair) => pair.toCode),
    [fromCode, transferPairs]
  );

  useEffect(() => {
    if (!availableToOptions.length) return;
    if (!availableToOptions.includes(toCode)) {
      setToCode(availableToOptions[0]);
    }
  }, [availableToOptions, toCode]);

  const transferableProducts = useMemo(() => {
    return products.filter((product) => Number(product.stocks?.[fromCode]?.quantity || 0) > 0);
  }, [fromCode, products]);

  const activeLocationCode = stockControlState?.currentLocationCode || null;
  const completedLocations = stockControlState?.completedLocations || [];
  const isStockControlActive = Boolean(stockControlState?.active);
  const pendingLocations = (stockControlState?.locationOrder || []).filter(
    (locationCode) => !completedLocations.includes(locationCode)
  );

  const currentLocationRows = useMemo(() => {
    if (!activeLocationCode) return [];
    return products.map((product) => ({
      id: product.product_id,
      name: product.name,
      code: product.sku || "",
      unitLabel: product.unit_label || "Unidad",
      expectedQty: Number(product.stocks?.[activeLocationCode]?.quantity ?? 0),
      actualQty: Number(controlDrafts?.[activeLocationCode]?.[product.product_id] ?? 0),
    }));
  }, [activeLocationCode, controlDrafts, products]);

  const visibleCurrentLocationRows = useMemo(() => {
    const query = String(stockControlQuery || "").trim();
    if (!query) return currentLocationRows;
    return currentLocationRows.filter((row) =>
      productMatchesSearch(
        {
          name: row.name,
          codigo: row.code,
          sku: row.code,
          id: row.id,
        },
        query
      )
    );
  }, [currentLocationRows, stockControlQuery]);

  const handleTransfer = async () => {
    if (isStockControlActive) {
      setToast?.({ message: "Control de stock en curso", type: "error" });
      return;
    }
    if (!selectedProductId) {
      setToast?.({ message: "Seleccione un producto", type: "error" });
      return;
    }
    if (Number(qty) <= 0) {
      setToast?.({ message: "La cantidad debe ser mayor a 0", type: "error" });
      return;
    }

    try {
      await api.post("/inventory/transfer", {
        productId: selectedProductId,
        qty: Number(qty),
        fromCode,
        toCode,
      });
      setToast?.({ message: "Transferencia realizada con exito", type: "success" });
      setSelectedProductId("");
      setQty(1);
      fetchInventory();
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "Error al transferir",
        type: "error",
      });
    }
  };

  const startStockControl = async (startLocationCode) => {
    try {
      await api.post("/inventory/stock-control/start", { startLocationCode });
      setShowStartPrompt(false);
      setStockControlQuery("");
      await Promise.all([fetchInventory(), loadStockControlStatus()]);
      setToast?.({
        message: `Control de stock iniciado por ${startLocationCode.toLowerCase()}`,
        type: "success",
      });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo iniciar el control de stock",
        type: "error",
      });
    }
  };

  const updateActualQty = (locationCode, productId, value) => {
    const parsed = Math.max(0, Number(String(value || "").replace(/\D/g, "") || 0));
    setControlDrafts((prev) => ({
      ...prev,
      [locationCode]: {
        ...(prev[locationCode] || {}),
        [productId]: parsed,
      },
    }));
  };

  const saveCurrentLocation = async () => {
    if (!activeLocationCode) return;
    const nextLocation = pendingLocations.find((locationCode) => locationCode !== activeLocationCode);
    let stopAfterThis = false;
    if (nextLocation) {
      const continuar = await showConfirm(`Se guardará ${activeLocationCode}.\n¿Continuar luego con ${nextLocation}?`);
      stopAfterThis = !continuar;
    }
    setSavingControlLocation(true);
    try {
      const countsPayload = currentLocationRows
        .map((row) => {
          const rawQty = Number(controlDrafts?.[activeLocationCode]?.[row.id] ?? row.expectedQty);
          const safeQty = Number.isFinite(rawQty) ? Math.max(0, Math.trunc(rawQty)) : 0;
          return {
            productId: String(row.id || "").trim(),
            actualQty: safeQty,
          };
        })
        .filter((row) => row.productId.length > 0);

      if (!countsPayload.length) {
        setToast?.({ message: "No hay productos validos para guardar en este conteo", type: "error" });
        return;
      }

      await api.put("/inventory/stock-control/location", {
        locationCode: String(activeLocationCode || "").toUpperCase(),
        stopAfterThis,
        counts: countsPayload,
      });
      await loadStockControlStatus();
      if (nextLocation && !stopAfterThis) {
        setToast?.({
          message: `Continua con ${nextLocation.toLowerCase()}`,
          type: "success",
        });
      } else if (stopAfterThis) {
        setToast?.({
          message: `Conteo de ${activeLocationCode.toLowerCase()} guardado. Ya puedes finalizar el control.`,
          type: "success",
        });
      } else {
        setToast?.({
          message: "Ambas ubicaciones ya estan cargadas. Puedes finalizar el control.",
          type: "success",
        });
      }
    } catch (err) {
      const firstIssue = err?.response?.data?.errors?.[0];
      const issueMsg = firstIssue
        ? `${firstIssue.path?.join?.(".") || "payload"}: ${firstIssue.message || "invalido"}`
        : "";
      setToast?.({
        message:
          err.response?.data?.message ||
          issueMsg ||
          "No se pudo guardar el conteo",
        type: "error",
      });
    } finally {
      setSavingControlLocation(false);
    }
  };

  const finalizeStockControl = async () => {
    setFinalizingControl(true);
    try {
      const { data } = await api.post("/inventory/stock-control/finalize");
      setReport(data?.report || null);
      await Promise.all([fetchInventory(), loadStockControlStatus()]);
      setToast?.({ message: "Control de stock finalizado", type: "success" });
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo finalizar el control de stock",
        type: "error",
      });
    } finally {
      setFinalizingControl(false);
    }
  };

  const printReport = () => {
    if (!report) return;
    const printable = window.open("", "_blank", "width=900,height=900");
    if (!printable) {
      setToast?.({ message: "No se pudo abrir ventana de impresion", type: "error" });
      return;
    }
    const rows = Array.isArray(report.rows) ? report.rows : [];
    printable.document.write(`
      <html>
        <head>
          <title>Control de stock</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Control de stock</h1>
          <div>Generado: ${new Date(report.generatedAt || Date.now()).toLocaleString("es-AR")}</div>
          <table>
            <thead>
              <tr>
                <th>Ubicacion</th>
                <th>Codigo</th>
                <th>Producto</th>
                <th>Esperado</th>
                <th>Real</th>
                <th>Diferencia</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              ${rows
        .map(
          (row) => `
                    <tr>
                      <td>${row.locationCode || ""}</td>
                      <td>${row.code || ""}</td>
                      <td>${row.productName || ""}</td>
                      <td>${Number(row.expectedQty || 0)}</td>
                      <td>${Number(row.actualQty || 0)}</td>
                      <td>${Number(row.difference || 0)}</td>
                      <td>${row.description || ""}</td>
                    </tr>
                  `
        )
        .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
  };

  const shareReport = async () => {
    if (!report) return;
    const text = buildReportText(report);
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Control de stock",
          text,
        });
        return;
      } catch {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast?.({ message: "Reporte copiado al portapapeles", type: "success" });
    } catch {
      setToast?.({ message: "No se pudo compartir el reporte", type: "error" });
    }
  };

  const downloadExcelReport = async () => {
    try {
      const { data } = await api.get("/inventory/stock-control/report.xlsx", {
        responseType: "blob",
      });
      downloadBlob(data, "control-stock.xlsx");
    } catch {
      setToast?.({ message: "No se pudo descargar el reporte Excel", type: "error" });
    }
  };

  const reportRows = Array.isArray(report?.rows) ? report.rows : [];

  return (
    <div className="h-full flex flex-col space-y-4 text-zinc-900">
      <div className="px-1">
        <h1 className="text-2xl md:text-3xl font-bold leading-none tracking-tight">Inventario</h1>
        <p className="text-xs mt-1 text-zinc-500">Gestión de stock y transferencias internas</p>
      </div>

      {/* Primary Module: Stock Control */}
      <div className={`border rounded-lg p-4 md:p-5 shadow-sm transition-colors ${isStockControlActive
        ? "bg-rose-50 border-rose-200"
        : "bg-orange-50/50 border-[#e85d04]/20"
        }`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className={`text-base font-black uppercase tracking-wider ${isStockControlActive ? "text-rose-700" : "text-[#e85d04]"
              }`}>
              Control de Stock
            </div>
            <div className={`text-sm mt-1 font-medium ${isStockControlActive ? "text-rose-600" : "text-zinc-600"
              }`}>
              {loadingStockControl
                ? "Cargando estado..."
                : isStockControlActive
                  ? `Control en curso. Ubicación actual: ${activeLocationCode || "-"}`
                  : "Realice un arqueo de inventario para corregir discrepancias. El sistema guiará el conteo por ubicaciones."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {!isStockControlActive && (
              <button
                className="rounded-lg bg-[#e85d04] hover:bg-[#d14f00] transition-colors border-transparent px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50 flex items-center gap-2"
                onClick={() => setShowStartPrompt(true)}
                disabled={!canManageStockControl || loadingStockControl}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Iniciar control de stock
              </button>
            )}
            {isStockControlActive && pendingLocations.length === 0 ? (
              <button
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 transition-colors px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50 flex items-center gap-2"
                onClick={finalizeStockControl}
                disabled={finalizingControl}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                {finalizingControl ? "Finalizando..." : "Finalizar control de stock"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Removed the inline isStockControlActive stock counting table from here, moved to full-screen modal at the bottom */}

      {/* Transfer Panel */}
      <div className="border rounded-lg p-5 bg-white border-zinc-200 shadow-sm">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
          Transferir Mercadería
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6 items-end">
          <div className="md:col-span-2 lg:col-span-2">
            <label className="text-[10px] uppercase font-black tracking-widest mb-1.5 block text-zinc-500">
              Desde
            </label>
            <select
              className="w-full border rounded-lg p-3 text-sm font-bold outline-none focus:border-[#e85d04] bg-zinc-50 border-zinc-200 text-zinc-900"
              value={fromCode}
              onChange={(event) => setFromCode(event.target.value)}
              disabled={isStockControlActive}
            >
              {transferLocations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest mb-1.5 block text-zinc-500">
              Hacia
            </label>
            <select
              className="w-full border rounded-lg p-3 text-sm font-bold outline-none focus:border-[#e85d04] bg-zinc-50 border-zinc-200 text-zinc-900"
              value={toCode}
              onChange={(event) => setToCode(event.target.value)}
              disabled={isStockControlActive}
            >
              {availableToOptions.map((code) => {
                const location = transferLocations.find((row) => row.code === code);
                return (
                  <option key={code} value={code}>
                    {location?.name || code}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <label className="text-[10px] uppercase font-black tracking-widest mb-1.5 block text-zinc-500">
              Producto
            </label>
            <select
              className="w-full border rounded-lg p-3 text-sm font-bold outline-none focus:border-[#e85d04] bg-zinc-50 border-zinc-200 text-zinc-900"
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
              disabled={isStockControlActive}
            >
              <option value="">Seleccionar</option>
              {transferableProducts.map((product) => (
                <option key={product.product_id} value={product.product_id}>
                  {String(product.name).toUpperCase()} - {product.sku || "SIN CODIGO"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest mb-1.5 block text-zinc-500">
              Cantidad
            </label>
            <input
              type="number"
              min={1}
              className="w-full border rounded-lg p-3 text-sm font-bold outline-none focus:border-[#e85d04] bg-zinc-50 border-zinc-200 text-zinc-900"
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              disabled={isStockControlActive}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest mb-1.5 block text-zinc-500">
              Motivo
            </label>
            <input
              readOnly
              className="w-full border rounded-lg p-3 text-sm font-bold outline-none bg-zinc-100 border-zinc-200 text-zinc-600"
              value={reason}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-1">
            <button
              className="w-full h-[46px] bg-[#e85d04] hover:bg-[#d14f00] text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
              onClick={handleTransfer}
              disabled={loading || !selectedProductId || isStockControlActive || !toCode}
            >
              Transferir mercaderia
            </button>
          </div>
        </div>
        {isStockControlActive ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            Control de stock en curso. Las transferencias quedan bloqueadas hasta finalizarlo.
          </div>
        ) : null}
      </div>

      {isStockControlActive ? (
        <div className="border rounded-lg bg-white border-zinc-200 shadow-sm flex-1 flex flex-col min-h-0">
          <div className="border-b border-zinc-200 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-black text-zinc-900">
                Conteo de {activeLocationCode === "LOCAL" ? "Local" : "Galpon"}
              </div>
              <div className="text-sm text-zinc-500">
                Ingresa el stock real. Si coincide, deja el valor esperado.
              </div>
            </div>
            <div className="flex gap-2">
              {(stockControlState?.locationOrder || []).map((locationCode) => {
                const completed = completedLocations.includes(locationCode);
                const active = activeLocationCode === locationCode;
                return (
                  <div
                    key={locationCode}
                    className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider ${active
                      ? "bg-[#e85d04] text-white"
                      : completed
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-500"
                      }`}
                  >
                    {locationCode}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-2">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-white border-b border-zinc-200 text-[10px] uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Codigo</th>
                  <th className="px-4 py-3 text-left">Unidad</th>
                  <th className="px-4 py-3 text-center">Stock sistema</th>
                  <th className="px-4 py-3 text-center">Stock real</th>
                </tr>
              </thead>
              <tbody>
                {currentLocationRows.map((row) => (
                  <tr key={`${activeLocationCode}-${row.id}`} className="border-b border-zinc-100">
                    <td className="px-4 py-3 font-semibold">{row.name}</td>
                    <td className="px-4 py-3 font-mono text-zinc-500">{row.code || "-"}</td>
                    <td className="px-4 py-3 text-zinc-500">{row.unitLabel}</td>
                    <td className="px-4 py-3 text-center font-bold">{row.expectedQty}</td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min={0}
                        className="w-28 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-bold text-zinc-900 outline-none focus:border-[#e85d04]"
                        value={row.actualQty}
                        onChange={(event) =>
                          updateActualQty(activeLocationCode, row.id, event.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-zinc-200 px-4 py-3 flex justify-end gap-2">
            <button
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-700 disabled:opacity-50"
              onClick={saveCurrentLocation}
              disabled={savingControlLocation}
            >
              {savingControlLocation ? "Guardando..." : "Guardar conteo"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="border rounded-lg flex-1 flex flex-col min-h-0 border-zinc-200 shadow-sm overflow-hidden">
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase tracking-widest border-b sticky top-0 z-10 text-zinc-500 border-zinc-200 bg-white/95 backdrop-blur shadow-sm">
              <tr>
                <th className="px-5 py-4 font-black">Producto</th>
                <th className="px-5 py-4 font-black w-40">Codigo</th>
                {transferLocations.map((location) => (
                  <th key={location.code} className="px-5 py-4 font-black w-32 text-center">
                    {location.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={2 + transferLocations.length} className="text-center py-10 text-zinc-600">
                    Cargando inventario...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={2 + transferLocations.length} className="text-center py-10 text-zinc-600">
                    No hay productos configurados
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.product_id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                    <td className="px-5 py-4 font-semibold text-zinc-800">{product.name}</td>
                    <td className="px-5 py-4 font-mono text-zinc-500">{product.sku || "-"}</td>
                    {transferLocations.map((location) => (
                      <td key={`${product.product_id}-${location.code}`} className="px-5 py-4 text-center font-bold text-zinc-700">
                        {Number(product.stocks?.[location.code]?.quantity || 0)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(report && reportRows.length > 0 && !isStockControlActive) ? (
        <div className="border rounded-lg bg-white border-zinc-200 shadow-sm mt-4">
          <div className="border-b border-zinc-200 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-lg font-black text-zinc-900">Resultado del control de stock</div>
              <div className="text-sm text-zinc-500">
                {reportRows.length
                  ? `${reportRows.length} diferencias detectadas`
                  : "No se encontraron diferencias"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-700" onClick={printReport}>
                Imprimir PDF
              </button>
              <button className="rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-700" onClick={shareReport}>
                Compartir
              </button>
              <button className="rounded-lg bg-[#e85d04] px-4 py-2 text-sm font-bold text-white" onClick={downloadExcelReport}>
                Descargar Excel
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-white border-b border-zinc-200 text-[10px] uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Ubicacion</th>
                  <th className="px-4 py-3 text-left">Codigo</th>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-center">Esperado</th>
                  <th className="px-4 py-3 text-center">Real</th>
                  <th className="px-4 py-3 text-center">Diferencia</th>
                  <th className="px-4 py-3 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.length ? (
                  reportRows.map((row, index) => (
                    <tr key={`${row.locationCode}-${row.productId}-${index}`} className="border-b border-zinc-100">
                      <td className="px-4 py-3 font-bold">{row.locationCode}</td>
                      <td className="px-4 py-3 font-mono text-zinc-500">{row.code || "-"}</td>
                      <td className="px-4 py-3">{row.productName}</td>
                      <td className="px-4 py-3 text-center">{row.expectedQty}</td>
                      <td className="px-4 py-3 text-center">{row.actualQty}</td>
                      <td className={`px-4 py-3 text-center font-bold ${row.difference < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {row.difference}
                      </td>
                      <td className="px-4 py-3">{row.description}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                      El control termino sin diferencias.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {showStartPrompt ? (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#121212] p-8 shadow-2xl space-y-6">
            <div>
              <div className="text-xl font-black tracking-tight text-white mb-2">INICIAR CONTROL DE STOCK</div>
              <div className="text-sm text-zinc-400">
                Elige por cuál depósito comenzar tu conteo físico. Luego el sistema te pedirá el otro.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                className="group w-full rounded-xl border border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 px-4 py-6 text-center transition-all"
                onClick={() => startStockControl("LOCAL")}
              >
                <div className="text-sm font-black text-white group-hover:text-[#e85d04] transition-colors mb-1">LOCAL</div>
                <div className="text-xs text-zinc-500 font-medium">Empezar aquí</div>
              </button>
              <button
                className="group w-full rounded-xl border border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 px-4 py-6 text-center transition-all"
                onClick={() => startStockControl("GALPON")}
              >
                <div className="text-sm font-black text-white group-hover:text-[#e85d04] transition-colors mb-1">GALPÓN</div>
                <div className="text-xs text-zinc-500 font-medium">Empezar aquí</div>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button className="rounded-lg px-6 py-2.5 text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors" onClick={() => setShowStartPrompt(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Fullscreen Stock Control Modal */}
      {isStockControlActive && (
        <div className="fixed inset-0 z-[200] bg-zinc-100 flex flex-col h-[100dvh] w-full animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-white border-b border-zinc-200 px-6 py-5 flex items-center justify-between gap-4 shadow-sm z-10 shrink-0">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${pendingLocations.length === 0 ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                <h2 className="text-2xl font-black tracking-tight text-zinc-900 uppercase">
                  {pendingLocations.length === 0 ? "Control completado" : `Conteo de ${activeLocationCode || ""}`}
                </h2>
              </div>
              <p className="text-sm text-zinc-500 ml-5 font-medium">
                {pendingLocations.length === 0
                  ? "Se han completado todas las ubicaciones. Ya puedes finalizar el arqueo."
                  : "Verifica el stock físico y corrige el \"Stock real\" si difiere del sistema."}
              </p>
              {pendingLocations.length > 0 ? (
                <div className="ml-5 mt-2 text-sm font-semibold text-zinc-500">
                  {currentLocationRows.length} productos en total
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 lg:gap-3 bg-zinc-50 p-1.5 rounded-xl border border-zinc-200">
              {(stockControlState?.locationOrder || []).map((locationCode) => {
                const completed = completedLocations.includes(locationCode);
                const active = activeLocationCode === locationCode;
                return (
                  <div
                    key={locationCode}
                    className={`rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${active
                      ? "bg-[#e85d04] text-white shadow-md"
                      : completed
                        ? "bg-emerald-100 text-emerald-700"
                        : "text-zinc-400"
                      }`}
                  >
                    {locationCode}
                    {completed && <span className="ml-2">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-zinc-50/50 px-4 md:px-8 py-6 flex flex-col">
            {pendingLocations.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
                  <svg className="w-12 h-12 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-3xl font-black text-zinc-900 tracking-tight mb-3">¡Misión cumplida!</h3>
                <p className="text-base text-zinc-500 max-w-sm mb-10">
                  Has completado el conteo en todos los depósitos asignados. Presiona el botón debajo para generar tu reporte final.
                </p>
                <button
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 transition-all px-10 py-5 text-lg font-black text-white shadow-xl hover:shadow-2xl hover:-translate-y-1 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest"
                  onClick={finalizeStockControl}
                  disabled={finalizingControl}
                >
                  {finalizingControl ? "Finalizando..." : "Finalizar control de stock"}
                </button>
              </div>
            ) : (
              <div className="max-w-6xl mx-auto w-full rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm font-semibold text-zinc-500">
                      Mostrando {visibleCurrentLocationRows.length} de {currentLocationRows.length} productos
                    </div>
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#e85d04] md:max-w-sm"
                      placeholder="Buscar por producto o codigo..."
                      value={stockControlQuery}
                      onChange={(event) => setStockControlQuery(event.target.value)}
                    />
                  </div>
                </div>
                <div className="max-h-[calc(100dvh-280px)] overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead className="sticky top-0 bg-white border-b border-zinc-200 text-[10px] uppercase tracking-widest text-zinc-500 shadow-sm z-10">
                    <tr>
                      <th className="px-6 py-4">Producto</th>
                      <th className="px-6 py-4 w-32 hidden sm:table-cell">Código</th>
                      <th className="px-6 py-4 w-32 text-center text-zinc-400">Stock sistema</th>
                      <th className="px-6 py-4 w-40 text-center text-[#e85d04]">Stock real</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {visibleCurrentLocationRows.map((row) => {
                      const diff = Number(row.actualQty) - Number(row.expectedQty);
                      const hasDiff = diff !== 0;
                      return (
                        <tr key={`${activeLocationCode}-${row.id}`} className={`transition-colors ${hasDiff ? 'bg-amber-50/30' : 'hover:bg-zinc-50'}`}>
                          <td className="px-6 py-4">
                            <div className="font-bold text-zinc-800 text-base">{row.name}</div>
                            <div className="text-xs text-zinc-400 mt-1 sm:hidden">Cód: {row.code || "-"} • {row.unitLabel}</div>
                          </td>
                          <td className="px-6 py-4 font-mono text-zinc-500 hidden sm:table-cell">{row.code || "-"}</td>
                          <td className="px-6 py-4 text-center font-bold text-zinc-400 text-lg">{row.expectedQty}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="relative inline-block">
                              <input
                                type="number"
                                min={0}
                                className={`w-32 rounded-xl border-2 px-4 py-3 text-lg font-black text-center outline-none transition-all ${hasDiff
                                  ? "border-amber-400 bg-amber-50 text-amber-900 focus:border-amber-600 focus:ring-4 focus:ring-amber-400/20"
                                  : "border-zinc-200 bg-zinc-50 text-zinc-900 focus:border-[#e85d04] focus:ring-4 focus:ring-[#e85d04]/20"
                                  }`}
                                value={row.actualQty}
                                onChange={(event) =>
                                  updateActualQty(activeLocationCode, row.id, event.target.value)
                                }
                              />
                              {hasDiff && (
                                <div className={`absolute -right-2 -top-2 rounded-full px-2 py-0.5 text-[10px] font-black shadow-sm ${diff > 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                                  {diff > 0 ? '+' : ''}{diff}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>

          {pendingLocations.length > 0 && (
            <div className="bg-white border-t border-zinc-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10 shrink-0">
              <div className="text-sm text-zinc-500 font-medium">
                Revisa cuidadosamente las diferencias antes de continuar a la siguiente ubicación.
              </div>
              <button
                className="w-full sm:w-auto rounded-xl bg-[#e85d04] hover:bg-[#d14f00] transition-all px-8 py-3.5 text-base font-black text-white shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wide"
                onClick={saveCurrentLocation}
                disabled={savingControlLocation}
              >
                {savingControlLocation ? (
                  <>Guardando...</>
                ) : (
                  <>
                    Continuar
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
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
