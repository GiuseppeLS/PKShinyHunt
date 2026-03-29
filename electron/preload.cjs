const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApi", {
  createScreenshot: (sessionId) => ipcRenderer.invoke("screenshot:create", sessionId),
  sendShinyDiscord: (payload) => ipcRenderer.invoke("discord:sendShiny", payload),
});