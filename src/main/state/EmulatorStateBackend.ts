export type PokemonGameState =
  | 'OVERWORLD'
  | 'TRANSITION'
  | 'BATTLE'
  | 'COMMAND_MENU'
  | 'RUN_AVAILABLE'
  | 'RETURNING_TO_OVERWORLD'
  | 'UNKNOWN'
  | 'ERROR';

export interface PokemonGameStateSnapshot {
  state: PokemonGameState;
  inBattle: boolean;
  commandMenuVisible: boolean;
  canRun: boolean;
  encounteredSpeciesId: number | null;
  speciesName: string | null;
  isWildEncounter: boolean | null;
  isShiny: boolean | null;
  confidence: number;
  source: 'memory' | 'screen';
  raw: Record<string, unknown>;
}

export interface EmulatorStateBackend {
  id: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  pollState(): Promise<PokemonGameStateSnapshot>;
  isHealthy(): boolean;
  getLastError(): string | null;
}
