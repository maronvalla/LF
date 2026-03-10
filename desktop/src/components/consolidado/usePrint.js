import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_TICKET_CONFIG,
  getTicketContentWidthMm,
  getTicketMaxChars,
  getTicketPaperWidthMm,
  loadTicketConfig,
} from "../../utils/ticketConfig";
import { sanitizeTicketAddress, wrapTicketText } from "./utils";

function renderTicketLinesHtml(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const raw = String(line || "");
      const sepIdx = raw.indexOf("\x1e");
      if (sepIdx >= 0) {
        const left = raw.slice(0, sepIdx).replace(/</g, "&lt;");
        const right = raw.slice(sepIdx + 1).replace(/</g, "&lt;");
        return `<div class="line lr"><span>${left}</span><span>${right}</span></div>`;
      }
      const isCenter = raw.match(/^\s+/) !== null;
      const text = raw.replace(/</g, "&lt;").trim() || "&nbsp;";
      let cls = "line";
      if (text === "DISTRIBUIDORA LA FAMILIA" || text === "BOLETA DE CONSOLIDADO") cls += " title";
      else if (isCenter) cls += " center";
      return `<div class="${cls}">${text}</div>`;
    })
    .join("");
}

export function usePrint({
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
}) {
  const [ticketConfig, setTicketConfig] = useState(DEFAULT_TICKET_CONFIG);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printPreviewLines, setPrintPreviewLines] = useState([]);
  const [printPromptTitle, setPrintPromptTitle] = useState("Imprimir boleta consolidado");
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const printPromptResolverRef = useRef(null);

  useEffect(() => {
    setTicketConfig(loadTicketConfig());
  }, []);

  useEffect(() => {
    return () => {
      if (printPromptResolverRef.current) {
        printPromptResolverRef.current(false);
        printPromptResolverRef.current = null;
      }
    };
  }, []);

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

  const askPrintConfirmation = ({ lines, title }) =>
    new Promise(async (resolve) => {
      printPromptResolverRef.current = resolve;
      setPrintPreviewLines(Array.isArray(lines) ? lines : []);
      setPrintPromptTitle(String(title || "").trim() || "Imprimir boleta consolidado");
      try {
        const printerApi = window?.desktopEnv?.listPrinters;
        if (typeof printerApi === "function") {
          const printers = (await printerApi()) || [];
          setAvailablePrinters(printers);
          const xp58 = printers.find((p) =>
            /xp-?58/i.test(String(p.name || p.displayName || ""))
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
      resolver({ shouldPrint: Boolean(value), deviceName: selectedPrinter || undefined });
    }
  };

  const printReceipt = async ({ lines, deviceName }) => {
    const ticket = {
      lines: Array.isArray(lines) ? lines : [],
      logoDataUrl: ticketConfig.logoDataUrl || "",
      fontSize: Number(ticketConfig.fontSize || 15),
      paperWidthMm: getTicketPaperWidthMm(ticketConfig),
      contentWidthMm: getTicketContentWidthMm(ticketConfig),
      marginLeftMm: Number(ticketConfig.marginLeftMm ?? 3) || 3,
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
        if (!/No handler registered for 'ticket:print'/i.test(msg)) throw err;
      }
    }

    const printable = window.open("", "_blank", "width=420,height=900");
    if (!printable) throw new Error("No se pudo abrir ventana de impresion");
    printable.document.write(`
      <html><head><title>Boleta consolidado</title><style>
      @page { size: ${getTicketPaperWidthMm(ticketConfig)}mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; width: ${getTicketPaperWidthMm(ticketConfig)}mm; background: #fff; color: #000; box-sizing: border-box; overflow: hidden; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: ${Math.min(32, Math.max(9, Number(ticketConfig.fontSize || 15) || 15))}px; line-height: 1.18; font-weight: 600; padding: 1.6mm ${Number(ticketConfig.marginLeftMm ?? 3) || 3}mm 2mm ${Number(ticketConfig.marginLeftMm ?? 3) || 3}mm; box-sizing: border-box; }
      .ticket { width: ${getTicketContentWidthMm(ticketConfig)}mm; max-width: ${getTicketContentWidthMm(ticketConfig)}mm; padding: 0.8mm 0 0.4mm; box-sizing: border-box; overflow: hidden; }
      .logo-wrap { text-align: center; margin-bottom: 1.8mm; }
      .logo { max-width: 24mm; max-height: 12mm; width: auto; height: auto; filter: grayscale(1) contrast(1.35); }
      .line { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; margin: 0 0 0.55mm; }
      .line.lr { display:flex; justify-content:space-between; gap:1mm; white-space:nowrap; overflow:hidden; }
      .line.center { text-align: center; }
      .line.title { font-weight: 900; font-size: 1.15em; text-align: center; margin-bottom: 0.5mm; }
      </style></head><body>
      <div class="ticket">
      ${ticket.logoDataUrl ? `<div class="logo-wrap"><img class="logo" src="${ticket.logoDataUrl}" alt="Logo" /></div>` : ""}
      ${renderTicketLinesHtml(ticket.lines)}
      </div>
      </body></html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
    printable.close();
  };

  const buildConsolidatedTicketLines = () => {
    const MAX = getTicketMaxChars(ticketConfig);
    const repeat = (char, len) => new Array(Math.max(0, len) + 1).join(char);
    const center = (text) => {
      const t = String(text || "").slice(0, MAX);
      const left = Math.max(0, Math.floor((MAX - t.length) / 2));
      return `${repeat(" ", left)}${t}`;
    };
    const leftRight = (left, right) => `${String(left || "")}\x1e${String(right || "")}`;
    const fmt = (v) => `$${Number(v || 0).toFixed(2)}`;
    const now = new Date();
    const shiftLabel = slot === "19" ? "TARDE 19:00" : "MANANA 11:00";
    const lines = [];
    if (ticketConfig.businessName) lines.push(center(ticketConfig.businessName));
    if (ticketConfig.addressLine) lines.push(center(ticketConfig.addressLine));
    lines.push(center("BOLETA DE CONSOLIDADO"));
    lines.push(repeat("-", MAX));
    lines.push(leftRight("Fecha", now.toLocaleDateString("es-AR")));
    lines.push(
      leftRight(
        "Hora",
        now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
      )
    );
    lines.push(leftRight("Turno", shiftLabel));
    lines.push(leftRight("Pedidos", String(pedidosEnvio.length)));
    lines.push(leftRight("Bultos", String(totalBultos)));
    lines.push(leftRight("Envases", String(totalEnvasesRetornables)));
    lines.push(leftRight("Efectivo chofer", fmt(totalCashExpectedFromDriver)));
    lines.push(repeat("-", MAX));
    lines.push("MERCADERIA A SACAR");
    lines.push(repeat("-", MAX));
    consolidatedSections.forEach((section) => {
      lines.push(String(section.label || "SIN RUBRO").toUpperCase().slice(0, MAX));
      lines.push(repeat(".", Math.min(MAX, 20)));
      section.items.forEach((row) => {
        lines.push(String(row.name || "").toUpperCase().slice(0, MAX));
        lines.push(leftRight("Cant", `${Number(row.total_qty || 0)}`));
        const plan = pickPlanByProduct[row.product_id] || {
          localQty: 0,
          galponQty: Number(row.total_qty || 0),
        };
        lines.push(
          leftRight(
            "Local/Galpon",
            `${Number(plan.localQty || 0)}/${Number(plan.galponQty || 0)}`
          )
        );
        if (Number(row.total_returnable_units || 0) > 0) {
          lines.push(leftRight("Envases", `${Number(row.total_returnable_units || 0)}`));
        }
        lines.push(repeat("-", MAX));
      });
    });
    if (rejectedReturnSections.length) {
      lines.push("DEVOLUCIONES POR RECHAZO");
      lines.push(repeat("-", MAX));
      rejectedReturnSections.forEach((section) => {
        lines.push(String(section.label || "SIN RUBRO").toUpperCase().slice(0, MAX));
        lines.push(repeat(".", Math.min(MAX, 20)));
        section.items.forEach((row) => {
          lines.push(String(row.name || "").toUpperCase().slice(0, MAX));
          lines.push(leftRight("Dev.", `${Number(row.qty_to_return || 0)}`));
        });
        lines.push(repeat("-", MAX));
      });
    }
    lines.push(center("Control: ____ / Chofer: ____"));
    lines.push("");
    lines.push("");
    return lines;
  };

  const buildOrderTicketLines = (sale) => {
    const MAX = getTicketMaxChars(ticketConfig);
    const size = Number(ticketConfig.fontSize || 15);
    const separatorLength =
      size >= 30 ? Math.min(MAX, 12)
      : size >= 26 ? Math.min(MAX, 14)
      : size >= 22 ? Math.min(MAX, 18)
      : size >= 18 ? Math.min(MAX, 24)
      : MAX;
    const repeat = (char, len) => new Array(Math.max(0, len) + 1).join(char);
    const center = (text) => {
      const t = String(text || "").slice(0, MAX);
      const left = Math.max(0, Math.floor((MAX - t.length) / 2));
      return `${repeat(" ", left)}${t}`;
    };
    const leftRight = (left, right) => `${String(left || "")}\x1e${String(right || "")}`;
    const toNumber = (value) => {
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      const raw = String(value ?? "")
        .trim()
        .replace(/\s+/g, "")
        .replace(/[^0-9,.-]/g, "");
      if (!raw) return 0;
      const lastDot = raw.lastIndexOf(".");
      const lastComma = raw.lastIndexOf(",");
      const sepIndex = Math.max(lastDot, lastComma);
      if (sepIndex >= 0) {
        const intPart = raw.slice(0, sepIndex).replace(/[.,]/g, "");
        const decPart = raw.slice(sepIndex + 1).replace(/[.,]/g, "");
        const normalized = `${intPart || "0"}.${decPart || "0"}`;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      const parsed = Number(raw.replace(/[.,]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const fmt = (v) => `$${toNumber(v).toFixed(2)}`;

    const d = new Date(
      String(sale.created_at || sale.scheduled_date || new Date().toISOString())
    );
    const dateStr = d.toLocaleDateString("es-AR");
    const timeStr = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const sellerLabel = String(
      sale.created_by_name || sale.created_by_username || "N/A"
    ).toUpperCase();
    const paymentLabel = String(
      sale.delivery_final_payment_method ||
        sale.payment_method ||
        sale.delivery_payment_method ||
        "EFECTIVO"
    ).toUpperCase();
    const docLabel = String(sale.invoice_type || "Factura B");
    const items = Array.isArray(sale.items) ? sale.items : [];

    const lines = [];
    if (ticketConfig.businessName) lines.push(center(ticketConfig.businessName));
    if (ticketConfig.addressLine) lines.push(center(ticketConfig.addressLine));
    if (ticketConfig.cityLine) lines.push(center(ticketConfig.cityLine));
    lines.push(repeat("-", separatorLength));
    if (ticketConfig.includeComprobante) lines.push(leftRight("Comprobante", docLabel));
    if (ticketConfig.includeTicketNumber) lines.push(leftRight("Ticket", String(sale.sale_number || "")));
    if (ticketConfig.includeDate) lines.push(leftRight("Fecha", dateStr));
    if (ticketConfig.includeTime) lines.push(leftRight("Hora", timeStr));
    if (ticketConfig.includeSeller) lines.push(leftRight("Vendedor", sellerLabel.slice(0, 16)));
    lines.push(repeat("-", separatorLength));
    if (ticketConfig.includeClient) {
      lines.push(`Cliente: ${String(sale.customer_name || "CONSUMIDOR FINAL").slice(0, MAX - 9)}`);
      const deliveryAddress = sanitizeTicketAddress(sale.delivery_address);
      if (deliveryAddress) lines.push(...wrapTicketText(deliveryAddress, MAX, "Dir: "));
      const customerZone = String(sale.customer_zone || "").trim();
      if (customerZone) lines.push(...wrapTicketText(customerZone, MAX, "Zona: "));
      lines.push(repeat("-", separatorLength));
    }

    let totalQty = 0;
    let totalAmount = 0;
    items.forEach((item, idx) => {
      const qty = toNumber(item.qty ?? item.quantity ?? 0);
      const unitPrice = toNumber(item.unit_price ?? item.unitPrice ?? 0);
      const explicitLineTotal = toNumber(item.line_total ?? item.lineTotal ?? 0);
      const lineTotal = explicitLineTotal > 0 ? explicitLineTotal : qty * unitPrice;
      totalQty += qty;
      totalAmount += lineTotal;
      lines.push(String(item.product_name || item.productName || "").toUpperCase());
      lines.push(leftRight(`${qty} x ${fmt(unitPrice)}`, fmt(lineTotal)));
      if (ticketConfig.includeItemSeparators && idx < items.length - 1) {
        lines.push(repeat(".", Math.min(MAX, 20)));
      }
    });
    if (totalAmount <= 0) {
      totalAmount = toNumber(sale.total_amount ?? sale.sale_total ?? sale.total ?? 0);
    }

    lines.push(repeat("-", separatorLength));
    lines.push(`Total: ${fmt(totalAmount)}`);
    lines.push(`Cantidad total: ${totalQty}`);
    if (ticketConfig.includePaymentDetail) lines.push(leftRight("Pago", paymentLabel));

    const customLines = Array.isArray(ticketConfig.customLines) ? ticketConfig.customLines : [];
    if (customLines.length) {
      lines.push(repeat("-", separatorLength));
      customLines.forEach((line) => {
        const rendered = String(line || "").slice(0, MAX);
        if (rendered) lines.push(rendered);
      });
    }

    lines.push(repeat("-", separatorLength));
    if (ticketConfig.footerText) lines.push(center(ticketConfig.footerText));
    lines.push("");
    lines.push("");
    return lines;
  };

  const printConsolidated = async () => {
    const lines = buildConsolidatedTicketLines();
    const decision = await askPrintConfirmation({ lines, title: "Imprimir boleta consolidado" });
    if (!decision?.shouldPrint) return;
    try {
      await printReceipt({ lines, deviceName: decision?.deviceName });
      setToast?.({ message: "Boleta de consolidado impresa", type: "success" });
    } catch (err) {
      setToast?.({ message: err?.message || "No se pudo imprimir boleta", type: "error" });
    }
  };

  const printAllDeliveryOrders = async () => {
    const printableOrders = pedidosEnvio.filter(
      (o) => String(o.delivery_status || "").toUpperCase() !== "ANULADO"
    );
    if (!printableOrders.length) {
      setToast?.({ message: "No hay ordenes de envio para reimprimir", type: "error" });
      return;
    }

    try {
      const previewLines = printableOrders.flatMap((order, idx) => {
        const orderLines = buildOrderTicketLines(order);
        return idx < printableOrders.length - 1
          ? [...orderLines, "", "- - - - - - - - - - - - - -", ""]
          : orderLines;
      });
      const decision = await askPrintConfirmation({
        lines: previewLines,
        title: `Reimprimir ${printableOrders.length} orden${printableOrders.length !== 1 ? "es" : ""}`,
      });
      if (!decision?.shouldPrint) return;

      let printed = 0;
      for (const order of printableOrders) {
        const lines = buildOrderTicketLines(order);
        await printReceipt({ lines, deviceName: decision?.deviceName });
        printed += 1;
      }
      setToast?.({ message: `Ordenes de envio reimpresas: ${printed}`, type: "success" });
    } catch (err) {
      setToast?.({
        message: err?.response?.data?.message || "No se pudieron reimprimir las ordenes",
        type: "error",
      });
    }
  };

  const printPurchaseSuggestionPdf = () => {
    if (!purchaseSuggestionItems.length) {
      setToast?.({ message: "No hay sugerencias de pedido para imprimir", type: "error" });
      return;
    }

    const printable = window.open("", "_blank", "width=1100,height=900");
    if (!printable) {
      setToast?.({ message: "No se pudo abrir la vista de impresion", type: "error" });
      return;
    }

    const rows = purchaseSuggestionItems
      .map(
        (item) => `
          <tr>
            <td>${item.sku || "-"}</td>
            <td>${String(item.name || "")}</td>
            <td>${Number(item.minStock || 0)}</td>
            <td>${Number(item.existingStock || 0)}</td>
            <td>${Number(item.qtyToOrder || 0)}</td>
            <td>$${Number(item.unitCost || 0).toFixed(2)}</td>
            <td>$${Number(item.lineTotalCost || 0).toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    printable.document.write(`
      <html>
        <head>
          <title>Pedido sugerido por stock critico</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { margin: 0 0 6px; font-size: 24px; }
            .meta { margin-bottom: 18px; color: #4b5563; font-size: 13px; }
            .totals { margin: 0 0 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
            th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
            tfoot td { font-weight: 700; background: #f9fafb; }
          </style>
        </head>
        <body>
          <h1>Pedido sugerido por stock critico</h1>
          <div class="meta">Fecha: ${date} | Turno: ${slot === "11" ? "11:00" : "19:00"}</div>
          <div class="totals">Productos a pedir: ${purchaseSuggestion.totalItems} | Total compra estimada: $${Number(purchaseSuggestion.totalCost || 0).toFixed(2)}</div>
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Descripcion</th>
                <th>Stock minimo</th>
                <th>Stock actual</th>
                <th>Pedido</th>
                <th>Costo unit.</th>
                <th>Total pedido</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="6">Total compra</td>
                <td>$${Number(purchaseSuggestion.totalCost || 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
  };

  return {
    ticketConfig,
    showPrintPrompt,
    printPreviewLines,
    printPromptTitle,
    availablePrinters,
    selectedPrinter,
    setSelectedPrinter,
    resolvePrintConfirmation,
    printConsolidated,
    printAllDeliveryOrders,
    printPurchaseSuggestionPdf,
  };
}
