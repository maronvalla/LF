import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { DEFAULT_TICKET_CONFIG, loadTicketConfig } from "../utils/ticketConfig";

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
      <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
        {label}
      </div>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-[#0f0f10] shadow-sm">
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
      <button
        type="button"
        className="btn btn-muted bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs"
        onClick={clear}
      >
        Limpiar Firma
      </button>
    </div>
  );
}

export default function Consolidado({ user, setToast }) {
  const [theme] = useState(() => localStorage.getItem("appTheme") || "light");
  const isDark = theme === "dark";

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
  const [hasSavedControlForShift, setHasSavedControlForShift] = useState(false);

  const [controlOpen, setControlOpen] = useState(false);
  const [controlStep, setControlStep] = useState("checklist");
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printPreviewLines, setPrintPreviewLines] = useState([]);
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [ticketConfig, setTicketConfig] = useState(DEFAULT_TICKET_CONFIG);
  const printPromptResolverRef = useRef(null);

  const role = String(user?.role || "").toUpperCase();
  const canControl = role === "ADMIN" || role === "CAJERO";

  useEffect(() => {
    if (canControl) {
      setCashierName(user?.fullName || user?.full_name || user?.username || "");
    }
  }, [canControl, user]);

  useEffect(() => {
    setTicketConfig(loadTicketConfig());
  }, []);

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
      const nextRejectedReturns = Array.isArray(
        consolidatedRes.data?.rejectedReturns,
      )
        ? consolidatedRes.data.rejectedReturns
        : [];

      setOrders(nextOrders);
      setConsolidated(nextConsolidated);
      setRejectedReturns(nextRejectedReturns);

      const defaultPlan = {};
      const defaultChecklist = {};
      for (const row of nextConsolidated) {
        const total = Number(row.total_qty || 0);
        const pick = String(
          row.default_pick_location || "GALPON",
        ).toUpperCase();
        defaultPlan[row.product_id] =
          pick === "LOCAL"
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
        setHasSavedControlForShift(Boolean(control));
        if (control) {
          setCashierName(control.cashier_name || "");
          setDriverName(control.driver_name || "");
          setCashierSignature(control.cashier_signature_base64 || "");
          setDriverSignature(control.driver_signature_base64 || "");

          const savedChecklist =
            control.checklist_json && typeof control.checklist_json === "object"
              ? control.checklist_json
              : {};
          const savedPlan = Array.isArray(control.pick_plan_json)
            ? control.pick_plan_json
            : [];

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
      } else {
        setHasSavedControlForShift(false);
      }
    } catch (err) {
      setOrders([]);
      setConsolidated([]);
      setRejectedReturns([]);
      setToast?.({
        message: err.response?.data?.message || "No se pudo cargar consolidado",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date, slot]);

  const totalBultos = useMemo(
    () =>
      consolidated.reduce((acc, row) => acc + Number(row.total_qty || 0), 0),
    [consolidated],
  );

  const totalEnvasesRetornables = useMemo(
    () =>
      consolidated.reduce(
        (acc, row) => acc + Number(row.total_returnable_units || 0),
        0,
      ),
    [consolidated],
  );

  const totalMercaderiaDevuelta = useMemo(
    () =>
      rejectedReturns.reduce(
        (acc, row) => acc + Number(row.qty_to_return || 0),
        0,
      ),
    [rejectedReturns],
  );

  const pedidosEnvio = useMemo(
    () =>
      orders.filter(
        (o) => String(o.delivery_status || "").toUpperCase() !== "ANULADO",
      ),
    [orders],
  );

  const pickPlanRows = useMemo(
    () =>
      consolidated.map((row) => {
        const plan = pickPlanByProduct[row.product_id] || {
          localQty: 0,
          galponQty: Number(row.total_qty || 0),
        };
        const total = Number(row.total_qty || 0);
        const assigned =
          Number(plan.localQty || 0) + Number(plan.galponQty || 0);
        return {
          ...row,
          localQty: Number(plan.localQty || 0),
          galponQty: Number(plan.galponQty || 0),
          assigned,
          mismatch: assigned !== total,
        };
      }),
    [consolidated, pickPlanByProduct],
  );

  const checklistDoneCount = useMemo(
    () =>
      consolidated.filter((r) => Boolean(checklistByProduct[r.product_id]))
        .length,
    [consolidated, checklistByProduct],
  );

  const allChecklistDone =
    consolidated.length > 0 && checklistDoneCount === consolidated.length;
  const allPickPlanValid = pickPlanRows.every((row) => !row.mismatch);

  const saveControl = async () => {
    if (!canControl) return;
    if (!allPickPlanValid) {
      setToast?.({
        message:
          "Hay productos con cantidades mal asignadas entre LOCAL y GALPON",
        type: "error",
      });
      return;
    }
    if (!allChecklistDone) {
      setToast?.({
        message: "Debes tildar todo el checklist de mercaderia",
        type: "error",
      });
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
      const { data } = await api.post("/deliveries/consolidated-control", {
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
      const autoMarkedLoaded = Number(data?.autoMarkedLoaded || 0);
      setToast?.({
        message: `Control de consolidado guardado. Pedidos pasados a CARGADO: ${autoMarkedLoaded}`,
        type: "success",
      });
      setControlOpen(false);
      setControlStep("checklist");
      await load();
    } catch (err) {
      setToast?.({
        message: err.response?.data?.message || "No se pudo guardar el control",
        type: "error",
      });
    } finally {
      setSavingControl(false);
    }
  };

  const setPlan = (productId, field, value, totalQty) => {
    const parsed = Math.max(0, Math.floor(Number(value || 0)));
    setPickPlanByProduct((prev) => {
      const base = prev[productId] || {
        localQty: 0,
        galponQty: Number(totalQty || 0),
      };
      const next = { ...base, [field]: parsed };
      if (field === "localQty") {
        next.galponQty = Math.max(0, Number(totalQty || 0) - next.localQty);
      } else if (field === "galponQty") {
        next.localQty = Math.max(0, Number(totalQty || 0) - next.galponQty);
      }
      return { ...prev, [productId]: next };
    });
  };

  const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

  const askPrintConfirmation = (lines) =>
    new Promise(async (resolve) => {
      printPromptResolverRef.current = resolve;
      setPrintPreviewLines(Array.isArray(lines) ? lines : []);
      try {
        const printerApi = window?.desktopEnv?.listPrinters;
        if (typeof printerApi === "function") {
          const printers = (await printerApi()) || [];
          setAvailablePrinters(printers);
          const xp58 = printers.find((p) =>
            /xp-?58/i.test(String(p.name || p.displayName || "")),
          );
          setSelectedPrinter(xp58?.name || printers[0]?.name || "");
        } else {
          setAvailablePrinters([]);
          setSelectedPrinter("");
        }
      } catch {
        setAvailablePrinters([]);
        setSelectedPrinter("");
      }
      setShowPrintPrompt(true);
    });

  const resolvePrintConfirmation = (value) => {
    const resolver = printPromptResolverRef.current;
    printPromptResolverRef.current = null;
    setShowPrintPrompt(false);
    if (typeof resolver === "function") {
      resolver({
        shouldPrint: Boolean(value),
        deviceName: selectedPrinter || undefined,
      });
    }
  };

  useEffect(() => {
    if (!showPrintPrompt) return undefined;
    const onKeyDown = (e) => {
      const key = String(e.key || "").toLowerCase();
      if (key === "y") {
        e.preventDefault();
        resolvePrintConfirmation(true);
      } else if (key === "n" || key === "escape") {
        e.preventDefault();
        resolvePrintConfirmation(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showPrintPrompt, selectedPrinter]);

  useEffect(() => {
    return () => {
      if (printPromptResolverRef.current) {
        printPromptResolverRef.current(false);
        printPromptResolverRef.current = null;
      }
    };
  }, []);

  const printReceipt = async ({ lines, deviceName }) => {
    const ticket = {
      lines: Array.isArray(lines) ? lines : [],
      logoDataUrl: ticketConfig.logoDataUrl || "",
    };
    const canUseElectronPrinter =
      typeof window !== "undefined" &&
      window.desktopEnv &&
      typeof window.desktopEnv.printTicket === "function";

    if (canUseElectronPrinter) {
      try {
        await window.desktopEnv.printTicket({ ticket, deviceName });
        return;
      } catch (err) {
        const msg = String(err?.message || err || "");
        if (!/No handler registered for 'ticket:print'/i.test(msg)) {
          throw err;
        }
      }
    }
    const printable = window.open("", "_blank", "width=420,height=900");
    if (!printable) throw new Error("No se pudo abrir ventana de impresion");
    printable.document.write(`
      <html><head><title>Boleta consolidado</title><style>
      body { font-family: 'Courier New', monospace; width: 58mm; margin: 0; padding: 2mm; font-size: 11px; }
      .logo-wrap { text-align: center; margin-bottom: 2mm; }
      .logo { max-width: 24mm; max-height: 12mm; width: auto; height: auto; filter: grayscale(1) contrast(1.35); }
      .line { white-space: pre; }
      </style></head><body>
      ${ticket.logoDataUrl ? `<div class="logo-wrap"><img class="logo" src="${ticket.logoDataUrl}" alt="Logo" /></div>` : ""}
      ${ticket.lines.map((line) => `<div class="line">${String(line).replace(/</g, "&lt;")}</div>`).join("")}
      </body></html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
    printable.close();
  };

  const buildConsolidatedTicketLines = () => {
    const MAX = 32;
    const repeat = (char, len) => new Array(Math.max(0, len) + 1).join(char);
    const center = (text) => {
      const t = String(text || "").slice(0, MAX);
      const left = Math.max(0, Math.floor((MAX - t.length) / 2));
      return `${repeat(" ", left)}${t}`;
    };
    const leftRight = (left, right) => {
      const l = String(left || "");
      const r = String(right || "");
      const avail = Math.max(1, MAX - r.length);
      const trimmedLeft = l.length > avail ? `${l.slice(0, avail - 1)}.` : l;
      const spaces = Math.max(1, MAX - trimmedLeft.length - r.length);
      return `${trimmedLeft}${repeat(" ", spaces)}${r}`;
    };
    const now = new Date();
    const shiftLabel = slot === "19" ? "TARDE 19:00" : "MANANA 11:00";
    const lines = [];
    if (ticketConfig.businessName)
      lines.push(center(ticketConfig.businessName));
    if (ticketConfig.addressLine) lines.push(center(ticketConfig.addressLine));
    lines.push(center("BOLETA DE CONSOLIDADO"));
    lines.push(repeat("-", MAX));
    lines.push(leftRight("Fecha", now.toLocaleDateString("es-AR")));
    lines.push(
      leftRight(
        "Hora",
        now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      ),
    );
    lines.push(leftRight("Turno", shiftLabel));
    lines.push(leftRight("Pedidos", String(pedidosEnvio.length)));
    lines.push(leftRight("Bultos", String(totalBultos)));
    lines.push(leftRight("Envases", String(totalEnvasesRetornables)));
    lines.push(repeat("-", MAX));
    lines.push("MERCADERIA A SACAR");
    lines.push(repeat("-", MAX));
    consolidated.forEach((row) => {
      lines.push(
        String(row.name || "")
          .toUpperCase()
          .slice(0, MAX),
      );
      lines.push(leftRight("Cant", `${Number(row.total_qty || 0)}`));
      const plan = pickPlanByProduct[row.product_id] || {
        localQty: 0,
        galponQty: Number(row.total_qty || 0),
      };
      lines.push(
        leftRight(
          "Local/Galpon",
          `${Number(plan.localQty || 0)}/${Number(plan.galponQty || 0)}`,
        ),
      );
      if (Number(row.total_returnable_units || 0) > 0) {
        lines.push(
          leftRight("Envases", `${Number(row.total_returnable_units || 0)}`),
        );
      }
      lines.push(repeat("-", MAX));
    });
    if (rejectedReturns.length) {
      lines.push("DEVOLUCIONES POR RECHAZO");
      lines.push(repeat("-", MAX));
      rejectedReturns.forEach((row) => {
        lines.push(
          String(row.name || "")
            .toUpperCase()
            .slice(0, MAX),
        );
        lines.push(leftRight("Dev.", `${Number(row.qty_to_return || 0)}`));
      });
      lines.push(repeat("-", MAX));
    }
    lines.push(center("Control: ____ / Chofer: ____"));
    lines.push("");
    lines.push("");
    return lines;
  };

  const printConsolidated = async () => {
    const lines = buildConsolidatedTicketLines();
    const decision = await askPrintConfirmation(lines);
    if (!decision?.shouldPrint) return;
    try {
      await printReceipt({ lines, deviceName: decision?.deviceName });
      setToast?.({ message: "Boleta de consolidado impresa", type: "success" });
    } catch (err) {
      setToast?.({
        message: err?.message || "No se pudo imprimir boleta",
        type: "error",
      });
    }
  };

  return (
    <div className={`h-full flex flex-col gap-4 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
      <div className="px-1 flex flex-col md:flex-row md:justify-between md:items-center gap-2">
        <div>
          <h1 className={`text-[28px] font-bold leading-none tracking-tight ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
            Preparación de carga con control secuencial y firmas
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-2 md:mt-0">
          <button
            type="button"
            className={`btn ${isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}
            onClick={load}
            disabled={loading}
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>
          <button
            type="button"
            className={`btn ${isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700' : 'btn-muted'}`}
            onClick={printConsolidated}
          >
            Imprimir
          </button>
          {canControl ? (
            <button
              type="button"
              className="btn bg-[#e85d04] hover:bg-[#d14f00] text-white shadow-md"
              onClick={async () => {
                if (hasSavedControlForShift) {
                  const shouldCancel = window.confirm(
                    "Ya se registro el consolidado para este turno. Desea anularlo?",
                  );
                  if (!shouldCancel) return;
                  try {
                    const { data } = await api.post(
                      "/deliveries/consolidated-control/cancel",
                      {
                        date,
                        slot,
                      },
                    );
                    const reverted = Number(data?.reverted || 0);
                    setToast?.({
                      message: `Consolidado anulado. Pedidos vueltos a PENDIENTE: ${reverted}`,
                      type: "success",
                    });
                    await load();
                  } catch (err) {
                    setToast?.({
                      message:
                        err.response?.data?.message ||
                        "No se pudo anular el consolidado",
                      type: "error",
                    });
                    return;
                  }
                }
                setControlStep("checklist");
                setControlOpen(true);
              }}
            >
              Iniciar control
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${isDark ? 'bg-[#1a1a1c] border-zinc-800' : 'bg-white border-zinc-200'} border rounded-2xl p-4 md:p-5 flex flex-col md:flex-row gap-3 md:gap-4 items-end shadow-sm`}>
        <div className="flex-1 w-full relative">
          <label className={`text-[10px] md:text-[9px] uppercase font-black tracking-wider block mb-1 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            Fecha
          </label>
          <input
            type="date"
            className={`input mt-1 w-full focus:border-[#e85d04] ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-900'}`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex-1 w-full relative">
          <label className={`text-[10px] md:text-[9px] uppercase font-black tracking-wider block mb-1 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            Turno
          </label>
          <select
            className={`input mt-1 w-full focus:border-[#e85d04] ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-900'}`}
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
          >
            <option value="11">11:00 AM</option>
            <option value="19">19:00 PM</option>
          </select>
        </div>
        <div className="w-full md:w-auto mt-2 md:mt-0">
          <button type="button" className={`btn w-full md:w-auto h-[42px] px-6 flex items-center justify-center gap-2 ${isDark ? 'bg-zinc-900/50 border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'}`} onClick={load}>
            <span className="text-lg">Y</span> Filtrar
          </button>
        </div>
      </div>


      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat isDark={isDark} icon="📦" title="Pedidos" value={pedidosEnvio.length} />
        <Stat isDark={isDark} icon="🍱" title="Productos Diferentes" value={consolidated.length} />
        <Stat isDark={isDark} icon="🧮" title="Total Unidades" value={totalBultos} />
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
        {/* Table 1 */}
        <div className={`${isDark ? 'bg-[#1a1a1c] border-zinc-800' : 'bg-white border-zinc-200'} border rounded-2xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0`}>
          <div className={`px-5 py-4 border-b text-sm font-black uppercase flex items-center justify-between ${isDark ? 'border-zinc-800 text-zinc-100 bg-[#161618]' : 'border-zinc-100 text-[#e85d04] bg-[#fdfaf8]'}`}>
            <span>1. PREVISUALIZACION DE MERCADERIA A SACAR</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className={`uppercase text-[10px] ${isDark ? 'bg-[#161618] text-zinc-400' : 'bg-zinc-50/80 text-zinc-500'}`}>
                <tr>
                  <th className="text-left px-5 py-3 whitespace-nowrap font-bold">
                    Código
                  </th>
                  <th className="text-left px-5 py-3 font-bold">Producto</th>
                  <th className="text-left px-5 py-3 whitespace-nowrap font-bold">
                    Unidad
                  </th>
                  <th className="text-right px-5 py-3 whitespace-nowrap font-bold">
                    Cantidad
                  </th>
                  <th className="text-right px-5 py-3 whitespace-nowrap font-bold">
                    Envases
                  </th>
                </tr>
              </thead>
              <tbody>
                {consolidated.map((row) => (
                  <tr
                    key={row.product_id}
                    className={`border-t transition-colors ${isDark ? 'border-zinc-800/60 hover:bg-zinc-800/20' : 'border-zinc-100 hover:bg-zinc-50/50'}`}
                  >
                    <td className={`px-5 py-3 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{row.sku || "-"}</td>
                    <td className={`px-5 py-3 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      {row.name}
                    </td>
                    <td className={`px-5 py-3 uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {row.unit_label || "unidad"}
                    </td>
                    <td className={`px-5 py-3 text-right font-black text-base ${isDark ? 'text-zinc-200' : 'text-[#e85d04]'}`}>
                      {Number(row.total_qty || 0)}
                    </td>
                    <td className={`px-5 py-3 text-right font-black text-base ${isDark ? 'text-zinc-200' : 'text-emerald-600'}`}>
                      {Number(row.total_returnable_units || 0)}
                    </td>
                  </tr>
                ))}
                {!consolidated.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className={`text-center py-8 font-bold ${isDark ? 'text-zinc-500 bg-black/10' : 'text-zinc-400 bg-zinc-50/30'}`}
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
          {/* Table 1: Mercaderia Consolidad */}
          <div className={`border rounded-2xl flex flex-col min-h-[400px] xl:min-h-0 xl:h-[600px] shadow-sm ${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <div className={`p-4 xl:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isDark ? 'border-zinc-800/60 bg-zinc-900/50' : 'border-zinc-100 bg-zinc-50/50'}`}>
              <h2 className={`font-black uppercase tracking-tight text-sm xl:text-base flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-zinc-800'}`}>
                <span className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs ${isDark ? 'bg-[#e85d04]/80' : 'bg-[#e85d04]'}`}>1</span>
                Previsualizacion de Mercaderia
              </h2>
              <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-200/50 text-zinc-600'}`}>
                {consolidated.length} {consolidated.length === 1 ? 'item' : 'items'}
              </div>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[500px] text-xs xl:text-sm text-left">
                <thead className={`text-[10px] xl:text-xs uppercase tracking-widest border-b sticky top-0 z-10 ${isDark ? 'text-zinc-500 border-zinc-800/60 bg-[#121212]' : 'text-zinc-500 border-zinc-100 bg-white'}`}>
                  <tr>
                    <th className="px-4 xl:px-5 py-3 xl:py-4 font-black">
                      Codigo
                    </th>
                    <th className="px-4 xl:px-5 py-3 xl:py-4 font-black">
                      Producto
                    </th>
                    <th className="px-4 xl:px-5 py-3 xl:py-4 font-black">
                      Unidad
                    </th>
                    <th className="text-right px-4 xl:px-5 py-3 xl:py-4 font-black">
                      Total Prep.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {consolidated.map((row) => (
                    <tr
                      key={row.product_id}
                      className={`border-t transition-colors ${isDark ? 'border-zinc-800/60 hover:bg-zinc-800/20' : 'border-zinc-100 hover:bg-zinc-50/50'}`}
                    >
                      <td className={`px-4 xl:px-5 py-3 xl:py-4 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{row.sku || "-"}</td>
                      <td className={`px-4 xl:px-5 py-3 xl:py-4 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                        {row.name}
                      </td>
                      <td className={`px-4 xl:px-5 py-3 xl:py-4 uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {row.unit_label || "unidad"}
                      </td>
                      <td className={`px-4 xl:px-5 py-3 xl:py-4 text-right font-black text-base xl:text-lg ${isDark ? 'text-zinc-200' : 'text-[#e85d04]'}`}>
                        {Number(row.total_qty || 0)}
                      </td>
                    </tr>
                  ))}
                  {!consolidated.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className={`text-center py-10 font-bold ${isDark ? 'text-zinc-500 bg-black/10' : 'text-zinc-400 bg-zinc-50/30'}`}
                      >
                        No hay datos
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2 */}
          <div className={`${isDark ? 'bg-[#1a1a1c] border-zinc-800' : 'bg-white border-zinc-200'} border rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[400px] xl:min-h-0 xl:h-[600px]`}>
            <div className={`px-5 py-4 border-b text-sm font-black uppercase flex items-center justify-between ${isDark ? 'border-zinc-800 text-zinc-100 bg-[#161618]' : 'border-zinc-100 text-[#e85d04] bg-[#fdfaf8]'}`}>
              <span>2. ASIGNACIÓN DE STOCK (LOCAL/GALPÓN)</span>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full text-xs xl:text-sm min-w-[500px]">
                <thead className={`uppercase text-[10px] xl:text-xs tracking-widest sticky top-0 z-10 ${isDark ? 'bg-[#161618] text-zinc-400' : 'bg-zinc-50/80 text-zinc-500'}`}>
                  <tr>
                    <th className="text-left px-5 py-3 xl:py-4 font-black">Producto</th>
                    <th className="text-right px-5 py-3 xl:py-4 whitespace-nowrap font-black">
                      Total
                    </th>
                    <th className="text-right px-5 py-3 xl:py-4 whitespace-nowrap font-black">
                      LOCAL
                    </th>
                    <th className="text-right px-5 py-3 xl:py-4 whitespace-nowrap font-black">
                      GALPÓN
                    </th>
                    <th className="text-center px-5 py-3 xl:py-4 whitespace-nowrap font-black">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pickPlanRows.map((row) => (
                    <tr
                      key={row.product_id}
                      className={`border-t transition-colors ${isDark ? 'border-zinc-800/60 hover:bg-zinc-800/20' : 'border-zinc-100 hover:bg-zinc-50/50'}`}
                    >
                      <td className={`px-5 py-3 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                        {row.name}
                      </td>
                      <td className={`px-5 py-3 text-right font-black text-base ${isDark ? 'text-zinc-200' : 'text-[#e85d04]'}`}>
                        {Number(row.total_qty || 0)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <input
                          className={`input w-20 md:w-24 ml-auto text-right py-1 text-sm font-bold focus:border-[#e85d04] ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-900'}`}
                          type="number"
                          min="0"
                          step="1"
                          value={row.localQty}
                          onChange={(e) =>
                            setPlan(
                              row.product_id,
                              "localQty",
                              e.target.value,
                              row.total_qty,
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <input
                          className={`input w-20 md:w-24 ml-auto text-right py-1 text-sm font-bold focus:border-[#e85d04] ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-900'}`}
                          type="number"
                          min="0"
                          step="1"
                          value={row.galponQty}
                          onChange={(e) =>
                            setPlan(
                              row.product_id,
                              "galponQty",
                              e.target.value,
                              row.total_qty,
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-3 text-center">
                        {row.mismatch ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${isDark ? 'bg-amber-500/20 text-amber-500 ring-1 ring-inset ring-amber-500/40' : 'bg-rose-100 text-rose-600'}`}>
                            {isDark ? 'Requerir Galpón' : 'NO CUADRA'}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${isDark ? 'bg-emerald-500/20 text-emerald-500 ring-1 ring-inset ring-emerald-500/40' : 'bg-emerald-100 text-emerald-600'}`}>
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!pickPlanRows.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className={`text-center py-8 font-bold ${isDark ? 'text-zinc-500 bg-black/10' : 'text-zinc-400 bg-zinc-50/30'}`}
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

        <div className={`${isDark ? 'bg-[#1a1a1c] border-zinc-800' : 'bg-white border-zinc-200'} border rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[300px] mt-2`}>
          <div className={`px-5 py-4 border-b text-sm font-black uppercase flex items-center justify-between ${isDark ? 'border-zinc-800 text-zinc-100 bg-[#161618]' : 'border-zinc-100 text-[#e85d04] bg-[#fdfaf8]'}`}>
            <span>MERCADERIA A DEVOLVER POR RECHAZOS (AYER)</span>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full text-xs xl:text-sm min-w-[500px]">
              <thead className={`uppercase text-[10px] xl:text-xs tracking-widest sticky top-0 z-10 ${isDark ? 'bg-[#161618] text-zinc-400' : 'bg-zinc-50/80 text-zinc-500'}`}>
                <tr>
                  <th className="text-left px-5 py-3 xl:py-4 whitespace-nowrap font-black">
                    Código
                  </th>
                  <th className="text-left px-5 py-3 xl:py-4 font-black">Producto</th>
                  <th className="text-left px-5 py-3 xl:py-4 whitespace-nowrap font-black">
                    Unidad
                  </th>
                  <th className="text-right px-5 py-3 xl:py-4 whitespace-nowrap font-black">
                    Cantidad Dev.
                  </th>
                </tr>
              </thead>
              <tbody>
                {rejectedReturns.map((row) => (
                  <tr
                    key={row.product_id}
                    className={`border-t transition-colors ${isDark ? 'border-zinc-800/60 hover:bg-zinc-800/20' : 'border-zinc-100 hover:bg-zinc-50/50'}`}
                  >
                    <td className={`px-5 py-3 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{row.sku || "-"}</td>
                    <td className={`px-5 py-3 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      {row.name}
                    </td>
                    <td className={`px-5 py-3 uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {row.unit_label || "unidad"}
                    </td>
                    <td className={`px-5 py-3 text-right font-black text-base ${isDark ? 'text-zinc-200' : 'text-amber-500'}`}>
                      {Number(row.qty_to_return || 0)}
                    </td>
                  </tr>
                ))}
                {!rejectedReturns.length && (
                  <tr>
                    <td
                      colSpan={4}
                      className={`text-center py-8 font-bold ${isDark ? 'text-zinc-500 bg-black/10' : 'text-zinc-400 bg-zinc-50/30'}`}
                    >
                      No hay rechazos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {
          controlOpen && canControl ? (
            <div className="fixed inset-0 z-[200] bg-zinc-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className={`w-full max-w-5xl border rounded-2xl p-5 md:p-8 space-y-6 my-auto shadow-xl ${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-base md:text-lg font-black uppercase text-[#e85d04] tracking-tight">
                    Control Secuencial de Consolidado
                  </div>
                  <button
                    className={`btn w-full sm:w-auto ${isDark ? 'btn-muted' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200'}`}
                    onClick={() => setControlOpen(false)}
                  >
                    Cerrar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px] md:text-xs font-black uppercase">
                  <div
                    className={`p-2.5 rounded-lg flex items-center justify-center transition-colors ${controlStep === "checklist"
                      ? "bg-[#e85d04] text-white shadow-md"
                      : isDark ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                      }`}
                  >
                    1. Checklist
                  </div>
                  <div
                    className={`p-2.5 rounded-lg flex items-center justify-center transition-colors ${controlStep === "cashier"
                      ? "bg-[#e85d04] text-white shadow-md"
                      : isDark ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                      }`}
                  >
                    2. Firma Cajero
                  </div>
                  <div
                    className={`p-2.5 rounded-lg flex items-center justify-center transition-colors ${controlStep === "driver"
                      ? "bg-[#e85d04] text-white shadow-md"
                      : isDark ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                      }`}
                  >
                    3. Firma Chofer
                  </div>
                </div>

                {controlStep === "checklist" ? (
                  <div className="space-y-4">
                    <div className={`text-sm font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Marcar con tilde la mercaderia verificada (
                      {checklistDoneCount}/{consolidated.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-2 pb-2">
                      {consolidated.map((row) => (
                        <label
                          key={row.product_id}
                          className={`flex items-center gap-3 border rounded-xl p-3.5 cursor-pointer hover:border-[#e85d04]/50 transition-all shadow-sm ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-800'}`}
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 md:h-4 md:w-4 accent-[#e85d04] cursor-pointer"
                            checked={Boolean(checklistByProduct[row.product_id])}
                            onChange={(e) =>
                              setChecklistByProduct((prev) => ({
                                ...prev,
                                [row.product_id]: e.target.checked,
                              }))
                            }
                          />
                          <span className="text-sm md:text-xs font-bold line-clamp-2 leading-tight">
                            {row.name}
                          </span>
                          <span className={`ml-auto text-sm font-black ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`}>
                            {Boolean(checklistByProduct[row.product_id]) ? "✔" : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end pt-3">
                      <button
                        className="btn btn-primary w-full sm:w-auto py-3 md:py-2.5 px-6 text-sm font-bold shadow-md"
                        disabled={!allChecklistDone || !allPickPlanValid}
                        onClick={() => setControlStep("cashier")}
                      >
                        Confirmar checklist
                      </button>
                    </div>
                  </div>
                ) : null}

                {controlStep === "cashier" ? (
                  <div className="space-y-5">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
                        Nombre Cajero
                      </label>
                      <input
                        className={`input mt-1.5 w-full focus:border-[#e85d04] ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-900'}`}
                        value={cashierName}
                        onChange={(e) => setCashierName(e.target.value)}
                      />
                    </div>
                    <SignaturePad
                      label="Firma Cajero"
                      initialDataUrl={cashierSignature}
                      onChange={setCashierSignature}
                    />
                    <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
                      <button
                        className={`btn w-full sm:w-auto py-3 md:py-2 ${isDark ? 'btn-muted' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200'}`}
                        onClick={() => setControlStep("checklist")}
                      >
                        Volver
                      </button>
                      <button
                        className="btn btn-primary w-full sm:w-auto py-3 md:py-2 font-bold px-6 shadow-md"
                        disabled={!cashierName.trim() || !cashierSignature}
                        onClick={() => setControlStep("driver")}
                      >
                        Continuar a firma chofer
                      </button>
                    </div>
                  </div>
                ) : null}

                {controlStep === "driver" ? (
                  <div className="space-y-5">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
                        Nombre Chofer
                      </label>
                      <input
                        className={`input mt-1.5 w-full focus:border-[#e85d04] ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-900'}`}
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                      />
                    </div>
                    <SignaturePad
                      label="Firma Chofer"
                      initialDataUrl={driverSignature}
                      onChange={setDriverSignature}
                    />
                    <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
                      <button
                        className={`btn w-full sm:w-auto py-3 md:py-2 ${isDark ? 'btn-muted' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200'}`}
                        onClick={() => setControlStep("cashier")}
                      >
                        Volver
                      </button>
                      <button
                        className="btn btn-primary w-full sm:w-auto py-3 md:py-2 font-bold px-6 shadow-md"
                        disabled={
                          savingControl || !driverName.trim() || !driverSignature
                        }
                        onClick={saveControl}
                      >
                        {savingControl ? "Guardando..." : "Guardar control firmado"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null
        }

        {
          showPrintPrompt ? (
            <div className="fixed inset-0 bg-zinc-900/60 dark:bg-black/70 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
              <div className={`w-full max-w-xl rounded-2xl border shadow-xl p-6 space-y-5 ${isDark ? 'bg-[#121212] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <div className="text-lg font-black uppercase tracking-tight text-[#e85d04]">
                  Imprimir boleta consolidado
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block">
                    Impresora
                  </label>
                  <select
                    className={`input w-full focus:border-[#e85d04] ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-900'}`}
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
                <div className={`border rounded-xl p-4 max-h-80 overflow-auto shadow-inner ${isDark ? 'bg-white text-black border-zinc-800' : 'bg-zinc-50 text-zinc-800 border-zinc-200'}`}>
                  <div className="mx-auto w-[58mm] font-mono text-[11px] leading-tight flex flex-col items-center">
                    {printPreviewLines.map((line, idx) => (
                      <div key={`${line}-${idx}`} className="whitespace-pre">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`text-xs font-medium px-3 py-2 rounded-lg border flex items-center gap-2 ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-zinc-50 text-zinc-500 border-zinc-100'}`}>
                  <span>Atajos:</span>
                  <span className={`font-black px-1.5 py-0.5 rounded border shadow-sm ${isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-white text-zinc-800 border-zinc-200'}`}>
                    Y
                  </span>{" "}
                  = SI,{" "}
                  <span className={`font-black px-1.5 py-0.5 rounded border shadow-sm ${isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-white text-zinc-800 border-zinc-200'}`}>
                    N
                  </span>{" "}
                  = NO
                </div>
                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    className={`btn ${isDark ? 'btn-muted' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200'}`}
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
          ) : null
        }
      </div>
    </div>
  );
}

function Stat({ title, subtitle = "Total", value, icon, isDark }) {
  return (
    <div className={`${isDark ? 'bg-[#1a1a1c] border-zinc-800' : 'bg-white border-zinc-200'} border rounded-xl p-4 md:p-5 shadow-sm flex items-start gap-4`}>
      <div className={`text-3xl mt-1 opacity-90 ${isDark ? '' : 'inherit'}`}>
        {icon}
      </div>
      <div>
        <div className={`text-sm md:text-xs xl:text-sm font-bold leading-tight ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
          {title}
        </div>
        <div className={`text-[10px] mt-1 uppercase font-black tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
          {subtitle}: <span className={isDark ? 'text-zinc-300' : 'text-zinc-900'}>{value}</span>
        </div>
      </div>
    </div>
  );
}
