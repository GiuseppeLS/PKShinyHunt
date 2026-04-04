import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ElectronApi } from '../shared/ipc';
import type { HuntConfig, Settings } from '../types/domain';

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
  },
  listEmulatorWindows: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATOR_LIST_WINDOWS),
  attachEmulatorWindow: (sourceId: string) => ipcRenderer.invoke(IPC_CHANNELS.EMULATOR_ATTACH, sourceId),
  detachEmulatorWindow: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATOR_DETACH),
  startEmulatorPreview: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATOR_START_PREVIEW),
  stopEmulatorPreview: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATOR_STOP_PREVIEW),
  saveCurrentPreviewFrame: () => ipcRenderer.invoke(IPC_CHANNELS.EMULATOR_SAVE_FRAME),
  getCaptureStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_STATUS),
  subscribeEmulatorPreview: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload as any);
    ipcRenderer.on(IPC_CHANNELS.EMULATOR_PREVIEW_FRAME, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EMULATOR_PREVIEW_FRAME, wrapped);
  }
};

contextBridge.exposeInMainWorld('electronApi', api);
