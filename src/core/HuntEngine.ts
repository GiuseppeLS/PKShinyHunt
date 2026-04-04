import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { EmulatorAdapter, NotificationProvider, ScreenshotService, ShinyDetector, SessionRepository } from '../types/interfaces';
import type { EncounterInfo, GameProfile, HuntConfig, HuntSession, HuntState, HuntStatus, Settings } from '../types/domain';

export class HuntEngine extends EventEmitter {
  private currentState: HuntState = {
    status: 'idle',
    activeSession: null,
    elapsedMs: 0
  };

  private elapsedInterval: NodeJS.Timeout | null = null;

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
    this.currentState.status = status;
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
    this.emitState();
    return this.currentState;
  }

  async stop(): Promise<HuntState> {
    const session = await this.finalizeCurrentSession('idle');
    if (!session) {
      return this.currentState;
    }

    this.stopElapsedTicker();
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
      this.currentState.status = 'shiny_found';
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
    this.currentState.status = 'encounter_start';
    this.currentState.lastEncounter = encounter;
    this.currentState.activeSession = session;
    this.emitState();
  }

  markBattlePhase(status: Extract<HuntStatus, 'attached' | 'searching' | 'encounter_start' | 'in_battle' | 'analyzing' | 'error'>): void {
    const session = this.currentState.activeSession;
    if (session) {
      session.status = status;
      this.currentState.activeSession = session;
    }
    this.currentState.status = status;
    this.emitState();
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

  private emitState(): void {
    this.emit('stateChanged', this.currentState);
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