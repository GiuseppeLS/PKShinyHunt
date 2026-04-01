import { useState } from 'react';
import type { HuntSession } from '../../types/domain';

export function HistoryPanel({ sessions }: { sessions: HuntSession[] }) {
  const [selected, setSelected] = useState<HuntSession | null>(null);
  return (
    <section className="panel">
      <h2>Session History</h2>
      <div className="history-grid">
        <div className="history-list">
          {sessions.map((session) => (
            <button key={session.id} onClick={() => setSelected(session)}>
              <span>{new Date(session.startedAt).toLocaleString()}</span>
              <strong>{session.config.targetPokemon}</strong>
              <span>{session.encounterCount} encounters</span>
              <span>{session.shinyFound ? '✨ Shiny' : 'No shiny'}</span>
            </button>
          ))}
          {sessions.length === 0 && <p>No hunt sessions yet.</p>}
        </div>
        <div className="history-detail">
          {!selected && <p>Select a session to inspect details.</p>}
          {selected && (
            <>
              <h3>{selected.config.targetPokemon}</h3>
              <p>Started: {new Date(selected.startedAt).toLocaleString()}</p>
              <p>Ended: {selected.endedAt ? new Date(selected.endedAt).toLocaleString() : 'active'}</p>
              <p>Mode: {selected.config.huntMode}</p>
              <p>Result: {selected.shinyFound ? 'Shiny found' : 'No shiny found'}</p>
              <p>Screenshot: {selected.screenshotPath ?? '-'}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}