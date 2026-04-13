export type NormalizedGameMode = 'OVERWORLD' | 'BATTLE' | 'MENU' | 'LOADING' | 'UNKNOWN';
export type BattleKind = 'wild' | 'trainer' | 'unknown';
export type EncounterLifecycle = 'encounter_started' | 'encounter_active' | 'encounter_ended';

export interface NormalizedGameState {
  source: 'bizhawk';
  connected: boolean;
  game: {
    title: 'Pokemon Emerald';
    platform: 'gba';
  };
  mode: NormalizedGameMode;
  battle: {
    active: boolean;
    kind: BattleKind;
  };
  encounter: {
    active: boolean;
    lifecycle: EncounterLifecycle | null;
    species: string | null;
    level: number | null;
    hp: number | null;
    maxHp: number | null;
    pid: number | null;
    shiny: boolean;
    confidence: number;
  };
  timestamp: number;
  raw?: Record<string, unknown>;
}

export interface BizHawkEmeraldRawState {
  version: number;
  source: 'bizhawk-lua';
  game: 'Pokemon Emerald';
  platform: 'gba';
  connected: boolean;
  frame: number;
  timestamp: number;
  flags?: {
    inBattle?: boolean | null;
    menuOpen?: boolean | null;
    loading?: boolean | null;
  };
  battle?: {
    typeFlags?: number | null;
    isTrainerBattle?: boolean | null;
  };
  encounter?: {
    speciesId?: number | null;
    level?: number | null;
    hp?: number | null;
    maxHp?: number | null;
    pid?: number | null;
    shiny?: boolean | null;
  };
  addressMeta?: Record<string, string>;
}

export const EMPTY_GAME_STATE: NormalizedGameState = {
  source: 'bizhawk',
  connected: false,
  game: {
    title: 'Pokemon Emerald',
    platform: 'gba'
  },
  mode: 'UNKNOWN',
  battle: {
    active: false,
    kind: 'unknown'
  },
  encounter: {
    active: false,
    lifecycle: null,
    species: null,
    level: null,
    hp: null,
    maxHp: null,
    pid: null,
    shiny: false,
    confidence: 0
  },
  timestamp: 0
};