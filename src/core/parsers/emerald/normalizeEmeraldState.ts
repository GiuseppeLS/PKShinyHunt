import { EMPTY_GAME_STATE, type BizHawkEmeraldRawState, type NormalizedGameState } from '../../GameState';
import { resolveEmeraldSpecies } from './species';

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function deriveMode(raw: BizHawkEmeraldRawState): NormalizedGameState['mode'] {
  if (raw.flags?.loading) {
    return 'LOADING';
  }

  if (raw.flags?.inBattle) {
    return 'BATTLE';
  }

  if (raw.flags?.menuOpen) {
    return 'MENU';
  }

  if (raw.flags?.inBattle === false && raw.flags?.menuOpen === false) {
    return 'OVERWORLD';
  }

  return 'UNKNOWN';
}

function deriveBattleKind(raw: BizHawkEmeraldRawState): NormalizedGameState['battle']['kind'] {
  if (!raw.flags?.inBattle) {
    return 'unknown';
  }

  if (raw.battle?.isTrainerBattle === true) {
    return 'trainer';
  }

  if (raw.battle?.isTrainerBattle === false) {
    return 'wild';
  }

  return 'unknown';
}

function deriveConfidence(raw: BizHawkEmeraldRawState): number {
  let confidence = 0.2;

  if (typeof raw.flags?.inBattle === 'boolean') confidence += 0.2;
  if (typeof raw.encounter?.speciesId === 'number') confidence += 0.15;
  if (typeof raw.encounter?.level === 'number') confidence += 0.15;
  if (typeof raw.encounter?.hp === 'number' && typeof raw.encounter?.maxHp === 'number') confidence += 0.1;
  if (typeof raw.encounter?.pid === 'number') confidence += 0.1;
  if (typeof raw.encounter?.shiny === 'boolean') confidence += 0.1;
  if (typeof raw.battle?.isTrainerBattle === 'boolean') confidence += 0.1;

  if (!raw.connected) {
    confidence = 0;
  }

  return clampConfidence(confidence);
}

export function normalizeEmeraldState(raw: BizHawkEmeraldRawState): NormalizedGameState {
  const mode = deriveMode(raw);
  const battleActive = mode === 'BATTLE';
  const species = resolveEmeraldSpecies(raw.encounter?.speciesId);

  return {
    ...EMPTY_GAME_STATE,
    connected: raw.connected,
    mode,
    battle: {
      active: battleActive,
      kind: deriveBattleKind(raw)
    },
    encounter: {
      active: battleActive,
      lifecycle: null,
      species,
      level: raw.encounter?.level ?? null,
      hp: raw.encounter?.hp ?? null,
      maxHp: raw.encounter?.maxHp ?? null,
      pid: raw.encounter?.pid ?? null,
      shiny: raw.encounter?.shiny ?? false,
      confidence: deriveConfidence(raw)
    },
    timestamp: raw.timestamp,
    raw: raw as unknown as Record<string, unknown>
  };
}