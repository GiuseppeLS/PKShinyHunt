import fs from 'node:fs/promises';
import path from 'node:path';
import { Notification } from 'electron';
import type { HuntSession, Settings } from '../types/domain';
import type { NotificationProvider } from '../types/interfaces';

export class LocalDesktopNotificationProvider implements NotificationProvider {
  id = 'local';

  isEnabled(): boolean {
    return true;
  }

  async sendShinyAlert(session: HuntSession): Promise<void> {
    if (!Notification.isSupported()) {
      return;
    }

    const body = `${session.config.targetPokemon} found after ${session.encounterCount} encounters.`;
    new Notification({ title: '✨ Shiny found!', body }).show();
  }

  async sendTestMessage(): Promise<void> {
    if (!Notification.isSupported()) {
      return;
    }

    new Notification({ title: 'Pokemon Shiny Hunt Assistant', body: 'Test notification succeeded.' }).show();
  }
}

export class DiscordWebhookProvider implements NotificationProvider {
  id = 'discord';

  constructor(private readonly getSettings: () => Settings) {}

  isEnabled(settings: Settings): boolean {
    return Boolean(settings.discordWebhookUrl);
  }

  async sendShinyAlert(session: HuntSession): Promise<void> {
    const settings = this.getSettings();
    const webhookUrl = settings.discordWebhookUrl;
    if (!webhookUrl) {
      throw new Error('Discord webhook URL is missing.');
    }

    const message = {
      username: 'Pokemon Shiny Hunt Assistant',
      content: [
        '✨ **SHINY FOUND!**',
        `Pokemon: **${session.shinyEncounter?.pokemonName ?? session.config.targetPokemon}**`,
        `Encounter Count: **${session.encounterCount}**`,
        `Hunt Mode: **${session.config.huntMode}**`,
        `Profile: **${session.config.gameProfileId}**`,
        `Timestamp: **${new Date().toISOString()}**`
      ].join('\n')
    };

    if (session.screenshotPath) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(message));
      const buffer = await fs.readFile(session.screenshotPath);
      form.append('file', new Blob([buffer]), path.basename(session.screenshotPath));
      const response = await fetch(webhookUrl, { method: 'POST', body: form });
      if (!response.ok) {
        throw new Error(`Discord webhook failed with status ${response.status}`);
      }
      return;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed with status ${response.status}`);
    }
  }

  async sendTestMessage(): Promise<void> {
    const settings = this.getSettings();
    if (!settings.discordWebhookUrl) {
      throw new Error('Discord webhook URL is missing.');
    }

    const response = await fetch(settings.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Pokemon Shiny Hunt Assistant',
        content: '✅ Test notification from Pokemon Shiny Hunt Assistant.'
      })
    });

    if (!response.ok) {
      throw new Error(`Discord webhook test failed with status ${response.status}`);
    }
  }
}

