import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type ElectronApi } from "../shared/ipc";
import type { HuntConfig, Settings } from "../types/domain";

const api: ElectronApi = {
  init: () => ipcRenderer.invoke(IPC_CHANNELS.APP_INIT),
  startHunt: (config: HuntConfig) => ipcRenderer.invoke(IPC_CHANNELS.HUNT_START, config),
  stopHunt: () => ipcRenderer.invoke(IPC_CHANNELS.HUNT_STOP),
  resetSession: () => ipcRenderer.invoke(IPC_CHANNELS.HUNT_RESET),
  forceShiny: () => ipcRenderer.invoke(IPC_CHANNELS.HUNT_FORCE_SHINY),
  testNotification: () => ipcRenderer.invoke(IPC_CHANNELS.HUNT_TEST_NOTIFICATION),
  saveSettings: (settings: Settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),
  getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST),
  subscribeState: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload as any);
    ipcRenderer.on(IPC_CHANNELS.STATE_SUBSCRIBE, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATE_SUBSCRIBE, wrapped);
  }
};

contextBridge.exposeInMainWorld("electronApi", api);
