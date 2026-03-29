import type { HuntState } from "../../types/domain";
interface P { state: HuntState; onStart: () => Promise<void>; onStop: () => Promise<void>; onReset: () => Promise<void>; onForceShiny: () => Promise<void>; onTestNotification: () => Promise<void>; }
export function Dashboard({ state, onStart, onStop, onReset, onForceShiny, onTestNotification }: P) {
  const s = state.activeSession;
  return (
    <section className="panel">
      <h2>Dashboard</h2>
      <div className="badge-row"><span className={`badge ${state.status}`}>{state.status}</span></div>
      <div className="metrics-grid">
        <div className="card"><p>Encounters</p><strong>{s?.encounterCount ?? 0}</strong></div>
        <div className="card"><p>Elapsed</p><strong>{Math.floor(state.elapsedMs / 1000)}s</strong></div>
        <div className="card"><p>Target</p><strong>{s?.config.targetPokemon ?? "-"}</strong></div>
        <div className="card"><p>Profile</p><strong>{s?.config.gameProfileId ?? "-"}</strong></div>
      </div>
      <div className="actions">
        <button onClick={onStart}>Start Hunt</button>
        <button onClick={onStop}>Stop Hunt</button>
        <button onClick={onReset}>Reset Session</button>
        <button onClick={onForceShiny}>Force Shiny</button>
        <button onClick={onTestNotification}>Test Notification</button>
      </div>
    </section>
  );
}
