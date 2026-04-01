import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { EmulatorAdapter, NotificationProvider, ScreenshotService, ShinyDetector, SessionRepository } from '../types/interfaces';
import type { EncounterInfo, GameProfile, HuntConfig, HuntSession, HuntState, Settings } from '../types/domain';

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

  async start(config: HuntConfig): Promise<HuntState> {
    if (this.currentState.status === 'hunting') {
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
      status: 'hunting',
      shinyFound: false
    };

    adapter.onEncounter((encounter) => {
      void this.handleEncounter(encounter, adapter.id);
    });

    await adapter.start(config);

    this.currentState = {
      status: 'hunting',
      activeSession: session,
      elapsedMs: 0
    };

    this.startElapsedTicker();
    this.emitState();
    return this.currentState;
  }

  async stop(): Promise<HuntState> {
    const session = await this.finalizeCurrentSession();
    if (!session) {
      return this.currentState;
    }

    this.stopElapsedTicker();
    this.currentState = {
      status: session.status,
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
      return this.currentState;
    }

    const adapter = this.adapters.get(session.config.emulatorAdapterId);
    if (adapter?.forceShinyEncounter) {
      await adapter.forceShinyEncounter();
    }

    return this.currentState;
  }

  async listProfiles(): Promise<GameProfile[]> {
    return this.profiles;
  }

  private async handleEncounter(encounter: EncounterInfo, adapterId: string): Promise<void> {
    const session = this.currentState.activeSession;
    if (!session || session.config.emulatorAdapterId !== adapterId) {
      return;
    }

    session.encounterCount += 1;
    this.currentState.lastEncounter = encounter;

    const result = this.detector.detect(encounter);
    if (result.isShiny) {
      session.shinyFound = true;
      session.shinyEncounter = encounter;
      session.status = 'shiny_found';
      this.currentState.status = 'shiny_found';

      if (session.config.saveScreenshots) {
        session.screenshotPath = await this.screenshotService.capture(
          session.id,
          encounter.id,
          session.config.screenshotFolder
        );
      }

      await this.notifyProviders(session);

      if (session.config.autoPauseOnShiny || this.settings.autoPauseOnShiny) {
        await this.finalizeCurrentSession('shiny_found');
      }
    }

    this.currentState.activeSession = session;
    this.emitState();
  }

  private async notifyProviders(session: HuntSession): Promise<void> {
    for (const provider of this.notifications) {
      try {
        if (provider.id === 'discord') {
          if (session.config.enableDiscordNotifications && provider.isEnabled(this.settings)) {
            await provider.sendShinyAlert(session);
          }
        } else if (provider.isEnabled(this.settings)) {
          await provider.sendShinyAlert(session);
        }
      } catch (error) {
        session.errorMessage = error instanceof Error ? error.message : 'Unknown notification error';
      }
    }
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

    const status = forceStatus ?? (session.shinyFound ? 'shiny_found' : 'idle');
    session.status = status;
    session.endedAt = new Date().toISOString();

    await this.sessionRepo.saveSession(session);
    return session;
  }
}
