import { useMemo } from 'react';
import type { AzaharDiagnosticPayload } from '../../shared/ipc';

interface DiagnosticChange {
  key: string;
  before: unknown;
  after: unknown;
  at: string;
  idleOverworld: boolean;
}

interface AzaharDiagnosticsPanelProps {
  payload: AzaharDiagnosticPayload | null;
  changeLog: DiagnosticChange[];
  unstableFields: string[];
  missingFields: string[];
  likelyIncorrectFields: string[];
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AzaharDiagnosticsPanel({
  payload,
  changeLog,
  unstableFields,
  missingFields,
  likelyIncorrectFields
}: AzaharDiagnosticsPanelProps) {
  const statusSummary = useMemo(() => {
    if (!payload?.connected || !payload.rpcConnected) {
      return 'backend unstable';
    }

    if (unstableFields.length > 0 || missingFields.length > 0 || likelyIncorrectFields.length > 0) {
      return 'backend unstable';
    }

    return 'backend stable';
  }, [likelyIncorrectFields.length, missingFields.length, payload?.connected, payload?.rpcConnected, unstableFields.length]);

  return (
    <section className="panel">
      <h2>Azahar Raw RPC Diagnostics</h2>
      <p className="diag-line">Connection status: <strong>{payload?.connected ? 'connected' : 'disconnected'}</strong></p>
      <p className="diag-line">RPC connected: <strong>{payload?.rpcConnected ? 'yes' : 'no'}</strong></p>
      <p className="diag-line">Polled at: <strong>{payload?.polledAt ? new Date(payload.polledAt).toLocaleTimeString() : '-'}</strong></p>
      <p className="diag-line">Last error: <strong>{payload?.lastError ?? 'none'}</strong></p>

      <h3>Derived backend state</h3>
      <div className="diag-grid">
        <div className="card"><p>inBattle</p><strong>{String(payload?.derived.inBattle ?? false)}</strong></div>
        <div className="card"><p>commandMenuVisible</p><strong>{String(payload?.derived.commandMenuVisible ?? false)}</strong></div>
        <div className="card"><p>canRun</p><strong>{String(payload?.derived.canRun ?? false)}</strong></div>
        <div className="card"><p>encounteredSpeciesId</p><strong>{String(payload?.derived.encounteredSpeciesId ?? null)}</strong></div>
        <div className="card"><p>isShiny</p><strong>{String(payload?.derived.isShiny ?? null)}</strong></div>
        <div className="card"><p>state</p><strong>{payload?.derived.state ?? '-'}</strong></div>
        <div className="card"><p>backendStatus</p><strong>{payload?.derived.backendStatus ?? '-'}</strong></div>
        <div className="card"><p>stateReason</p><strong>{payload?.derived.stateReason ?? '-'}</strong></div>
      </div>

      <h3>Raw memory fields (from Azahar)</h3>
      <div className="diag-table">
        <div><strong>field</strong></div>
        <div><strong>value</strong></div>
        <div><strong>address label</strong></div>
        <div><strong>address</strong></div>
        <div><strong>source</strong></div>
        {(payload?.fields ?? []).map((field) => (
          <div key={field.key} className="diag-row">
            <div>{field.key}</div>
            <div>{formatValue(field.value)}</div>
            <div>{field.addressLabel}</div>
            <div>{field.addressHex}</div>
            <div>{field.source}</div>
          </div>
        ))}
      </div>

      <h3>Raw status payload</h3>
      <pre className="diag-pre">{JSON.stringify(payload?.raw.status ?? {}, null, 2)}</pre>

      <h3>State reasoning payload</h3>
      <pre className="diag-pre">{JSON.stringify(payload?.raw.reasoning ?? {}, null, 2)}</pre>

      <h3>Memory-map notes</h3>
      <pre className="diag-pre">{JSON.stringify(payload?.raw.mapNotes ?? [], null, 2)}</pre>

      <h3>Change log (latest 30)</h3>
      <div className="history-list">
        {changeLog.length === 0 && <p>No value changes captured yet.</p>}
        {changeLog.map((entry, index) => (
          <div key={`${entry.key}-${entry.at}-${index}`} className="history-detail">
            <strong>{entry.key}</strong>
            <p>{new Date(entry.at).toLocaleTimeString()} | {entry.idleOverworld ? 'idle-overworld' : 'active-state'}</p>
            <p>{formatValue(entry.before)} → {formatValue(entry.after)}</p>
          </div>
        ))}
      </div>

      <h3>Summary</h3>
      <ul>
        <li>{statusSummary}</li>
        <li>fields missing: {missingFields.length ? missingFields.join(', ') : 'none'}</li>
        <li>fields unstable while idle: {unstableFields.length ? unstableFields.join(', ') : 'none'}</li>
        <li>fields likely incorrect: {likelyIncorrectFields.length ? likelyIncorrectFields.join(', ') : 'none'}</li>
      </ul>
    </section>
  );
}