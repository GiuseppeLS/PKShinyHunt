import { randomUUID } from 'node:crypto';
import type { EmulatorAdapter } from '../types/interfaces';
import type { EncounterInfo, HuntConfig } from '../types/domain';

const pokemonPool = ['Pikachu', 'Eevee', 'Ralts', 'Beldum', 'Zorua', 'Gastly', 'Absol', 'Dratini'];

export class MockEmulatorAdapter implements EmulatorAdapter {
  id = 'mock';
  name = 'Mock Emulator Adapter';

  private intervalRef: NodeJS.Timeout | null = null;
  private listener: ((encounter: EncounterInfo) => void) | null = null;
  private activeConfig: HuntConfig | null = null;

  async start(config: HuntConfig): Promise<void> {
    this.activeConfig = config;
    this.stopTimer();
    this.intervalRef = setInterval(() => {
      const encounter = this.generateEncounter(Math.random() < 0.02);
      this.listener?.(encounter);
    }, 1700);
  }

  async stop(): Promise<void> {
    this.stopTimer();
    this.activeConfig = null;
  }

  onEncounter(listener: (encounter: EncounterInfo) => void): void {
    this.listener = listener;
  }

  async forceShinyEncounter(): Promise<EncounterInfo> {
    const encounter = this.generateEncounter(true);
    this.listener?.(encounter);
    return encounter;
  }

  private generateEncounter(forceShiny: boolean): EncounterInfo {
    const target = this.activeConfig?.targetPokemon;
    const name = Math.random() > 0.6 && target ? target : pokemonPool[Math.floor(Math.random() * pokemonPool.length)];

    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      pokemonName: name,
      level: Math.floor(Math.random() * 60) + 1,
      encounterType: this.activeConfig?.huntMode ?? 'random_encounters',
      isShinyCandidate: forceShiny,
      metadata: {
        source: 'mock-adapter'
      }
    };
  }

  private stopTimer(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }
}


