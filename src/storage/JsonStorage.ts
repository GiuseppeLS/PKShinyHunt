import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { HuntSession, Settings } from '../types/domain';
import type { SessionRepository, SettingsRepository } from '../types/interfaces';

const defaultSettings: Settings = {
  discordWebhookUrl: '',
  screenshotFolder: path.join(app.getPath('pictures'), 'PokemonShinyHuntAssistant'),
  defaultGameProfileId: 'oras-starters',
  autoPauseOnShiny: true,
  saveScreenshots: true,
  bizhawk: {
    bizhawkExePath: '',
    emeraldRomPath: '',
    tcpHost: '127.0.0.1',
    tcpPort: 17374,
    autoLaunchBizHawk: false,
    autoAttachBizHawk: true
  }
};

interface DatabaseShape {
  settings: Settings;
  sessions: HuntSession[];
}

export class JsonStorageService implements SessionRepository, SettingsRepository {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'storage.json');
  }

  async getSettings(): Promise<Settings> {
    const db = await this.readDb();
    return db.settings;
  }

  async saveSettings(settings: Settings): Promise<void> {
    const db = await this.readDb();
    db.settings = settings;
    await this.writeDb(db);
  }

  async saveSession(session: HuntSession): Promise<void> {
    const db = await this.readDb();
    const existingIndex = db.sessions.findIndex((entry) => entry.id === session.id);
    if (existingIndex >= 0) {
      db.sessions[existingIndex] = session;
    } else {
      db.sessions.unshift(session);
    }
    db.sessions = db.sessions.slice(0, 200);
    await this.writeDb(db);
  }

  async listSessions(): Promise<HuntSession[]> {
    const db = await this.readDb();
    return db.sessions;
  }

  private async readDb(): Promise<DatabaseShape> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseShape>;
      return {
        settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
        sessions: parsed.sessions ?? []
      };
    } catch {
      const initial: DatabaseShape = { settings: defaultSettings, sessions: [] };
      await this.writeDb(initial);
      return initial;
    }
  }

  private async writeDb(data: DatabaseShape): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

export { defaultSettings };