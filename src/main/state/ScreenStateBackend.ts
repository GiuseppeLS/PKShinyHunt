import type { EmulatorStateBackend, PokemonGameStateSnapshot } from './EmulatorStateBackend';

export class ScreenStateBackend implements EmulatorStateBackend {
  id = 'screen-fallback';
  private lastError: string | null = null;

  constructor(private readonly readSnapshot: () => Promise<PokemonGameStateSnapshot>) {}

  async connect(): Promise<void> {
    this.lastError = null;
  }

  async disconnect(): Promise<void> {
    // noop
  }

  async pollState(): Promise<PokemonGameStateSnapshot> {
    try {
      const snapshot = await this.readSnapshot();
      this.lastError = null;
      return snapshot;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return {
        state: 'ERROR',
        inBattle: false,
        commandMenuVisible: false,
        canRun: false,
        encounteredSpeciesId: null,
        speciesName: null,
        isWildEncounter: null,
        isShiny: null,
        confidence: 0,
        source: 'screen',
        raw: { error: this.lastError }
      };
    }
  }

  isHealthy(): boolean {
    return this.lastError === null;
  }

  getLastError(): string | null {
    return this.lastError;
  }
}
