const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const isDev = process.env.ELECTRON_DEV === "1";

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    backgroundColor: "#111315",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toUpperCase();
    const isReloadShortcut = (input.control || input.meta) && key === "R";

    if (!isReloadShortcut) return;
    event.preventDefault();
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    return;
  }
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function classifyTicketLine(line) {
  const raw = String(line ?? "");
  const trimmed = raw.trim();
  const leadingSpaces = raw.match(/^\s+/)?.[0]?.length || 0;

  if (!trimmed) return { text: "&nbsp;", className: "spacer" };
  if (/^[-.]{6,}$/.test(trimmed)) return { text: escapeHtml(trimmed), className: "separator" };
  if (/^TOTAL\b/i.test(trimmed)) return { text: escapeHtml(trimmed), className: "total" };
  if (/^\d+\s*x\s*\$/.test(trimmed)) return { text: escapeHtml(trimmed), className: "meta" };
  if (trimmed === "DISTRIBUIDORA LA FAMILIA" || trimmed === "BOLETA DE CONSOLIDADO") return { text: escapeHtml(trimmed), className: "center title" };
  if (leadingSpaces > 0) return { text: escapeHtml(trimmed), className: "center" };
  if (!trimmed.includes(":") && trimmed === trimmed.toUpperCase() && trimmed.length > 6) {
    return { text: escapeHtml(trimmed), className: "item-name" };
  }
  return { text: escapeHtml(trimmed), className: "body" };
}

function buildTicketHtml(ticket) {
  const lines = Array.isArray(ticket?.lines) ? ticket.lines : [];
  const logoDataUrl = typeof ticket?.logoDataUrl === "string" ? ticket.logoDataUrl : "";
  const fontSize = Math.min(32, Math.max(9, Number(ticket?.fontSize || 15) || 15));
  const paperWidthMm = Math.min(80, Math.max(48, Number(ticket?.paperWidthMm || 58) || 58));
  const contentWidthMm = Math.max(42, paperWidthMm - 6);
  const body = lines
    .map((line) => {
      const { text, className } = classifyTicketLine(line);
      return `<div class="line ${className}">${text}</div>`;
    })
    .join("");
  const logo = logoDataUrl
    ? `<div class="logo-wrap"><img class="logo" src="${logoDataUrl}" alt="Logo" /></div>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Ticket</title>
  <style>
    @page { size: ${paperWidthMm}mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${paperWidthMm}mm; background: #fff; color: #000; box-sizing: border-box; overflow: hidden; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: ${fontSize}px; line-height: 1.18; font-weight: 600; padding: 2mm 4mm; box-sizing: border-box; }
    .ticket { width: 100%; padding: 0.8mm 0; }
    .logo-wrap { text-align: center; margin: 0 0 1.8mm; }
    .logo { max-width: 24mm; max-height: 12mm; width: auto; height: auto; filter: grayscale(1) contrast(1.35); image-rendering: crisp-edges; }
    .line { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; margin: 0 0 0.55mm; }
    .line.center { text-align: center; letter-spacing: 0.04em; }
    .line.title { font-weight: 900; font-size: 1.15em; margin-bottom: 0.5mm; }
    .line.separator { text-align: center; letter-spacing: 0.12em; font-size: 0.78em; line-height: 1; color: #444; margin: 0.5mm 0; }
    .line.item-name { font-weight: 700; letter-spacing: 0.02em; margin-top: 0.75mm; }
    .line.meta { font-size: 0.92em; color: #222; margin-top: -0.1mm; }
    .line.total { font-weight: 800; font-size: 1.08em; margin-top: 1mm; }
    .line.spacer { margin: 0; min-height: 1.1mm; }
    .line.body { color: #111; }
  </style>
</head>
<body>
  <div class="ticket">${logo}${body}</div>
</body>
</html>`;
}

ipcMain.handle("ticket:listPrinters", async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name }));
});

ipcMain.handle("ticket:print", async (_, payload) => {
  const ticket = payload?.ticket || payload;
  const deviceName = payload?.deviceName;
  const html = buildTicketHtml(ticket);
  const paperWidthMm = Math.min(80, Math.max(48, Number(ticket?.paperWidthMm || 58) || 58));
  const win = new BrowserWindow({
    show: false,
    width: 420,
    height: 840,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.webContents.setZoomFactor(1);
    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: deviceName || undefined,
          pageSize: { width: Math.round(paperWidthMm * 1000), height: 1000000 },
          margins: { marginType: "none" },
        },
        (success, failureReason) => {
          if (!success) {
            reject(new Error(failureReason || "No se pudo imprimir"));
            return;
          }
          resolve();
        }
      );
    });
    return { ok: true };
  } finally {
    win.destroy();
  }
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
