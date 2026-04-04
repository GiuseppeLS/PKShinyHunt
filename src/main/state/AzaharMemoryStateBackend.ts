import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AzaharRpcClient } from './AzaharRpcClient';
import { ORAS_US_V1_4_OFFSETS } from './OrasMemoryMap';
import type { EmulatorStateBackend, PokemonGameStateSnapshot } from './EmulatorStateBackend';

const execFileAsync = promisify(execFile);

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export class AzaharMemoryStateBackend implements EmulatorStateBackend {
  id = 'azahar-memory';
  private rpc: AzaharRpcClient;
  private healthy = false;
  private lastError: string | null = null;

  constructor(host = '127.0.0.1', port = 26760) {
    this.rpc = new AzaharRpcClient(host, port);
  }

  async connect(): Promise<void> {
    await this.ensureAzaharRunning();

    try {
      await this.rpc.connect();
      await this.rpc.call('ping');
      this.healthy = true;
      this.lastError = null;
    } catch (error) {
      this.healthy = false;
      this.lastError = `RPC unavailable/disabled: ${error instanceof Error ? error.message : String(error)}`;
      throw new Error(this.lastError);
    }
  }

  async disconnect(): Promise<void> {
    await this.rpc.disconnect();
    this.healthy = false;
  }

  async pollState(): Promise<PokemonGameStateSnapshot> {
    try {
      const status = await this.rpc.call<Record<string, unknown>>('emulation.status').catch(() => ({} as Record<string, unknown>));
      const statusAny = status as Record<string, unknown>;
      const memory = await this.readMemoryFields();

      const inBattle = Boolean(numberOrZero(memory.battleFlag) || statusAny.inBattle === true);
      const commandMenuVisible = Boolean(numberOrZero(memory.menuFlag) || statusAny.commandMenuVisible === true);
      const canRun = Boolean(numberOrZero(memory.runFlag) || statusAny.canRun === true);

      let state: PokemonGameStateSnapshot['state'] = 'OVERWORLD';
      if (inBattle) state = 'BATTLE';
      if (commandMenuVisible) state = 'COMMAND_MENU';
      if (canRun) state = 'RUN_AVAILABLE';
      if (!inBattle && statusAny.returningToOverworld === true) state = 'RETURNING_TO_OVERWORLD';

      const speciesId = numberOrZero(memory.speciesId) || null;
      const shinyRaw = numberOrZero(memory.shinyValue);
      const isShiny = shinyRaw > 0 ? Boolean(shinyRaw & 1) : null;

      this.healthy = true;
      this.lastError = null;

      return {
        state,
        inBattle,
        commandMenuVisible,
        canRun,
        encounteredSpeciesId: speciesId,
        speciesName: null,
        isWildEncounter: typeof statusAny.isWildEncounter === 'boolean' ? (statusAny.isWildEncounter as boolean) : null,
        isShiny,
        confidence: 0.85,
        source: 'memory',
        raw: { status, memory }
      };
    } catch (error) {
      this.healthy = false;
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
        source: 'memory',
        raw: { error: this.lastError }
      };
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getMemoryAddressLabels(): Record<string, number> {
    return {
      battleFlag: ORAS_US_V1_4_OFFSETS.battleFlagAddr,
      menuFlag: ORAS_US_V1_4_OFFSETS.menuFlagAddr,
      runFlag: ORAS_US_V1_4_OFFSETS.runFlagAddr,
      speciesId: ORAS_US_V1_4_OFFSETS.speciesAddr,
      shinyValue: ORAS_US_V1_4_OFFSETS.shinyValueAddr
    };
  }

  private async readMemoryFields(): Promise<Record<string, unknown>> {
    const read32 = async (address: number) =>
      this.rpc.call<number>('memory.read_u32', { address }).catch(() => 0);

    return {
      battleFlag: await read32(ORAS_US_V1_4_OFFSETS.battleFlagAddr),
      menuFlag: await read32(ORAS_US_V1_4_OFFSETS.menuFlagAddr),
      runFlag: await read32(ORAS_US_V1_4_OFFSETS.runFlagAddr),
      speciesId: await read32(ORAS_US_V1_4_OFFSETS.speciesAddr),
      shinyValue: await read32(ORAS_US_V1_4_OFFSETS.shinyValueAddr)
    };
  }

  private async ensureAzaharRunning(): Promise<void> {
    if (process.platform !== 'win32') {
      throw new Error('Azahar memory backend currently supports Windows only');
    }

    const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv', '/nh']);
    const processList = stdout.toLowerCase();
    const knownAzaharNames = ['azahar', 'azahar-qt', 'azahar-room', 'lime3ds'];
    const matched = knownAzaharNames.find((name) => processList.includes(name));

    if (!matched) {
      throw new Error('Azahar process not detected (check executable name / running instance)');
    }
  }
}