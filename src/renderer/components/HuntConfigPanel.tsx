import type { GameProfile, HuntConfig } from "../../types/domain";
interface P { config: HuntConfig; setConfig: (c: HuntConfig) => void; profiles: GameProfile[]; }
export function HuntConfigPanel({ config, setConfig, profiles }: P) {
  return (
    <section className="panel">
      <h2>Hunt Configuration</h2>
      <div className="form-grid">
        <label>Target Pokemon<input value={config.targetPokemon} onChange={(e) => setConfig({ ...config, targetPokemon: e.target.value })} /></label>
        <label>Game Profile<select value={config.gameProfileId} onChange={(e) => setConfig({ ...config, gameProfileId: e.target.value })}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Hunt Mode<select value={config.huntMode} onChange={(e) => setConfig({ ...config, huntMode: e.target.value as HuntConfig["huntMode"] })}><option value="random_encounters">Random Encounters</option><option value="soft_reset">Soft Reset</option><option value="static_encounter">Static Encounter</option></select></label>
        <label>Emulator Adapter<select value={config.emulatorAdapterId} onChange={(e) => setConfig({ ...config, emulatorAdapterId: e.target.value })}><option value="mock">Mock</option><option value="azahar">Azahar</option><option value="citra">Citra</option></select></label>
      </div>
    </section>
  );
}
