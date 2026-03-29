import type { EmulatorAdapter } from "../types/interfaces";
import type { EncounterInfo, HuntConfig } from "../types/domain";

export class CitraAdapter implements EmulatorAdapter {
  id = "citra";
  name = "Citra Adapter (Stub)";
  async start(_config: HuntConfig): Promise<void> {}
  async stop(): Promise<void> {}
  onEncounter(_listener: (encounter: EncounterInfo) => void): void {}
}
