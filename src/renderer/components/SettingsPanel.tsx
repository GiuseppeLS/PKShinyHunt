import type { Settings } from "../../types/domain";
interface P { settings: Settings; setSettings: (s: Settings) => void; onSave: () => Promise<void>; }
export function SettingsPanel({ settings, setSettings, onSave }: P) {
  return (
    <section className="panel">
      <h2>Settings</h2>
      <div className="form-grid">
        <label>Discord Webhook URL<input value={settings.discordWebhookUrl} onChange={(e) => setSettings({ ...settings, discordWebhookUrl: e.target.value })} /></label>
        <label>Screenshot Folder<input value={settings.screenshotFolder} onChange={(e) => setSettings({ ...settings, screenshotFolder: e.target.value })} /></label>
        <label>Default Profile<input value={settings.defaultGameProfileId} onChange={(e) => setSettings({ ...settings, defaultGameProfileId: e.target.value })} /></label>
      </div>
      <button onClick={onSave}>Save Settings</button>
    </section>
  );
}
