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
    const isReloadShortcut =
      key === "F5" || ((input.control || input.meta) && key === "R");

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

function buildTicketHtml(ticket) {
  const lines = Array.isArray(ticket?.lines) ? ticket.lines : [];
  const logoDataUrl = typeof ticket?.logoDataUrl === "string" ? ticket.logoDataUrl : "";
  const body = lines
    .map((line) => `<div class="line">${escapeHtml(line)}</div>`)
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
    @page { size: 58mm auto; margin: 2mm; }
    html, body { margin: 0; padding: 0; width: 58mm; background: #fff; color: #000; }
    body { font-family: "Courier New", monospace; font-size: 11px; line-height: 1.25; }
    .ticket { width: 54mm; padding: 1mm 0; }
    .logo-wrap { text-align: center; margin: 0 0 2mm; }
    .logo { max-width: 24mm; max-height: 12mm; width: auto; height: auto; filter: grayscale(1) contrast(1.35); image-rendering: crisp-edges; }
    .line { white-space: pre; word-break: break-word; }
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
    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: deviceName || undefined,
          pageSize: { width: 58000, height: 200000 },
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
