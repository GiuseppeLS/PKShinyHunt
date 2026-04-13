import type { GameProfile, HuntConfig } from '../../types/domain';

interface Props {
  config: HuntConfig;
  setConfig: (config: HuntConfig) => void;
  profiles: GameProfile[];
}

export function HuntConfigPanel({ config, setConfig, profiles }: Props) {
  return (
    <section className="panel">
      <h2>Hunt Configuration</h2>
      <div className="form-grid">
        <label>Target Pokemon<input value={config.targetPokemon} onChange={(e) => setConfig({ ...config, targetPokemon: e.target.value })} /></label>
        <label>Game Profile
          <select value={config.gameProfileId} onChange={(e) => setConfig({ ...config, gameProfileId: e.target.value })}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <label>Hunt Mode
          <select value={config.huntMode} onChange={(e) => setConfig({ ...config, huntMode: e.target.value as HuntConfig['huntMode'] })}>
            <option value="random_encounters">Random Encounters</option>
            <option value="soft_reset">Soft Reset</option>
            <option value="static_encounter">Static Encounter</option>
          </select>
        </label>
        <label>Emulator Adapter
          <select value={config.emulatorAdapterId} onChange={(e) => setConfig({ ...config, emulatorAdapterId: e.target.value })}>
            <option value="bizhawk">BizHawkAdapter (Pokemon Emerald)</option>
            <option value="mock">MockEmulatorAdapter</option>
          </select>
        </label>
      </div>
      <div className="form-grid toggles">
        <label><input type="checkbox" checked={config.saveScreenshots} onChange={(e) => setConfig({ ...config, saveScreenshots: e.target.checked })} /> Save screenshots</label>
        <label><input type="checkbox" checked={config.autoPauseOnShiny} onChange={(e) => setConfig({ ...config, autoPauseOnShiny: e.target.checked })} /> Auto-pause on shiny</label>
        <label><input type="checkbox" checked={config.enableDiscordNotifications} onChange={(e) => setConfig({ ...config, enableDiscordNotifications: e.target.checked })} /> Enable Discord notifications</label>
      </div>
    </section>
  );
}