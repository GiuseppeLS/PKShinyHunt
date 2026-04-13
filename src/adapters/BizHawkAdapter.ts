import { randomUUID } from 'node:crypto';
import type { EmulatorAdapter } from '../types/interfaces';
import type { EncounterInfo, HuntConfig, Settings } from '../types/domain';
import { EMPTY_GAME_STATE, type BizHawkEmeraldRawState, type NormalizedGameState } from '../core/GameState';
import { normalizeEmeraldState } from '../core/parsers/emerald/normalizeEmeraldState';
import { EncounterLifecycleTracker } from '../core/parsers/EncounterLifecycleTracker';
import { BizHawkBridgeServer } from './bizhawk/BizHawkBridgeServer';
import { BizHawkProcess } from './bizhawk/BizHawkProcess';
import { resolveBizHawkConfig, type BizHawkConfig } from '../config/bizhawk';

export interface BizHawkAdapterOptions {
  getSettings?: () => Settings | null;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

export class BizHawkAdapter implements EmulatorAdapter {
  id = 'bizhawk';
  name = 'BizHawk Adapter (Pokemon Emerald/GBA)';

  private lifecycleTracker = new EncounterLifecycleTracker();
  private listener: ((encounter: EncounterInfo) => void) | null = null;
  private lastState: NormalizedGameState = { ...EMPTY_GAME_STATE };
  private lastError: string | null = null;
  private bridgeServer: BizHawkBridgeServer | null = null;
  private readonly processManager: BizHawkProcess;
  private activeConfig: BizHawkConfig;

  constructor(private readonly options: BizHawkAdapterOptions = {}) {
    this.processManager = new BizHawkProcess(options.logger);
    this.activeConfig = resolveBizHawkConfig(options.getSettings?.());
  }

  async ensureBridgeReady(): Promise<void> {
    this.activeConfig = resolveBizHawkConfig(this.options.getSettings?.());

    await this.processManager.ensureRunning(this.activeConfig);
    const status = await this.processManager.getStatus(this.activeConfig);
    this.options.logger?.('BizHawk process status', {
      running: status.running,
      executableOk: status.executableOk,
      romOk: status.romOk
    });

    if (!this.bridgeServer) {
      this.bridgeServer = new BizHawkBridgeServer({
        host: this.activeConfig.tcpHost,
        port: this.activeConfig.tcpPort,
        logger: this.options.logger
      });
    }

    const actualPort = await this.bridgeServer.start((rawPayload) => {
      this.handleRawState(rawPayload);
    });

    if (actualPort !== this.activeConfig.tcpPort) {
      this.options.logger?.('BizHawk bridge port fallback in use', {
        requestedPort: this.activeConfig.tcpPort,
        actualPort
      });
    }
  }

  async shutdownBridge(): Promise<void> {
    await this.bridgeServer?.stop();
    this.bridgeServer = null;
  }

  async start(_config: HuntConfig): Promise<void> {
    this.lifecycleTracker = new EncounterLifecycleTracker();
    this.lastState = { ...EMPTY_GAME_STATE, connected: false, timestamp: Date.now() };
    await this.ensureBridgeReady();
  }

  async stop(): Promise<void> {
    const updatedConfig = resolveBizHawkConfig(this.options.getSettings?.());
    this.activeConfig = updatedConfig;

    if (!updatedConfig.autoAttachBizHawk) {
      await this.shutdownBridge();
    }
    this.lifecycleTracker = new EncounterLifecycleTracker();
    this.lastState = { ...EMPTY_GAME_STATE, connected: false, timestamp: Date.now() };
  }

  onEncounter(listener: (encounter: EncounterInfo) => void): void {
    this.listener = listener;
  }

  getLastState(): NormalizedGameState {
    return this.lastState;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  isConnected(): boolean {
    return Boolean(this.bridgeServer?.isConnected());
  }

  getLastRawPacket(): string | null {
    return this.bridgeServer?.getLastRawPacket() ?? null;
  }

  private handleRawState(rawPayload: BizHawkEmeraldRawState): void {
    try {
      const normalized = normalizeEmeraldState(rawPayload);
      const lifecycle = this.lifecycleTracker.update(normalized);

      normalized.connected = normalized.connected && this.isConnected();
      normalized.encounter.lifecycle = lifecycle;

      this.lastState = normalized;
      this.lastError = null;

      if (lifecycle === 'encounter_started') {
        this.emitEncounter(normalized);
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.lastState = {
        ...this.lastState,
        mode: 'UNKNOWN',
        connected: this.isConnected(),
        timestamp: Date.now()
      };
      this.options.logger?.('BizHawk state parse error', {
        error: this.lastError,
        rawPacket: this.getLastRawPacket()
      });
    }
  }

  private emitEncounter(state: NormalizedGameState): void {
    const encounter: EncounterInfo = {
      id: randomUUID(),
      timestamp: new Date(state.timestamp || Date.now()).toISOString(),
      pokemonName: state.encounter.species ?? 'Unknown',
      level: state.encounter.level ?? undefined,
      encounterType: 'random_encounters',
      isShinyCandidate: state.encounter.shiny,
      metadata: {
        source: state.source,
        mode: state.mode,
        battleKind: state.battle.kind,
        pid: state.encounter.pid,
        hp: state.encounter.hp,
        maxHp: state.encounter.maxHp,
        confidence: state.encounter.confidence,
        lifecycle: state.encounter.lifecycle
      }
    };

    this.listener?.(encounter);
  }
}