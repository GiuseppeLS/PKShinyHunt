import type { GameProfile, HuntConfig, HuntSession, HuntState, Settings } from "../types/domain";

export const IPC_CHANNELS = {
  APP_INIT: "app:init",
  HUNT_START: "hunt:start",
  HUNT_STOP: "hunt:stop",
  HUNT_RESET: "hunt:reset",
  HUNT_FORCE_SHINY: "hunt:forceShiny",
  HUNT_TEST_NOTIFICATION: "hunt:testNotification",
  SETTINGS_SAVE: "settings:save",
  SESSION_LIST: "sessions:list",
  STATE_SUBSCRIBE: "state:subscribe"
} as const;

export interface AppInitPayload {
  settings: Settings;
  profiles: GameProfile[];
  sessions: HuntSession[];
  state: HuntState;
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
}
