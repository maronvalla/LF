const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktopEnv", {
  appName: "DISTRIBUIDORA LA FAMILIA",
});

