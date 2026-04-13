import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AzaharRpcClient } from './AzaharRpcClient';
import { ORAS_US_V1_4_MEMORY_MAP } from './OrasMemoryMap';
import type { EmulatorStateBackend, PokemonGameStateSnapshot } from './EmulatorStateBackend';

const execFileAsync = promisify(execFile);

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanFromField(value: number | null): boolean | null {
  if (value === null) return null;
  return value !== 0;
}

type BackendStatus =
  | 'DISCONNECTED'
  | 'UNREADABLE_MEMORY'
  | 'UNKNOWN_STATE'
  | 'OVERWORLD'
  | 'BATTLE'
  | 'MENU_OR_TRANSITION'
  | 'ERROR';

export class AzaharMemoryStateBackend implements EmulatorStateBackend {
  id = 'azahar-memory';
  private rpc: AzaharRpcClient;
  private healthy = false;
  private lastError: string | null = null;

  private lastConnectAttemptAt = 0;
  private reconnectCooldownMs = 10000;
  private hasLoggedConnectFailure = false;

  constructor(private readonly host = '127.0.0.1', private readonly port = 45987) {
    this.rpc = new AzaharRpcClient(host, port, {
      logger: (level, message, meta) => {
        const entry = {
          scope: 'azahar-rpc',
          level,
          message,
          host: this.host,
          port: this.port,
          ...meta,
          at: new Date().toISOString(),
        };
        if (level === 'error') console.error(JSON.stringify(entry));
        else console.log(JSON.stringify(entry));
      },
    });
  }

  async connect(force = false): Promise<void> {
    await this.ensureAzaharRunning();

    const now = Date.now();
    if (!force && now - this.lastConnectAttemptAt < this.reconnectCooldownMs) {
      throw new Error(
        this.lastError ??
          `Azahar reconnect cooldown active (${this.reconnectCooldownMs}ms)`
      );
    }

    this.lastConnectAttemptAt = now;

    try {
      await this.rpc.connect();
      await this.rpc.call('ping');

      this.healthy = true;
      this.lastError = null;
      this.hasLoggedConnectFailure = false;

      console.log(
        JSON.stringify({
          scope: 'azahar-memory',
          level: 'info',
          message: 'Connected to Azahar RPC',
          host: this.host,
          port: this.port,
          at: new Date().toISOString(),
        })
      );
    } catch (error) {
      this.healthy = false;

      const message =
        error instanceof Error ? error.message : String(error);

      this.lastError = `Azahar transport/connect failure on ${this.host}:${this.port}: ${message}`;

      if (!this.hasLoggedConnectFailure) {
        console.error(
          JSON.stringify({
            scope: 'azahar-memory',
            level: 'error',
            message: 'Failed to connect Azahar RPC',
            error: this.lastError,
            cooldownMs: this.reconnectCooldownMs,
            at: new Date().toISOString(),
          })
        );
        this.hasLoggedConnectFailure = true;
      }

      throw new Error(this.lastError);
    }
  }

  async disconnect(): Promise<void> {
    await this.rpc.disconnect();
    this.healthy = false;
  }

  async pollState(): Promise<PokemonGameStateSnapshot> {
    if (!this.healthy) {
      return this.disconnectedSnapshot(
        this.lastError ?? 'Azahar backend unhealthy/disconnected'
      );
    }

    try {
      const status = await this.safeRpcRecord('emulation.status');
      const memory = await this.readMemoryFields();

      const battleFlag = numberOrNull(memory.battleFlag);
      const menuFlag = numberOrNull(memory.menuFlag);
      const runFlag = numberOrNull(memory.runFlag);
      const speciesIdRaw = numberOrNull(memory.speciesId);
      const shinyValueRaw = numberOrNull(memory.shinyValue);

      const unreadableFields = Object.entries(memory)
        .filter(([, value]) => value === null)
        .map(([key]) => key);

      const inBattleFromMemory = booleanFromField(battleFlag);
      const inBattleFromStatus =
        typeof status.inBattle === 'boolean' ? status.inBattle : null;
      const commandMenuFromMemory = booleanFromField(menuFlag);
      const commandMenuFromStatus =
        typeof status.commandMenuVisible === 'boolean'
          ? status.commandMenuVisible
          : null;
      const canRunFromMemory = booleanFromField(runFlag);
      const canRunFromStatus =
        typeof status.canRun === 'boolean' ? status.canRun : null;

      const inBattle = inBattleFromMemory ?? inBattleFromStatus ?? false;
      const commandMenuVisible =
        commandMenuFromMemory ?? commandMenuFromStatus ?? false;
      const canRun = canRunFromMemory ?? canRunFromStatus ?? false;

      const speciesId =
        speciesIdRaw !== null && speciesIdRaw > 0 && speciesIdRaw <= 1025
          ? speciesIdRaw
          : null;
      const isShiny =
        shinyValueRaw === null ? null : Boolean(shinyValueRaw & 1);

      let backendStatus: BackendStatus = 'UNKNOWN_STATE';
      let state: PokemonGameStateSnapshot['state'] = 'UNKNOWN';

      if (unreadableFields.length >= 3) {
        backendStatus = 'UNREADABLE_MEMORY';
        state = 'UNKNOWN';
      } else if (inBattle || commandMenuVisible || canRun) {
        if (canRun) {
          backendStatus = 'BATTLE';
          state = 'RUN_AVAILABLE';
        } else if (commandMenuVisible) {
          backendStatus = 'MENU_OR_TRANSITION';
          state = 'COMMAND_MENU';
        } else {
          backendStatus = 'BATTLE';
          state = 'BATTLE';
        }
      } else if (status.returningToOverworld === true) {
        backendStatus = 'MENU_OR_TRANSITION';
        state = 'RETURNING_TO_OVERWORLD';
      } else if (inBattleFromMemory === false || inBattleFromStatus === false) {
        backendStatus = 'OVERWORLD';
        state = 'OVERWORLD';
      }

      const reasoning = {
        unreadableFields,
        battleFlag,
        menuFlag,
        runFlag,
        statusInBattle: inBattleFromStatus,
        statusCommandMenuVisible: commandMenuFromStatus,
        statusCanRun: canRunFromStatus,
        statusReturningToOverworld: status.returningToOverworld ?? null,
        resolved: {
          state,
          backendStatus,
          inBattle,
          commandMenuVisible,
          canRun,
          speciesId,
          isShiny,
        },
      };

      console.log(
        JSON.stringify({
          scope: 'azahar-memory',
          level: 'debug',
          message: 'Poll resolved',
          ...reasoning,
          at: new Date().toISOString(),
        })
      );

      this.healthy = backendStatus !== 'UNREADABLE_MEMORY';
      this.lastError =
        backendStatus === 'UNREADABLE_MEMORY'
          ? `Memory unreadable for fields: ${unreadableFields.join(', ')}`
          : null;

      return {
        state,
        inBattle,
        commandMenuVisible,
        canRun,
        encounteredSpeciesId: speciesId,
        speciesName: null,
        isWildEncounter:
          typeof status.isWildEncounter === 'boolean'
            ? status.isWildEncounter
            : null,
        isShiny,
        confidence:
          backendStatus === 'UNKNOWN_STATE'
            ? 0.35
            : backendStatus === 'UNREADABLE_MEMORY'
            ? 0.1
            : 0.9,
        source: 'memory',
        raw: {
          status,
          memory,
          reasoning,
          backendStatus,
          mapProfile: ORAS_US_V1_4_MEMORY_MAP.profile,
          mapNotes: ORAS_US_V1_4_MEMORY_MAP.notes,
        },
      };
    } catch (error) {
      this.healthy = false;
      this.lastError = error instanceof Error ? error.message : String(error);

      console.error(
        JSON.stringify({
          scope: 'azahar-memory',
          level: 'error',
          message: 'pollState failed',
          error: this.lastError,
          at: new Date().toISOString(),
        })
      );

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
        raw: { error: this.lastError, backendStatus: 'ERROR' },
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
    const fields = ORAS_US_V1_4_MEMORY_MAP.fields;
    return {
      battleFlag: fields.battleFlag.address,
      menuFlag: fields.menuFlag.address,
      runFlag: fields.runFlag.address,
      speciesId: fields.speciesId.address,
      shinyValue: fields.shinyValue.address,
    };
  }

  private async safeRpcRecord(method: string): Promise<Record<string, unknown>> {
    try {
      const result = await this.rpc.call<Record<string, unknown>>(method);
      return result ?? {};
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: 'azahar-memory',
          level: 'error',
          message: 'RPC call failed',
          method,
          error: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        })
      );
      return {};
    }
  }

  private async readMemoryFields(): Promise<Record<string, unknown>> {
    const read32 = async (address: number): Promise<number | null> => {
      try {
        return await this.rpc.call<number>('memory.read_u32', { address });
      } catch {
        return null;
      }
    };

    const fields = ORAS_US_V1_4_MEMORY_MAP.fields;
    return {
      battleFlag: await read32(fields.battleFlag.address),
      menuFlag: await read32(fields.menuFlag.address),
      runFlag: await read32(fields.runFlag.address),
      speciesId: await read32(fields.speciesId.address),
      shinyValue: await read32(fields.shinyValue.address),
    };
  }

  private disconnectedSnapshot(reason: string): PokemonGameStateSnapshot {
    this.lastError = reason;
    return {
      state: 'UNKNOWN',
      inBattle: false,
      commandMenuVisible: false,
      canRun: false,
      encounteredSpeciesId: null,
      speciesName: null,
      isWildEncounter: null,
      isShiny: null,
      confidence: 0,
      source: 'memory',
      raw: {
        backendStatus: 'DISCONNECTED',
        reason,
      },
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
      throw new Error(
        'Azahar process not detected (check executable name / running instance)'
      );
    }
  }
}