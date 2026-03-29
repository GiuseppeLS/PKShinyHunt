import { useState } from "react";
import type { HuntSession } from "../../types/domain";
export function HistoryPanel({ sessions }: { sessions: HuntSession[] }) {
  const [selected, setSelected] = useState<HuntSession | null>(null);
  return (
    <section className="panel">
      <h2>Session History</h2>
      <div className="history-grid">
        <div className="history-list">
          {sessions.map((s) => <button key={s.id} onClick={() => setSelected(s)}><span>{new Date(s.startedAt).toLocaleString()}</span><strong>{s.config.targetPokemon}</strong><span>{s.encounterCount} encounters</span><span>{s.shinyFound ? "âœ¨ Shiny" : "No shiny"}</span></button>)}
        </div>
        <div className="history-detail">{selected ? <><h3>{selected.config.targetPokemon}</h3><p>Started: {new Date(selected.startedAt).toLocaleString()}</p><p>Ended: {selected.endedAt ? new Date(selected.endedAt).toLocaleString() : "active"}</p></> : <p>Select a session.</p>}</div>
      </div>
    </section>
  );
}
