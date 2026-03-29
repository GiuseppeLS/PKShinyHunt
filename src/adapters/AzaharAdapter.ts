import type { EmulatorAdapter } from "../types/interfaces";
import type { EncounterInfo, HuntConfig } from "../types/domain";

export class AzaharAdapter implements EmulatorAdapter {
  id = "azahar";
  name = "Azahar Adapter (Stub)";
  async start(_config: HuntConfig): Promise<void> {}
  async stop(): Promise<void> {}
  onEncounter(_listener: (encounter: EncounterInfo) => void): void {}
}
