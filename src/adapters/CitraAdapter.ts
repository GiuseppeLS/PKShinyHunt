import type { EmulatorAdapter } from '../types/interfaces';
import type { EncounterInfo, HuntConfig } from '../types/domain';

export class CitraAdapter implements EmulatorAdapter {
  id = 'citra';
  name = 'Citra Adapter (Stub)';

  async start(_config: HuntConfig): Promise<void> {
    // Future: detect Citra process and attach memory reader.
  }

  async stop(): Promise<void> {
    // Future: detach from process resources.
  }

  onEncounter(_listener: (encounter: EncounterInfo) => void): void {
    // Future: register memory-parsed encounter callback.
  }
}


