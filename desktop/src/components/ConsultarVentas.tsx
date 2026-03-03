import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import PrintPromptModal from "./ventas/PrintPromptModal";
import {
  DEFAULT_TICKET_CONFIG,
  getTicketMaxChars,
  getTicketPaperWidthMm,
  loadTicketConfig,
} from "../utils/ticketConfig";

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
type TicketConfig = typeof DEFAULT_TICKET_CONFIG;

interface ReprintSaleDetail {
  saleNumber: string;
  customerName: string;
  sellerName: string;
  invoiceType: string;
  paymentMethod: string;
  createdAt: string;
  items: Array<{ name: string; qty: number; unitPrice: number }>;
  totalAmount: number;
}

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

const buildReprintLines = (sale: ReprintSaleDetail, config: TicketConfig): string[] => {
  const MAX = getTicketMaxChars(config);
  const size = Number(config.fontSize || 15);
  const separatorLength =
    size >= 30 ? Math.min(MAX, 12)
    : size >= 26 ? Math.min(MAX, 14)
    : size >= 22 ? Math.min(MAX, 18)
    : size >= 18 ? Math.min(MAX, 24)
    : MAX;

  const repeat = (char: string, len: number) => new Array(Math.max(0, len) + 1).join(char);
  const center = (text: string) => {
    const t = String(text || "").slice(0, MAX);
    const left = Math.max(0, Math.floor((MAX - t.length) / 2));
    return `${repeat(" ", left)}${t}`;
  };
  const leftRight = (left: string, right: string) => {
    const l = String(left || "");
    const r = String(right || "");
    const avail = Math.max(1, MAX - r.length);
    const trimmed = l.length > avail ? `${l.slice(0, avail - 1)}.` : l;
    const spaces = Math.max(1, MAX - trimmed.length - r.length);
    return `${trimmed}${repeat(" ", spaces)}${r}`;
  };
  const fmt = (v: number) => `$${Number(v || 0).toFixed(2)}`;

  const d = new Date(sale.createdAt);
  const dateStr = d.toLocaleDateString("es-AR");
  const timeStr = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const sellerLabel = String(sale.sellerName || "N/A").toUpperCase();
  const paymentLabel = String(sale.paymentMethod || "EFECTIVO").toUpperCase();
  const docLabel = String(sale.invoiceType || "Factura B");

  const lines: string[] = [];
  if (config.businessName) lines.push(center(config.businessName));
  if (config.addressLine) lines.push(center(config.addressLine));
  if (config.cityLine) lines.push(center(config.cityLine));
  lines.push(repeat("-", separatorLength));
  lines.push(center("** REIMPRESION **"));
  lines.push(repeat("-", separatorLength));
  if (config.includeComprobante) lines.push(leftRight("Comprobante", docLabel));
  if (config.includeTicketNumber) lines.push(leftRight("Ticket", String(sale.saleNumber)));
  if (config.includeDate) lines.push(leftRight("Fecha", dateStr));
  if (config.includeTime) lines.push(leftRight("Hora", timeStr));
  if (config.includeSeller) lines.push(leftRight("Vendedor", sellerLabel.slice(0, 16)));
  lines.push(repeat("-", separatorLength));
  if (config.includeClient) {
    lines.push(`Cliente: ${String(sale.customerName).slice(0, MAX - 9)}`);
    lines.push(repeat("-", separatorLength));
  }

  const totalQty = sale.items.reduce((s, i) => s + Number(i.qty || 0), 0);
  sale.items.forEach((item, idx) => {
    lines.push(`[ ] ${Number(item.qty || 0)} ${String(item.name || "").toUpperCase()} · ${fmt(item.unitPrice)}`);
    if (config.includeItemSeparators && idx < sale.items.length - 1) {
      lines.push(repeat(".", Math.min(MAX, 20)));
    }
  });

  lines.push(repeat("-", separatorLength));
  lines.push(`Total: ${fmt(sale.totalAmount)}`);
  lines.push(`Cantidad total: ${totalQty}`);
  if (config.includePaymentDetail) lines.push(leftRight("Pago", paymentLabel));

  const customLines = Array.isArray(config.customLines) ? config.customLines : [];
  if (customLines.length) {
    lines.push(repeat("-", separatorLength));
    customLines.forEach((line) => {
      const rendered = String(line || "").slice(0, MAX);
      if (rendered) lines.push(rendered);
    });
  }

  lines.push(repeat("-", separatorLength));
  if (config.footerText) lines.push(center(config.footerText));
  lines.push("");
  lines.push("");
  lines.push("");
  return lines;
};

const sendToPrinter = async (
  lines: string[],
  deviceName: string | undefined,
  config: TicketConfig
): Promise<void> => {
  const fontSize = Math.min(32, Math.max(9, Number(config.fontSize || 15)));
  const paperWidthMm = getTicketPaperWidthMm(config);
  const logoDataUrl = String(config.logoDataUrl || "");

  const canUseElectron =
    typeof window !== "undefined" &&
    (window as any).desktopEnv &&
    typeof (window as any).desktopEnv.printTicket === "function";

  if (canUseElectron) {
    try {
      await (window as any).desktopEnv.printTicket({
        ticket: { lines, logoDataUrl, fontSize, paperWidthMm },
        deviceName,
      });
      return;
    } catch (err: any) {
      if (!/No handler registered for 'ticket:print'/i.test(String(err?.message || ""))) throw err;
    }
  }

  const w = window.open("", "_blank", "width=420,height=900");
  if (!w) throw new Error("No se pudo abrir ventana de impresion");
  w.document.write(`<html><head><title>Ticket</title><style>
    @page{size:${paperWidthMm}mm auto;margin:0}
    html,body{margin:0;padding:0;width:${paperWidthMm}mm;background:#fff;color:#000;box-sizing:border-box;overflow:hidden}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:${fontSize}px;line-height:1.18;font-weight:600;padding:2mm 4mm 2mm 6mm;box-sizing:border-box}
    .line{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:0 0 0.55mm}
    </style></head><body>
    ${logoDataUrl ? `<div style="text-align:center;margin-bottom:1.8mm"><img style="max-width:24mm;max-height:12mm;filter:grayscale(1) contrast(1.35)" src="${logoDataUrl}" alt="" /></div>` : ""}
    ${lines.map((l) => `<div class="line">${String(l).replace(/</g, "&lt;").trim() || "&nbsp;"}</div>`).join("")}
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
  w.close();
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

  // Reprint state
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintLoading, setReprintLoading] = useState(false);
  const [reprintLines, setReprintLines] = useState<string[]>([]);
  const [reprintPrinters, setReprintPrinters] = useState<any[]>([]);
  const [reprintSelectedPrinter, setReprintSelectedPrinter] = useState("");

  // Refs always current — avoids stale closures in keyboard handlers
  const reprintSelectedPrinterRef = useRef("");
  reprintSelectedPrinterRef.current = reprintSelectedPrinter;
  const reprintLinesRef = useRef<string[]>([]);
  reprintLinesRef.current = reprintLines;

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

  // Keyboard shortcuts for the reprint modal (Y = confirmar, N/Escape = cancelar)
  useEffect(() => {
    if (!showReprintModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = String((e.target as HTMLElement)?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = String(e.key || "").toLowerCase();
      if (key === "y") {
        e.preventDefault();
        setShowReprintModal(false);
        const config = loadTicketConfig();
        sendToPrinter(
          reprintLinesRef.current,
          reprintSelectedPrinterRef.current || undefined,
          config
        ).catch(() => setErrorMessage("No se pudo imprimir el comprobante"));
      } else if (key === "n" || key === "escape") {
        e.preventDefault();
        setShowReprintModal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showReprintModal]);

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

  const handleReprint = async (venta: Venta) => {
    if (reprintLoading) return;
    setReprintLoading(true);
    setErrorMessage("");
    try {
      const config = loadTicketConfig();
      const { data } = await api.get(`/sales/${venta.id}`);
      const items = Array.isArray(data?.items)
        ? (data.items as any[]).map((item) => ({
            name: String(item.product_name || ""),
            qty: Number(item.qty || 0),
            unitPrice: Number(item.unit_price || 0),
          }))
        : [];

      const saleDetail: ReprintSaleDetail = {
        saleNumber: String(data?.sale_number || venta.saleNumber || ""),
        customerName: String(
          data?.customer_name_snapshot || data?.customer_name || venta.cliente || "CONSUMIDOR FINAL"
        ),
        sellerName: String(data?.created_by_name || venta.vendedor || ""),
        invoiceType: String(data?.invoice_type || "Factura B"),
        paymentMethod: String(data?.payment_method || venta.metodoPago || "EFECTIVO"),
        createdAt: String(data?.created_at || venta.fecha || new Date().toISOString()),
        items,
        totalAmount: Number(data?.total_amount || venta.total || 0),
      };

      const lines = buildReprintLines(saleDetail, config);
      setReprintLines(lines);

      let printers: any[] = [];
      let defaultPrinter = "";
      try {
        const printerApi = (window as any)?.desktopEnv?.listPrinters;
        if (typeof printerApi === "function") {
          printers = (await printerApi()) || [];
          const xp58 = printers.find((p: any) =>
            /xp-?58/i.test(String(p.name || p.displayName || ""))
          );
          defaultPrinter = xp58?.name || printers[0]?.name || "";
        }
      } catch {
        /* ignore — will use system default */
      }

      setReprintPrinters(printers);
      setReprintSelectedPrinter(defaultPrinter);
      setShowReprintModal(true);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || "No se pudo cargar la venta para reimprimir"
      );
    } finally {
      setReprintLoading(false);
    }
  };

  const confirmReprint = () => {
    const config = loadTicketConfig();
    const lines = reprintLinesRef.current;
    const deviceName = reprintSelectedPrinterRef.current || undefined;
    setShowReprintModal(false);
    sendToPrinter(lines, deviceName, config).catch(() =>
      setErrorMessage("No se pudo imprimir el comprobante")
    );
  };

  return (
    <div className="h-full flex flex-col space-y-4 text-zinc-900 animate-in fade-in duration-300">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shrink-0 shadow-sm">
        <h2 className="mb-4 text-xl font-black uppercase tracking-widest text-[#e85d04]">Auditoria de Ventas</h2>
        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {errorMessage}
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-500">Desde</label>
            <input
              type="date"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-bold text-zinc-900 outline-none transition-colors focus:border-[#e85d04]"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-500">Hasta</label>
            <input
              type="date"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-bold text-zinc-900 outline-none transition-colors focus:border-[#e85d04]"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-500">Vendedor / Chofer</label>
            <select
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-bold uppercase text-zinc-900 outline-none transition-colors focus:border-[#e85d04]"
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
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-500">Buscar Cliente</label>
            <input
              type="text"
              placeholder="Razon Social..."
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-bold uppercase text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#e85d04]"
              value={clienteFilter}
              onChange={(e) => setClienteFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-950 text-[10px] font-black uppercase text-zinc-400 shadow-sm">
              <tr>
                <th className="w-28 border-r border-zinc-800 p-4 text-left tracking-widest">Nro Venta</th>
                <th className="w-36 border-r border-zinc-800 p-4 text-left">Fecha / Hora</th>
                <th className="border-r border-zinc-800 p-4 text-left">Cliente</th>
                <th className="w-32 border-r border-zinc-800 p-4 text-left">Vendedor</th>
                <th className="w-32 border-r border-zinc-800 p-4 text-right">Monto Total</th>
                <th className="w-36 border-r border-zinc-800 p-4 text-center">Metodo Pago</th>
                <th className="w-32 border-r border-zinc-800 p-4 text-center">Estado</th>
                <th className="p-4 text-center w-36">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center font-bold uppercase tracking-widest text-zinc-500">
                    {loading ? "Cargando ventas..." : "Ninguna venta encontrada para estos filtros"}
                  </td>
                </tr>
              ) : (
                ventas.map((venta, idx) => (
                  <tr key={venta.id} className={`border-b border-zinc-200 transition-colors hover:bg-[#f7f7f8] ${idx % 2 === 0 ? "bg-zinc-50/80" : "bg-white"}`}>
                    <td className="border-r border-zinc-200 p-4 font-mono text-xs font-bold text-zinc-600">#{venta.saleNumber || venta.id.slice(0, 8)}</td>
                    <td className="border-r border-zinc-200 p-4 font-mono text-xs text-zinc-500">
                      {new Date(venta.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="max-w-[200px] border-r border-zinc-200 p-4 font-bold uppercase text-zinc-900 truncate">{venta.cliente}</td>
                    <td className="border-r border-zinc-200 p-4 text-xs font-bold uppercase text-zinc-600">{venta.vendedor}</td>
                    <td className="border-r border-zinc-200 p-4 text-right text-base font-black text-emerald-600">${venta.total.toLocaleString("es-AR")}</td>
                    <td className="border-r border-zinc-200 p-4 text-center">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                        venta.metodoPago === "EFECTIVO"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : venta.metodoPago === "TRANSFERENCIA"
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-violet-200 bg-violet-50 text-violet-700"
                      }`}>
                        {venta.metodoPago}
                      </span>
                    </td>
                    <td className="border-r border-zinc-200 p-4 text-center">
                      <span className={`inline-flex rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                        venta.estado === "ANULADO"
                          ? "bg-rose-100 text-rose-700"
                          : venta.estado === "ENTREGADO"
                          ? "bg-emerald-100 text-emerald-700"
                          : venta.estado === "RECHAZADO" || venta.estado === "NO_ESTABA"
                          ? "bg-orange-100 text-orange-700"
                          : venta.estado === "CARGADO"
                          ? "bg-sky-100 text-sky-700"
                          : venta.estado === "PREPARADO"
                          ? "bg-violet-100 text-violet-700"
                          : venta.estado === "PENDIENTE"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-zinc-100 text-zinc-700"
                      }`}>
                        {venta.estado}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-2">
                        {/* Ver comprobante de transferencia */}
                        {(venta.metodoPago === "TRANSFERENCIA" || venta.metodoPago === "MIXTO" || Boolean(venta.comprobanteUrl)) ? (
                          <button
                            title="Ver Comprobante"
                            onClick={() => setSelectedReceipt(venta.comprobanteUrl || "")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-[10px] font-black text-zinc-700 shadow-sm transition-all hover:border-sky-500 hover:bg-sky-600 hover:text-white"
                          >
                            <span>OJO</span>
                          </button>
                        ) : (
                          <div className="w-8 h-8" />
                        )}

                        {/* Reimprimir boleta */}
                        {venta.estado !== "ANULADO" && venta.estado !== "PENDIENTE" ? (
                          <button
                            title="Reimprimir boleta"
                            disabled={reprintLoading}
                            onClick={() => handleReprint(venta)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 shadow-sm transition-all hover:border-amber-500 hover:bg-amber-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 6 2 18 2 18 9" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <rect x="6" y="14" width="12" height="8" />
                            </svg>
                          </button>
                        ) : (
                          <div className="w-8 h-8" />
                        )}

                        {/* Anular venta */}
                        {venta.estado !== "ANULADO" ? (
                          <button
                            title="Anular Venta"
                            onClick={() => handleAnular(venta.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-lg font-black text-zinc-700 shadow-sm transition-all hover:border-rose-500 hover:bg-rose-600 hover:text-white"
                          >
                            <span>X</span>
                          </button>
                        ) : (
                          <div className="w-8 h-8" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: comprobante de transferencia */}
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

      {/* Modal: reimpresion de boleta */}
      {showReprintModal ? (
        <PrintPromptModal
          title="Reimprimir boleta"
          lines={reprintLines}
          availablePrinters={reprintPrinters}
          selectedPrinter={reprintSelectedPrinter}
          onPrinterChange={setReprintSelectedPrinter}
          onCancel={() => setShowReprintModal(false)}
          onConfirm={confirmReprint}
        />
      ) : null}

      {/* Modal: anular venta */}
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
