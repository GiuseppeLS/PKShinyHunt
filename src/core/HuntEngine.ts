import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { EmulatorAdapter, NotificationProvider, ScreenshotService, ShinyDetector } from "../types/interfaces";
import type { EncounterInfo, GameProfile, HuntConfig, HuntSession, HuntState, Settings } from "../types/domain";
import { JsonStorageService } from "../storage/JsonStorage";

export class HuntEngine extends EventEmitter {
  private state: HuntState = { status: "idle", activeSession: null, elapsedMs: 0 };
  private ticker: NodeJS.Timeout | null = null;

  constructor(
    private adapters: Map<string, EmulatorAdapter>,
    private detector: ShinyDetector,
    private screenshots: ScreenshotService,
    private providers: NotificationProvider[],
    private storage: JsonStorageService,
    private profiles: GameProfile[],
    private settings: Settings
  ) { super(); }

  getState(): HuntState { return this.state; }
  setSettings(s: Settings) { this.settings = s; }
  async listProfiles() { return this.profiles; }

  async start(config: HuntConfig): Promise<HuntState> {
    const adapter = this.adapters.get(config.emulatorAdapterId);
    if (!adapter) throw new Error("Adapter not found");
    const session: HuntSession = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      config,
      encounterCount: 0,
      status: "hunting",
      shinyFound: false
    };

    adapter.onEncounter((e) => { void this.onEncounter(e, adapter.id); });
    await adapter.start(config);

    this.state = { status: "hunting", activeSession: session, elapsedMs: 0 };
    this.startTicker();
    this.emit("stateChanged", this.state);
    return this.state;
  }

  async stop(): Promise<HuntState> {
    await this.finalize();
    this.stopTicker();
    this.emit("stateChanged", this.state);
    return this.state;
  }

  async reset(): Promise<HuntState> {
    await this.finalize("idle");
    this.stopTicker();
    this.state = { status: "idle", activeSession: null, elapsedMs: 0 };
    this.emit("stateChanged", this.state);
    return this.state;
  }

  async forceShiny(): Promise<HuntState> {
    const s = this.state.activeSession;
    if (!s) return this.state;
    const a = this.adapters.get(s.config.emulatorAdapterId);
    await a?.forceShinyEncounter?.();
    return this.state;
  }

  private async onEncounter(encounter: EncounterInfo, adapterId: string): Promise<void> {
    const s = this.state.activeSession;
    if (!s || s.config.emulatorAdapterId !== adapterId) return;

    s.encounterCount += 1;
    this.state.lastEncounter = encounter;

    const result = this.detector.detect(encounter);
    if (result.isShiny) {
      s.shinyFound = true;
      s.status = "shiny_found";
      s.shinyEncounter = encounter;
      this.state.status = "shiny_found";

      if (s.config.saveScreenshots) {
        s.screenshotPath = await this.screenshots.capture(s.id, encounter.id, s.config.screenshotFolder);
      }

      for (const p of this.providers) {
        if (p.id === "discord" && !s.config.enableDiscordNotifications) continue;
        if (p.isEnabled(this.settings)) await p.sendShinyAlert(s);
      }

      if (s.config.autoPauseOnShiny || this.settings.autoPauseOnShiny) {
        await this.finalize("shiny_found");
      }
    }

    this.state.activeSession = s;
    this.emit("stateChanged", this.state);
  }

  private async finalize(force?: HuntState["status"]): Promise<void> {
    const s = this.state.activeSession;
    if (!s) return;
    const a = this.adapters.get(s.config.emulatorAdapterId);
    await a?.stop();

    s.status = force ?? (s.shinyFound ? "shiny_found" : "idle");
    s.endedAt = new Date().toISOString();
    await this.storage.saveSession(s);
    this.state = { ...this.state, status: s.status, activeSession: s };
  }

  private startTicker() {
    this.stopTicker();
    this.ticker = setInterval(() => {
      const s = this.state.activeSession;
      if (!s) return;
      this.state.elapsedMs = Date.now() - new Date(s.startedAt).getTime();
      this.emit("stateChanged", this.state);
    }, 1000);
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
}
