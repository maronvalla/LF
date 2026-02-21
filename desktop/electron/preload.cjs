const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopEnv", {
  appName: "DISTRIBUIDORA LA FAMILIA",
  printTicket: (payload) => ipcRenderer.invoke("ticket:print", payload),
  listPrinters: () => ipcRenderer.invoke("ticket:listPrinters"),
});
