import type { GameProfile, HuntConfig, HuntSession, HuntState, Settings } from '../types/domain';

export const IPC_CHANNELS = {
  APP_INIT: 'app:init',
  HUNT_START: 'hunt:start',
  HUNT_STOP: 'hunt:stop',
  HUNT_RESET: 'hunt:reset',
  HUNT_FORCE_SHINY: 'hunt:forceShiny',
  HUNT_TEST_NOTIFICATION: 'hunt:testNotification',
  SETTINGS_SAVE: 'settings:save',
  SESSION_LIST: 'sessions:list',
  STATE_SUBSCRIBE: 'state:subscribe',
  EMULATOR_LIST_WINDOWS: 'emulator:listWindows',
  EMULATOR_ATTACH: 'emulator:attach',
  EMULATOR_DETACH: 'emulator:detach',
  EMULATOR_START_PREVIEW: 'emulator:startPreview',
  EMULATOR_STOP_PREVIEW: 'emulator:stopPreview',
  EMULATOR_PREVIEW_FRAME: 'emulator:previewFrame',
  EMULATOR_SAVE_FRAME: 'emulator:saveFrame'
} as const;

export interface AppInitPayload {
  settings: Settings;
  profiles: GameProfile[];
  sessions: HuntSession[];
  state: HuntState;
}

export interface EmulatorWindowInfo {
  id: string;
  title: string;
}

export interface EmulatorPreviewFrame {
  sourceId: string;
  dataUrl: string;
  capturedAt: string;
}

export interface ElectronApi {
  init(): Promise<AppInitPayload>;
  startHunt(config: HuntConfig): Promise<HuntState>;
  stopHunt(): Promise<HuntState>;
  resetSession(): Promise<HuntState>;
  forceShiny(): Promise<HuntState>;
  testNotification(): Promise<void>;
  saveSettings(settings: Settings): Promise<Settings>;
  getSessions(): Promise<HuntSession[]>;
  subscribeState(listener: (state: HuntState) => void): () => void;
  listEmulatorWindows(): Promise<EmulatorWindowInfo[]>;
  attachEmulatorWindow(sourceId: string): Promise<{ attached: boolean; sourceId: string }>;
  detachEmulatorWindow(): Promise<{ attached: boolean }>;
  startEmulatorPreview(): Promise<{ running: boolean }>;
  stopEmulatorPreview(): Promise<{ running: boolean }>;
  saveCurrentPreviewFrame(): Promise<{ saved: boolean; filePath?: string }>;
  subscribeEmulatorPreview(listener: (frame: EmulatorPreviewFrame) => void): () => void;
}
