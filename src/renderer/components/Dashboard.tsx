import type { EmulatorWindowInfo } from '../../shared/ipc';
import type { HuntState } from '../../types/domain';

interface DashboardProps {
  state: HuntState;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onReset: () => Promise<void>;
  onForceShiny: () => Promise<void>;
  onTestNotification: () => Promise<void>;
  emulatorWindows: EmulatorWindowInfo[];
  selectedEmulatorId: string;
  onSelectEmulator: (sourceId: string) => void;
  onRefreshEmulators: () => Promise<void>;
  onAttachEmulator: () => Promise<void>;
  onDetachEmulator: () => Promise<void>;
  onStartPreview: () => Promise<void>;
  onStopPreview: () => Promise<void>;
  onSavePreview: () => Promise<void>;
  previewDataUrl: string | null;
  emulatorLog: string;
}

export function Dashboard({
  state,
  onStart,
  onStop,
  onReset,
  onForceShiny,
  onTestNotification,
  emulatorWindows,
  selectedEmulatorId,
  onSelectEmulator,
  onRefreshEmulators,
  onAttachEmulator,
  onDetachEmulator,
  onStartPreview,
  onStopPreview,
  onSavePreview,
  previewDataUrl,
  emulatorLog
}: DashboardProps) {
  const session = state.activeSession;
  const seconds = Math.floor(state.elapsedMs / 1000);
  return (
    <section className="panel">
      <h2>Dashboard</h2>
      <div className="badge-row">
        <span className={`badge ${state.status}`}>{state.status.replace(/_/g, ' ')}</span>
      </div>
      <div className="metrics-grid">
        <div className="card"><p>Encounters</p><strong>{session?.encounterCount ?? 0}</strong></div>
        <div className="card"><p>Elapsed</p><strong>{seconds}s</strong></div>
        <div className="card"><p>Target</p><strong>{session?.config.targetPokemon ?? '-'}</strong></div>
        <div className="card"><p>Profile</p><strong>{session?.config.gameProfileId ?? '-'}</strong></div>
      </div>
      <div className="actions">
        <button onClick={onStart}>Start Hunt</button>
        <button onClick={onStop}>Stop Hunt</button>
        <button onClick={onReset}>Reset Session</button>
        <button onClick={onForceShiny}>Force Shiny</button>
        <button onClick={onTestNotification}>Test Notification</button>
      </div>

      <h3 style={{ marginTop: 24 }}>BizHawk Bridge Connection</h3>
      <div className="form-grid">
        <label>
          Detected BizHawk windows
          <select value={selectedEmulatorId} onChange={(e) => onSelectEmulator(e.target.value)}>
            <option value="">Select BizHawk window...</option>
            {emulatorWindows.map((window) => (
              <option key={window.id} value={window.id}>
                {window.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="actions">
        <button onClick={onRefreshEmulators}>Refresh Windows</button>
        <button onClick={onAttachEmulator} disabled={!selectedEmulatorId}>Attach</button>
        <button onClick={onDetachEmulator}>Detach</button>
        <button onClick={onStartPreview} disabled={!selectedEmulatorId}>Start Preview</button>
        <button onClick={onStopPreview}>Stop Preview</button>
        <button onClick={onSavePreview}>Save Frame</button>
      </div>

      <p style={{ marginTop: 10, opacity: 0.9 }}>Emulator Log: {emulatorLog}</p>

      <div className="preview-box">
        {!previewDataUrl && <p>No preview frame yet. Attach and start preview.</p>}
        {previewDataUrl && <img src={previewDataUrl} alt="BizHawk preview frame" />}
      </div>
    </section>
  );
}