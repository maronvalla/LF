import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";

function SignaturePad({ label, onChange, initialDataUrl }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const resizeAndPaintInitial = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parentWidth = canvas.parentElement?.clientWidth || 320;
    const width = Math.max(280, Math.floor(parentWidth - 2));
    const height = 150;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0f0f10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#f3f4f6";

    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = initialDataUrl;
    }
  };

  useEffect(() => {
    resizeAndPaintInitial();
    const onResize = () => resizeAndPaintInitial();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [initialDataUrl]);

  const getPoint = (evt) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = evt.touches?.[0] || evt.changedTouches?.[0];
    const x = touch ? touch.clientX : evt.clientX;
    const y = touch ? touch.clientY : evt.clientY;
    return { x: x - rect.left, y: y - rect.top };
  };

  const begin = (evt) => {
    evt.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(evt);
  };

  const move = (evt) => {
    if (!drawingRef.current) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const current = getPoint(evt);
    const last = lastPointRef.current;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    lastPointRef.current = current;
    onChange(canvas.toDataURL("image/png"));
  };

  const end = (evt) => {
    if (!drawingRef.current) return;
    evt.preventDefault();
    drawingRef.current = false;
    const canvas = canvasRef.current;
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0f0f10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">{label}</div>
      <div className="border border-zinc-800 rounded-lg overflow-hidden bg-[#0f0f10]">
        <canvas
          ref={canvasRef}
          className="w-full block touch-none"
          onMouseDown={begin}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={begin}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <button type="button" className="btn btn-muted text-xs" onClick={clear}>
        Limpiar Firma
      </button>
    </div>
  );
}

export default function Consolidado({ user, setToast }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState("11");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [consolidated, setConsolidated] = useState([]);
  const [rejectedReturns, setRejectedReturns] = useState([]);

  const [pickPlanByProduct, setPickPlanByProduct] = useState({});
  const [checklistByProduct, setChecklistByProduct] = useState({});

  const [cashierName, setCashierName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [cashierSignature, setCashierSignature] = useState("");
  const [driverSignature, setDriverSignature] = useState("");
  const [savingControl, setSavingControl] = useState(false);

  const [controlOpen, setControlOpen] = useState(false);
  const [controlStep, setControlStep] = useState("checklist");

  const role = String(user?.role || "").toUpperCase();
  const canControl = role === "ADMIN" || role === "CAJERO";

  useEffect(() => {
    if (canControl) {
      setCashierName(user?.fullName || user?.full_name || user?.username || "");
    }
  }, [canControl, user]);

  const load = async () => {
    setLoading(true);
    try {
      const [ordersRes, consolidatedRes] = await Promise.all([
        api.get("/deliveries", { params: { date, slot } }),
        api.get("/deliveries/consolidated", { params: { date, slot } }),
      ]);

      const nextOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
      const nextConsolidated = Array.isArray(consolidatedRes.data?.consolidated)
        ? consolidatedRes.data.consolidated
        : [];
      const nextRejectedReturns = Array.isArray(consolidatedRes.data?.rejectedReturns)
        ? consolidatedRes.data.rejectedReturns
        : [];

      setOrders(nextOrders);
      setConsolidated(nextConsolidated);
      setRejectedReturns(nextRejectedReturns);

      const defaultPlan = {};
      const defaultChecklist = {};
      for (const row of nextConsolidated) {
        const total = Number(row.total_qty || 0);
        const pick = String(row.default_pick_location || "GALPON").toUpperCase();
        defaultPlan[row.product_id] = pick === "LOCAL"
          ? { localQty: total, galponQty: 0 }
          : { localQty: 0, galponQty: total };
        defaultChecklist[row.product_id] = false;
      }

      setPickPlanByProduct(defaultPlan);
      setChecklistByProduct(defaultChecklist);

      if (canControl) {
        const controlRes = await api.get("/deliveries/consolidated-control", {
          params: { date, slot },
        });
        const control = controlRes.data;
        if (control) {
          setCashierName(control.cashier_name || "");
          setDriverName(control.driver_name || "");
          setCashierSignature(control.cashier_signature_base64 || "");
          setDriverSignature(control.driver_signature_base64 || "");

          const savedChecklist = control.checklist_json && typeof control.checklist_json === "object"
            ? control.checklist_json
            : {};
          const savedPlan = Array.isArray(control.pick_plan_json) ? control.pick_plan_json : [];

          setChecklistByProduct((prev) => ({ ...prev, ...savedChecklist }));
          setPickPlanByProduct((prev) => {
            const next = { ...prev };
            for (const item of savedPlan) {
              if (!item?.productId) continue;
              next[item.productId] = {
                localQty: Number(item.localQty || 0),
                galponQty: Number(item.galponQty || 0),
              };
            }
            return next;
          });
        } else {
          setDriverName("");
          setCashierSignature("");
          setDriverSignature("");
        }
      }
    } catch (err) {
      setOrders([]);
      setConsolidated([]);
      setRejectedReturns([]);
      setToast?.({ message: err.response?.data?.message || "No se pudo cargar consolidado", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date, slot]);

  const totalBultos = useMemo(
    () => consolidated.reduce((acc, row) => acc + Number(row.total_qty || 0), 0),
    [consolidated]
  );

  const totalEnvasesRetornables = useMemo(
    () => consolidated.reduce((acc, row) => acc + Number(row.total_returnable_units || 0), 0),
    [consolidated]
  );

  const totalMercaderiaDevuelta = useMemo(
    () => rejectedReturns.reduce((acc, row) => acc + Number(row.qty_to_return || 0), 0),
    [rejectedReturns]
  );

  const pedidosEnvio = useMemo(
    () => orders.filter((o) => String(o.delivery_status || "").toUpperCase() !== "ANULADO"),
    [orders]
  );

  const pickPlanRows = useMemo(
    () =>
      consolidated.map((row) => {
        const plan = pickPlanByProduct[row.product_id] || { localQty: 0, galponQty: Number(row.total_qty || 0) };
        const total = Number(row.total_qty || 0);
        const assigned = Number(plan.localQty || 0) + Number(plan.galponQty || 0);
        return {
          ...row,
          localQty: Number(plan.localQty || 0),
          galponQty: Number(plan.galponQty || 0),
          assigned,
          mismatch: assigned !== total,
        };
      }),
    [consolidated, pickPlanByProduct]
  );

  const checklistDoneCount = useMemo(
    () => consolidated.filter((r) => Boolean(checklistByProduct[r.product_id])).length,
    [consolidated, checklistByProduct]
  );

  const allChecklistDone = consolidated.length > 0 && checklistDoneCount === consolidated.length;
  const allPickPlanValid = pickPlanRows.every((row) => !row.mismatch);

  const saveControl = async () => {
    if (!canControl) return;
    if (!allPickPlanValid) {
      setToast?.({ message: "Hay productos con cantidades mal asignadas entre LOCAL y GALPON", type: "error" });
      return;
    }
    if (!allChecklistDone) {
      setToast?.({ message: "Debes tildar todo el checklist de mercaderia", type: "error" });
      return;
    }
    if (!cashierName.trim()) {
      setToast?.({ message: "Ingrese nombre del cajero", type: "error" });
      return;
    }
    if (!cashierSignature) {
      setToast?.({ message: "Falta firma del cajero", type: "error" });
      return;
    }
    if (!driverName.trim()) {
      setToast?.({ message: "Ingrese nombre del chofer", type: "error" });
      return;
    }
    if (!driverSignature) {
      setToast?.({ message: "Falta firma del chofer", type: "error" });
      return;
    }

    setSavingControl(true);
    try {
      await api.post("/deliveries/consolidated-control", {
        date,
        slot,
        cashierName: cashierName.trim(),
        driverName: driverName.trim(),
        cashierSignatureBase64: cashierSignature,
        driverSignatureBase64: driverSignature,
        totalOrders: pedidosEnvio.length,
        totalItems: totalBultos,
        checklist: checklistByProduct,
        pickPlan: pickPlanRows.map((r) => ({
          productId: r.product_id,
          localQty: Number(r.localQty || 0),
          galponQty: Number(r.galponQty || 0),
        })),
      });
      setToast?.({ message: "Control de consolidado guardado", type: "success" });
      setControlOpen(false);
      setControlStep("checklist");
    } catch (err) {
      setToast?.({ message: err.response?.data?.message || "No se pudo guardar el control", type: "error" });
    } finally {
      setSavingControl(false);
    }
  };

  const setPlan = (productId, field, value, totalQty) => {
    const parsed = Math.max(0, Math.floor(Number(value || 0)));
    setPickPlanByProduct((prev) => {
      const base = prev[productId] || { localQty: 0, galponQty: Number(totalQty || 0) };
      const next = { ...base, [field]: parsed };
      if (field === "localQty") {
        next.galponQty = Math.max(0, Number(totalQty || 0) - next.localQty);
      } else if (field === "galponQty") {
        next.localQty = Math.max(0, Number(totalQty || 0) - next.galponQty);
      }
      return { ...prev, [productId]: next };
    });
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="px-1">
        <h1 className="text-[28px] font-bold leading-none text-white tracking-tight">Consolidado</h1>
        <p className="text-xs text-zinc-400 mt-1">Preparacion de carga con control secuencial y firmas</p>
      </div>

      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-3 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Fecha</label>
          <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Turno</label>
          <select className="input mt-1" value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="11">11:00</option>
            <option value="19">19:00</option>
          </select>
        </div>
        <div className="md:col-span-2 flex gap-2">
          <button type="button" className="btn btn-primary w-full" onClick={load} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar"}
          </button>
          {canControl ? (
            <button
              type="button"
              className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white w-full"
              onClick={() => {
                setControlStep("checklist");
                setControlOpen(true);
              }}
            >
              Iniciar control
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat title="Pedidos de Envio" value={pedidosEnvio.length} />
        <Stat title="Productos Distintos" value={consolidated.length} />
        <Stat title="Cantidad Total a Sacar" value={totalBultos} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Stat title="Envases Retornables (Salida)" value={totalEnvasesRetornables} />
        <Stat title="Mercaderia a Devolver (Rechazos)" value={totalMercaderiaDevuelta} />
      </div>

      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 text-sm font-black uppercase text-[#e85d04]">
          1) Previsualizacion de mercaderia a sacar
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400 uppercase text-[10px] sticky top-0 bg-[#1a1a1a]">
              <tr>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-left px-4 py-3">Producto</th>
                <th className="text-left px-4 py-3">Unidad</th>
                <th className="text-right px-4 py-3">Cantidad</th>
                <th className="text-right px-4 py-3">Envases</th>
              </tr>
            </thead>
            <tbody>
              {consolidated.map((row) => (
                <tr key={row.product_id} className="border-t border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">{row.sku || "-"}</td>
                  <td className="px-4 py-2 font-bold text-zinc-200">{row.name}</td>
                  <td className="px-4 py-2 text-zinc-400 uppercase">{row.unit_label || "unidad"}</td>
                  <td className="px-4 py-2 text-right font-black text-[#e85d04]">{Number(row.total_qty || 0)}</td>
                  <td className="px-4 py-2 text-right font-black text-emerald-400">{Number(row.total_returnable_units || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 text-sm font-black uppercase text-[#e85d04]">
          2) Definir de donde se saca cada cantidad (LOCAL / GALPON)
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400 uppercase text-[10px] sticky top-0 bg-[#1a1a1a]">
              <tr>
                <th className="text-left px-4 py-3">Producto</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">LOCAL</th>
                <th className="text-right px-4 py-3">GALPON</th>
                <th className="text-center px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pickPlanRows.map((row) => (
                <tr key={row.product_id} className="border-t border-zinc-800/60">
                  <td className="px-4 py-2 font-bold text-zinc-200">{row.name}</td>
                  <td className="px-4 py-2 text-right font-black text-[#e85d04]">{Number(row.total_qty || 0)}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      className="input w-24 ml-auto text-right"
                      type="number"
                      min="0"
                      step="1"
                      value={row.localQty}
                      onChange={(e) => setPlan(row.product_id, "localQty", e.target.value, row.total_qty)}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      className="input w-24 ml-auto text-right"
                      type="number"
                      min="0"
                      step="1"
                      value={row.galponQty}
                      onChange={(e) => setPlan(row.product_id, "galponQty", e.target.value, row.total_qty)}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    {row.mismatch ? (
                      <span className="text-xs font-black text-rose-400">NO CUADRA</span>
                    ) : (
                      <span className="text-xs font-black text-emerald-400">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#121212] border border-zinc-800/80 rounded-lg overflow-hidden flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-zinc-800 text-sm font-black uppercase text-[#e85d04]">
          Mercaderia a Devolver por Rechazos
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="text-zinc-400 uppercase text-[10px] sticky top-0 bg-[#1a1a1a]">
              <tr>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-left px-4 py-3">Producto</th>
                <th className="text-left px-4 py-3">Unidad</th>
                <th className="text-right px-4 py-3">Cantidad Dev.</th>
              </tr>
            </thead>
            <tbody>
              {rejectedReturns.map((row) => (
                <tr key={row.product_id} className="border-t border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">{row.sku || "-"}</td>
                  <td className="px-4 py-2 font-bold text-zinc-200">{row.name}</td>
                  <td className="px-4 py-2 text-zinc-400 uppercase">{row.unit_label || "unidad"}</td>
                  <td className="px-4 py-2 text-right font-black text-yellow-400">{Number(row.qty_to_return || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {controlOpen && canControl ? (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-[#121212] border border-zinc-800 rounded-2xl p-4 space-y-4 max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black uppercase text-[#e85d04]">Control Secuencial de Consolidado</div>
              <button className="btn btn-muted" onClick={() => setControlOpen(false)}>Cerrar</button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs font-black uppercase">
              <div className={`p-2 rounded ${controlStep === "checklist" ? "bg-[#e85d04] text-white" : "bg-zinc-900 text-zinc-400"}`}>1. Checklist</div>
              <div className={`p-2 rounded ${controlStep === "cashier" ? "bg-[#e85d04] text-white" : "bg-zinc-900 text-zinc-400"}`}>2. Firma Cajero</div>
              <div className={`p-2 rounded ${controlStep === "driver" ? "bg-[#e85d04] text-white" : "bg-zinc-900 text-zinc-400"}`}>3. Firma Chofer</div>
            </div>

            {controlStep === "checklist" ? (
              <div className="space-y-3">
                <div className="text-xs text-zinc-400">Marcar con tilde la mercaderia verificada ({checklistDoneCount}/{consolidated.length})</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {consolidated.map((row) => (
                    <label key={row.product_id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#e85d04]"
                        checked={Boolean(checklistByProduct[row.product_id])}
                        onChange={(e) => setChecklistByProduct((prev) => ({ ...prev, [row.product_id]: e.target.checked }))}
                      />
                      <span className="text-sm font-bold text-zinc-200">{row.name}</span>
                      <span className="ml-auto text-xs font-black text-emerald-400">{Boolean(checklistByProduct[row.product_id]) ? "?" : ""}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button className="btn btn-primary" disabled={!allChecklistDone || !allPickPlanValid} onClick={() => setControlStep("cashier")}>Confirmar checklist</button>
                </div>
              </div>
            ) : null}

            {controlStep === "cashier" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Nombre Cajero</label>
                  <input className="input mt-1" value={cashierName} onChange={(e) => setCashierName(e.target.value)} />
                </div>
                <SignaturePad label="Firma Cajero" initialDataUrl={cashierSignature} onChange={setCashierSignature} />
                <div className="flex justify-between">
                  <button className="btn btn-muted" onClick={() => setControlStep("checklist")}>Volver</button>
                  <button className="btn btn-primary" disabled={!cashierName.trim() || !cashierSignature} onClick={() => setControlStep("driver")}>Continuar a firma chofer</button>
                </div>
              </div>
            ) : null}

            {controlStep === "driver" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Nombre Chofer</label>
                  <input className="input mt-1" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                </div>
                <SignaturePad label="Firma Chofer" initialDataUrl={driverSignature} onChange={setDriverSignature} />
                <div className="flex justify-between">
                  <button className="btn btn-muted" onClick={() => setControlStep("cashier")}>Volver</button>
                  <button className="btn btn-primary" disabled={savingControl || !driverName.trim() || !driverSignature} onClick={saveControl}>
                    {savingControl ? "Guardando..." : "Guardar control firmado"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ title, value }) {
  return (
    <div className="bg-[#121212] border border-zinc-800/80 rounded-lg p-4">
      <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">{title}</div>
      <div className="text-2xl font-black text-white mt-1">{value}</div>
    </div>
  );
}
