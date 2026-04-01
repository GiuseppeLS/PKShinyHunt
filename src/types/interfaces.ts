import type { EncounterInfo, GameProfile, HuntConfig, HuntSession, Settings, ShinyDetectionResult } from './domain';

export interface EmulatorAdapter {
  id: string;
  name: string;
  start(config: HuntConfig): Promise<void>;
  stop(): Promise<void>;
  onEncounter(listener: (encounter: EncounterInfo) => void): void;
  forceShinyEncounter?(): Promise<EncounterInfo | null>;
}

export interface NotificationProvider {
  id: string;
  isEnabled(settings: Settings): boolean;
  sendShinyAlert(session: HuntSession): Promise<void>;
  sendTestMessage?(): Promise<void>;
}

export interface ScreenshotService {
  capture(sessionId: string, encounterId: string, folder: string): Promise<string>;
}

export interface ShinyDetector {
  detect(encounter: EncounterInfo): ShinyDetectionResult;
}

export interface SessionRepository {
  saveSession(session: HuntSession): Promise<void>;
  listSessions(): Promise<HuntSession[]>;
}

export interface SettingsRepository {
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

export interface GameProfileRepository {
  listProfiles(): Promise<GameProfile[]>;
}

