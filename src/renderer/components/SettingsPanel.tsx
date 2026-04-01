import type { Settings } from '../../types/domain';

interface Props {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  onSave: () => Promise<void>;
}

export function SettingsPanel({ settings, setSettings, onSave }: Props) {
  return (
    <section className="panel">
      <h2>Settings</h2>
      <div className="form-grid">
        <label>Discord Webhook URL
          <input value={settings.discordWebhookUrl} onChange={(e) => setSettings({ ...settings, discordWebhookUrl: e.target.value })} placeholder="https://discord.com/api/webhooks/..." />
        </label>
        <label>Screenshot Folder
          <input value={settings.screenshotFolder} onChange={(e) => setSettings({ ...settings, screenshotFolder: e.target.value })} />
        </label>
        <label>Default Game Profile ID
          <input value={settings.defaultGameProfileId} onChange={(e) => setSettings({ ...settings, defaultGameProfileId: e.target.value })} />
        </label>
      </div>
      <div className="form-grid toggles">
        <label><input type="checkbox" checked={settings.autoPauseOnShiny} onChange={(e) => setSettings({ ...settings, autoPauseOnShiny: e.target.checked })} /> Auto pause on shiny</label>
        <label><input type="checkbox" checked={settings.saveScreenshots} onChange={(e) => setSettings({ ...settings, saveScreenshots: e.target.checked })} /> Save screenshots by default</label>
      </div>
      <button onClick={onSave}>Save Settings</button>
    </section>
  );
}
