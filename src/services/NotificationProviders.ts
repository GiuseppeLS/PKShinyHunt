import type { NotificationProvider } from "../types/interfaces";
import type { HuntSession, Settings } from "../types/domain";

export class LocalDesktopNotificationProvider implements NotificationProvider {
  id = "local";
  isEnabled(): boolean { return true; }
  async sendShinyAlert(_session: HuntSession): Promise<void> {}
  async sendTestMessage(): Promise<void> {}
}

export class DiscordWebhookProvider implements NotificationProvider {
  id = "discord";
  constructor(private readonly getSettings: () => Settings) {}
  isEnabled(settings: Settings): boolean { return Boolean(settings.discordWebhookUrl); }

  async sendShinyAlert(session: HuntSession): Promise<void> {
    const url = this.getSettings().discordWebhookUrl;
    if (!url) return;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `âœ¨ Shiny found: ${session.config.targetPokemon} (${session.encounterCount})` })
    });
  }

  async sendTestMessage(): Promise<void> {
    const url = this.getSettings().discordWebhookUrl;
    if (!url) return;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "âœ… Test notification" })
    });
  }
}
