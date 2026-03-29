import type { HuntConfig, HuntSession } from "./types";

const SETTINGS_KEY = "pksha.settings.v1";
const SESSIONS_KEY = "pksha.sessions.v1";

export const defaultConfig: HuntConfig = {
  targetPokemon: "Ralts",
  gameProfile: "ORAS Starters",
  huntMode: "random_encounters",
  saveScreenshots: true,
  autoPauseOnShiny: true,
  discordEnabled: false,
  discordWebhookUrl: "",
  autoFleeNonShiny: true,
  encounterIntervalMs: 1200,
  shinyChance: 512,
};

export function loadConfig(): HuntConfig {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultConfig;
    return { ...defaultConfig, ...(JSON.parse(raw) as Partial<HuntConfig>) };
  } catch {
    return defaultConfig;
  }
}

export function saveConfig(config: HuntConfig) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
}

export function loadSessions(): HuntSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HuntSession[];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: HuntSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}