import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { HuntSession, Settings } from "../types/domain";

const defaults: Settings = {
  discordWebhookUrl: "",
  screenshotFolder: path.join(app.getPath("pictures"), "PokemonShinyHuntAssistant"),
  defaultGameProfileId: "oras-starters",
  autoPauseOnShiny: true,
  saveScreenshots: true
};

interface Db { settings: Settings; sessions: HuntSession[]; }

export class JsonStorageService {
  private file = path.join(app.getPath("userData"), "storage.json");

  async getSettings(): Promise<Settings> {
    const db = await this.read(); return db.settings;
  }

  async saveSettings(settings: Settings): Promise<void> {
    const db = await this.read(); db.settings = settings; await this.write(db);
  }

  async saveSession(session: HuntSession): Promise<void> {
    const db = await this.read();
    const i = db.sessions.findIndex(s => s.id === session.id);
    if (i >= 0) db.sessions[i] = session; else db.sessions.unshift(session);
    db.sessions = db.sessions.slice(0, 200);
    await this.write(db);
  }

  async listSessions(): Promise<HuntSession[]> {
    const db = await this.read(); return db.sessions;
  }

  private async read(): Promise<Db> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const p = JSON.parse(raw) as Partial<Db>;
      return { settings: { ...defaults, ...(p.settings ?? {}) }, sessions: p.sessions ?? [] };
    } catch {
      const d: Db = { settings: defaults, sessions: [] };
      await this.write(d);
      return d;
    }
  }

  private async write(db: Db): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(db, null, 2), "utf8");
  }
}
