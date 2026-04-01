import type { EmulatorAdapter } from '../types/interfaces';
import type { EncounterInfo, HuntConfig } from '../types/domain';

export class AzaharAdapter implements EmulatorAdapter {
  id = 'azahar';
  name = 'Azahar Adapter (Stub)';

  async start(_config: HuntConfig): Promise<void> {
    // Future: process detection + memory hooks.
  }

  async stop(): Promise<void> {
    // Future: clean shutdown for injected listeners.
  }

  onEncounter(_listener: (encounter: EncounterInfo) => void): void {
    // Future: parse live encounters.
  }
}