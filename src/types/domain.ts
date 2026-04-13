export type HuntStatus =
  | 'idle'
  | 'attached'
  | 'searching'
  | 'encounter_start'
  | 'battle_ready'
  | 'evaluating_pokemon'
  | 'running_from_battle'
  | 'recovering'
  | 'shiny_found'
  | 'paused'
  | 'error';
export type HuntMode = 'random_encounters' | 'soft_reset' | 'static_encounter';

export interface EncounterInfo {
  id: string;
  timestamp: string;
  pokemonName: string;
  level?: number;
  encounterType: HuntMode;
  isShinyCandidate?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ShinyDetectionResult {
  isShiny: boolean;
  confidence: number;
  reason: string;
}

export interface GameProfile {
  id: string;
  name: string;
  game: string;
  generation: number;
  notes?: string;
}

export interface HuntConfig {
  targetPokemon: string;
  gameProfileId: string;
  huntMode: HuntMode;
  emulatorAdapterId: string;
  saveScreenshots: boolean;
  autoPauseOnShiny: boolean;
  enableDiscordNotifications: boolean;
  screenshotFolder: string;
  enableAutoMovement?: boolean;
  movementPattern?: 'left_right' | 'up_down';
  movementKeyHoldMs?: number;
  movementStepMs?: number;
  movementIntervalMs?: number;
  movementResumeCooldownMs?: number;
}

export interface HuntSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  config: HuntConfig;
  encounterCount: number;
  status: HuntStatus;
  shinyFound: boolean;
  shinyEncounter?: EncounterInfo;
  screenshotPath?: string;
  errorMessage?: string;
}

export interface Settings {
  discordWebhookUrl: string;
  screenshotFolder: string;
  defaultGameProfileId: string;
  autoPauseOnShiny: boolean;
  saveScreenshots: boolean;
  bizhawk?: {
    bizhawkExePath: string;
    emeraldRomPath: string;
    tcpHost: string;
    tcpPort: number;
    autoLaunchBizHawk: boolean;
    autoAttachBizHawk: boolean;
  };
}

export interface HuntState {
  status: HuntStatus;
  activeSession: HuntSession | null;
  elapsedMs: number;
  statusSince?: string;
  lastEncounter?: EncounterInfo;
  lastSpeciesId?: number | null;
  lastSpeciesName?: string | null;
  lastShinyResult?: boolean | null;
  lastError?: string | null;
  movementActive?: boolean;
  stateSource?: string | null;
}