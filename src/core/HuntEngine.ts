import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { EmulatorAdapter, EmulatorHealth, NotificationProvider, ScreenshotService, ShinyDetector, SessionRepository } from '../types/interfaces';
import type { EncounterInfo, GameProfile, HuntConfig, HuntSession, HuntState, HuntStatus, Settings } from '../types/domain';

type EnginePhaseStatus = 'attached' | 'searching' | 'encounter_start' | 'in_battle' | 'analyzing' | 'error';
const VALID_STATUSES = ['idle', 'attached', 'searching', 'encounter_start', 'in_battle', 'analyzing', 'shiny_found', 'paused', 'error'] as const;

export class HuntEngine extends EventEmitter {
  private currentState: HuntState = {
    status: 'idle',
    activeSession: null,
    elapsedMs: 0
  };

  private elapsedInterval: NodeJS.Timeout | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private encounterStartedAt = 0;
  private emulatorHealth: EmulatorHealth | null = null;

  constructor(
    private readonly adapters: Map<string, EmulatorAdapter>,
    private readonly detector: ShinyDetector,
    private readonly screenshotService: ScreenshotService,
    private readonly notifications: NotificationProvider[],
    private readonly sessionRepo: SessionRepository,
    private readonly profiles: GameProfile[],
    private settings: Settings
  ) {
    super();
  }

  getState(): HuntState {
    return this.currentState;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
  }

  setStatus(status: HuntStatus, errorMessage?: string): HuntState {
    this.transitionTo(status, errorMessage ?? 'setStatus');
    if (errorMessage && this.currentState.activeSession) {
      this.currentState.activeSession.errorMessage = errorMessage;
    }
    this.emitState();
    return this.currentState;
  }

  async start(config: HuntConfig): Promise<HuntState> {
    if (this.currentState.activeSession) {
      return this.currentState;
    }

    const adapter = this.adapters.get(config.emulatorAdapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${config.emulatorAdapterId}`);
    }

    const session: HuntSession = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      config,
      encounterCount: 0,
      status: 'searching',
      shinyFound: false
    };

    adapter.onEncounter((encounter) => {
      void this.recordEncounter(encounter, adapter.id);
    });

    await adapter.start(config);

    this.currentState = {
      status: 'searching',
      activeSession: session,
      elapsedMs: 0
    };

    this.startElapsedTicker();
    this.startWatchdog();
    this.emitState();
    return this.currentState;
  }

  async stop(): Promise<HuntState> {
    const session = await this.finalizeCurrentSession('idle');
    if (!session) {
      return this.currentState;
    }

    this.stopElapsedTicker();
    this.stopWatchdog();
    this.currentState = {
      status: 'idle',
      activeSession: session,
      elapsedMs: this.currentState.elapsedMs,
      lastEncounter: this.currentState.lastEncounter
    };
    this.emitState();
    return this.currentState;
  }

  async reset(): Promise<HuntState> {
    await this.finalizeCurrentSession('idle');
    this.stopElapsedTicker();
    this.stopWatchdog();
    this.currentState = { status: 'idle', activeSession: null, elapsedMs: 0 };
    this.emitState();
    return this.currentState;
  }

  async forceShiny(): Promise<HuntState> {
    const session = this.currentState.activeSession;
    if (!session) {
      throw new Error('Start eerst een hunt voordat je Force Shiny gebruikt.');
    }

    const adapter = this.adapters.get(session.config.emulatorAdapterId);
    const encounter = adapter?.forceShinyEncounter
      ? await adapter.forceShinyEncounter()
      : {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        pokemonName: session.config.targetPokemon || 'Unknown',
        encounterType: session.config.huntMode,
        isShinyCandidate: true,
        metadata: {
          source: 'force-shiny-fallback'
        }
      };

    if (encounter) {
      session.shinyFound = true;
      session.shinyEncounter = encounter;
      await this.recordEncounter(encounter, adapter?.id ?? session.config.emulatorAdapterId);
      this.transitionTo('shiny_found', 'force-shiny');
      if (this.currentState.activeSession) {
        this.currentState.activeSession.status = 'shiny_found';
      }
      this.emitState();
    }

    return this.currentState;
  }

  async listProfiles(): Promise<GameProfile[]> {
    return this.profiles;
  }

  async recordEncounter(encounter: EncounterInfo, adapterId: string): Promise<void> {
    const session = this.currentState.activeSession;
    if (!session || session.config.emulatorAdapterId !== adapterId) {
      return;
    }

    session.encounterCount += 1;
    session.status = 'encounter_start';
    this.currentState.lastEncounter = encounter;
    this.currentState.activeSession = session;
    this.transitionTo('encounter_start', 'encounter-recorded');
    this.emitState();
  }

  markBattlePhase(status: EnginePhaseStatus): void {
    const session = this.currentState.activeSession;
    if (session) {
      session.status = status as HuntStatus;
      this.currentState.activeSession = session;
    }
    this.transitionTo(status as HuntStatus, 'battle-phase-update');
    this.emitState();
  }

  updateEmulatorHealth(health: EmulatorHealth): { ok: boolean; reason: string } {
    this.emulatorHealth = health;
    const ok = health.emulatorRunning && health.executableOk && health.romOk && health.bridgeConnected;
    const reason = ok ? 'health-ok' : (health.reason ?? 'health-check-failed');

    if (!ok) {
      this.forceIdleFromHealth(reason);
      return { ok, reason };
    }

    if (this.currentState.activeSession && this.currentState.status === 'encounter_start') {
      const analyzingStatus = 'analyzing' as unknown as HuntStatus;
      this.transitionTo(analyzingStatus, 'encounter-health-ok');
      this.emitState();
    }

    return { ok, reason };
  }

  async getAdapterHealth(adapterId: string): Promise<EmulatorHealth> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      return {
        emulatorRunning: false,
        executableOk: false,
        romOk: false,
        bridgeConnected: false,
        adapter: adapterId,
        reason: 'adapter-not-found'
      };
    }

    if (!adapter.getHealth) {
      return {
        emulatorRunning: true,
        executableOk: true,
        romOk: true,
        bridgeConnected: true,
        adapter: adapterId,
        reason: 'adapter-health-not-implemented'
      };
    }

    return adapter.getHealth();
  }

  private startElapsedTicker(): void {
    this.stopElapsedTicker();
    this.elapsedInterval = setInterval(() => {
      const session = this.currentState.activeSession;
      if (!session) {
        return;
      }
      this.currentState.elapsedMs = Date.now() - new Date(session.startedAt).getTime();
      this.emitState();
    }, 1000);
  }

  private stopElapsedTicker(): void {
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogInterval = setInterval(() => {
      if (!this.currentState.activeSession) {
        return;
      }

      if (!VALID_STATUSES.includes(this.currentState.status as (typeof VALID_STATUSES)[number])) {
        this.forceIdleFromHealth('invalid-state');
        return;
      }

      const encounterStuck = this.currentState.status === 'encounter_start'
        && this.encounterStartedAt > 0
        && Date.now() - this.encounterStartedAt > 3000;

      if (encounterStuck) {
        this.forceIdleFromHealth('encounter-start-timeout');
      }
    }, 1000);
  }

  private stopWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  private emitState(): void {
    this.emit('stateChanged', this.currentState);
  }

  private forceIdleFromHealth(reason: string): void {
    if (this.currentState.activeSession) {
      this.currentState.activeSession.status = 'idle';
    }
    this.transitionTo('idle', reason);
    this.emitState();
  }

  private transitionTo(nextStatus: HuntStatus, reason: string): void {
    const previousStatus = this.currentState.status;
    this.currentState.status = nextStatus;
    this.encounterStartedAt = nextStatus === 'encounter_start' ? Date.now() : 0;

    console.log(JSON.stringify({
      scope: 'hunt-engine',
      event: 'state-transition',
      from: previousStatus,
      to: nextStatus,
      reason,
      emulator: this.emulatorHealth,
      detectedSpecies: this.currentState.lastEncounter?.pokemonName ?? null,
      shinyResult: this.currentState.lastEncounter?.isShinyCandidate ?? null,
      at: new Date().toISOString()
    }));
  }

  private async finalizeCurrentSession(forceStatus?: HuntState['status']): Promise<HuntSession | null> {
    const session = this.currentState.activeSession;
    if (!session) {
      return null;
    }

    const adapter = this.adapters.get(session.config.emulatorAdapterId);
    await adapter?.stop();

    session.status = forceStatus ?? (session.shinyFound ? 'shiny_found' : 'idle');
    session.endedAt = new Date().toISOString();

    await this.sessionRepo.saveSession(session);
    return session;
  }
}