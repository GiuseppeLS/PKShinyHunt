import type { EmulatorAdapter } from "../types/interfaces";
import type { EncounterInfo, HuntConfig } from "../types/domain";
import { randomUUID } from "node:crypto";

const pool = ["Ralts", "Eevee", "Pikachu", "Gastly", "Absol"];

export class MockEmulatorAdapter implements EmulatorAdapter {
  id = "mock";
  name = "Mock Emulator Adapter";
  private listener: ((encounter: EncounterInfo) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private config: HuntConfig | null = null;

  onEncounter(listener: (encounter: EncounterInfo) => void): void {
    this.listener = listener;
  }

  async start(config: HuntConfig): Promise<void> {
    this.config = config;
    this.stopTimer();
    this.timer = setInterval(() => {
      const forceShiny = Math.random() < 0.02;
      this.listener?.({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        pokemonName: pool[Math.floor(Math.random() * pool.length)],
        level: Math.floor(Math.random() * 60) + 1,
        encounterType: config.huntMode,
        isShinyCandidate: forceShiny
      });
    }, 1500);
  }

  async stop(): Promise<void> {
    this.stopTimer();
    this.config = null;
  }

  async forceShinyEncounter(): Promise<EncounterInfo | null> {
    if (!this.config) return null;
    const e: EncounterInfo = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      pokemonName: this.config.targetPokemon,
      encounterType: this.config.huntMode,
      isShinyCandidate: true
    };
    this.listener?.(e);
    return e;
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
