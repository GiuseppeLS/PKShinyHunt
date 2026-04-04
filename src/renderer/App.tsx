import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { HuntConfigPanel } from './components/HuntConfigPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useAppState } from './hooks/useAppState';
import type { AzaharDiagnosticPayload, EmulatorWindowInfo } from '../shared/ipc';
import type { HuntConfig } from '../types/domain';

export function App() {
  const {
    ready,
    initError,
    settings,
    setSettings,
    profiles,
    sessions,
    state,
    activeConfig,
    refreshSessions
  } = useAppState();

  const [tab, setTab] = useState('Dashboard');
  const [config, setConfig] = useState<HuntConfig>(activeConfig);
  const [emulatorWindows, setEmulatorWindows] = useState<EmulatorWindowInfo[]>([]);
  const [selectedEmulatorId, setSelectedEmulatorId] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [emulatorLog, setEmulatorLog] = useState('Idle');
  const [diagnostics, setDiagnostics] = useState<AzaharDiagnosticPayload | null>(null);
  const [diagnosticChangeLog, setDiagnosticChangeLog] = useState<Array<{ key: string; before: unknown; after: unknown; at: string; idleOverworld: boolean }>>([]);
  const [unstableFields, setUnstableFields] = useState<string[]>([]);

  useEffect(() => {
    setConfig(activeConfig);
  }, [activeConfig]);

  useEffect(() => {
    if (!window.electronApi) {
      return;
    }

    const unsubscribe = window.electronApi.subscribeEmulatorPreview((frame) => {
      setPreviewDataUrl(frame.dataUrl);
      setEmulatorLog(`Preview frame captured at ${new Date(frame.capturedAt).toLocaleTimeString()}`);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!window.electronApi) {
      return;
    }

    let cancelled = false;
    let previousValues: Record<string, unknown> = {};
    const idleInstabilityCounter = new Map<string, number>();

    const pollDiagnostics = async () => {
      try {
        const payload = await window.electronApi.pollAzaharDiagnostics();
        if (cancelled) {
          return;
        }

        const nextValues: Record<string, unknown> = {
          ...payload.raw.memory,
          ...payload.raw.status
        };
        const idleOverworld = payload.derived.inBattle === false
          && payload.derived.commandMenuVisible === false
          && payload.derived.canRun === false;

        const changes: Array<{ key: string; before: unknown; after: unknown; at: string; idleOverworld: boolean }> = [];
        for (const [key, value] of Object.entries(nextValues)) {
          if (!(key in previousValues)) {
            continue;
          }

          if (previousValues[key] !== value) {
            changes.push({ key, before: previousValues[key], after: value, at: payload.polledAt, idleOverworld });
            if (idleOverworld) {
              idleInstabilityCounter.set(key, (idleInstabilityCounter.get(key) ?? 0) + 1);
            }
          }
        }

        if (changes.length > 0) {
          setDiagnosticChangeLog((prev) => [...changes, ...prev].slice(0, 30));
        }

        const unstable = Array.from(idleInstabilityCounter.entries())
          .filter(([, count]) => count >= 3)
          .map(([key]) => key)
          .sort();

        setUnstableFields(unstable);
        previousValues = nextValues;
        setDiagnostics(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDiagnostics({
          polledAt: new Date().toISOString(),
          connected: false,
          rpcConnected: false,
          lastError: message,
          derived: {
            inBattle: false,
            commandMenuVisible: false,
            canRun: false,
            encounteredSpeciesId: null,
            isShiny: null,
            state: 'ERROR'
          },
          raw: {
            status: {},
            memory: {}
          },
          fields: []
        });
      }
    };

    void pollDiagnostics();
    const interval = window.setInterval(() => {
      void pollDiagnostics();
    }, 700);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const expectedFields = ['battleFlag', 'menuFlag', 'runFlag', 'speciesId', 'shinyValue'];
  const missingFields = expectedFields.filter((field) => diagnostics?.raw.memory[field] === undefined);
  const likelyIncorrectFields = [
    ...(diagnostics?.derived.encounteredSpeciesId !== null && (diagnostics?.derived.encounteredSpeciesId ?? 0) < 0 ? ['encounteredSpeciesId(<0)'] : []),
    ...(diagnostics?.derived.isShiny === true && !diagnostics?.derived.inBattle ? ['isShiny=true while not in battle'] : [])
  ];
  const backendSummary = !diagnostics?.connected || !diagnostics?.rpcConnected || unstableFields.length > 0 || missingFields.length > 0 || likelyIncorrectFields.length > 0
    ? 'backend unstable'
    : 'backend stable';

  if (!ready) {
    return <div className="loading">Loading Pokemon Shiny Hunt Assistant...</div>;
  }

  if (!settings) {
    return (
      <div className="loading">
        <div>
          <strong>App kon niet starten.</strong>
          <p>{initError ?? 'Settings ontbreken.'}</p>
        </div>
      </div>
    );
  }

  const withApi = async (action: () => Promise<void>) => {
    if (!window.electronApi) {
      setEmulatorLog('Electron API missing. Check preload/main wiring.');
      return;
    }

    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown operation error';
      setEmulatorLog(message);
    }
  };

  const onStart = async () => {
    await withApi(async () => {
      await window.electronApi.startHunt(config);
    });
  };

  const onStop = async () => {
    await withApi(async () => {
      await window.electronApi.stopHunt();
      await refreshSessions();
    });
  };

  const onReset = async () => {
    await withApi(async () => {
      await window.electronApi.resetSession();
    });
  };

  const onForceShiny = async () => {
    await withApi(async () => {
      await window.electronApi.forceShiny();
      await refreshSessions();
    });
  };

  const onSaveSettings = async () => {
    await withApi(async () => {
      await window.electronApi.saveSettings(settings);
    });
  };

  const onTestNotification = async () => {
    await withApi(async () => {
      await window.electronApi.testNotification();
    });
  };

  const onRefreshEmulators = async () => {
    await withApi(async () => {
      const windows = await window.electronApi.listEmulatorWindows();
      setEmulatorWindows(windows);
      setEmulatorLog(`Detected ${windows.length} Citra window(s).`);
      if (!selectedEmulatorId && windows[0]) {
        setSelectedEmulatorId(windows[0].id);
      }
    });
  };

  const onAttachEmulator = async () => {
    await withApi(async () => {
      if (!selectedEmulatorId) {
        setEmulatorLog('Select a Citra window first.');
        return;
      }

      const result = await window.electronApi.attachEmulatorWindow(selectedEmulatorId);
      setEmulatorLog(result.attached ? `Attached to ${result.sourceId}` : 'Attach failed');
    });
  };

  const onDetachEmulator = async () => {
    await withApi(async () => {
      await window.electronApi.detachEmulatorWindow();
      await window.electronApi.stopEmulatorPreview();
      setPreviewDataUrl(null);
      setEmulatorLog('Detached from emulator window.');
    });
  };

  const onStartPreview = async () => {
    await withApi(async () => {
      await window.electronApi.startEmulatorPreview();
      setEmulatorLog('Preview started.');
    });
  };

  const onStopPreview = async () => {
    await withApi(async () => {
      await window.electronApi.stopEmulatorPreview();
      setEmulatorLog('Preview stopped.');
    });
  };

  const onSavePreview = async () => {
    await withApi(async () => {
      const result = await window.electronApi.saveCurrentPreviewFrame();
      setEmulatorLog(result.saved ? `Saved frame: ${result.filePath}` : 'No frame available to save.');
    });
  };

  return (
    <div className="layout">
      <Sidebar tab={tab} setTab={setTab} />
      <main>
        {initError && <div className="error-banner">⚠ {initError}</div>}

        {tab === 'Dashboard' && (
          <Dashboard
            state={state}
            onStart={onStart}
            onStop={onStop}
            onReset={onReset}
            onForceShiny={onForceShiny}
            onTestNotification={onTestNotification}
            emulatorWindows={emulatorWindows}
            selectedEmulatorId={selectedEmulatorId}
            onSelectEmulator={setSelectedEmulatorId}
            onRefreshEmulators={onRefreshEmulators}
            onAttachEmulator={onAttachEmulator}
            onDetachEmulator={onDetachEmulator}
            onStartPreview={onStartPreview}
            onStopPreview={onStopPreview}
            onSavePreview={onSavePreview}
            previewDataUrl={previewDataUrl}
            emulatorLog={emulatorLog}
          />
        )}
        {tab === 'Hunt Config' && <HuntConfigPanel config={config} setConfig={setConfig} profiles={profiles} />}
        {tab === 'History' && <HistoryPanel sessions={sessions} />}
        {tab === 'Settings' && (
          <SettingsPanel settings={settings} setSettings={setSettings} onSave={onSaveSettings} />
        )}
        {tab === 'Azahar Diagnostics' && (
          <section className="panel">
            <h2>Azahar Raw RPC Diagnostics</h2>
            <p className="diag-line">Connection status: <strong>{diagnostics?.connected ? 'connected' : 'disconnected'}</strong></p>
            <p className="diag-line">RPC connected: <strong>{diagnostics?.rpcConnected ? 'yes' : 'no'}</strong></p>
            <p className="diag-line">Polled at: <strong>{diagnostics?.polledAt ? new Date(diagnostics.polledAt).toLocaleTimeString() : '-'}</strong></p>
            <p className="diag-line">Last error: <strong>{diagnostics?.lastError ?? 'none'}</strong></p>
            <p className="diag-line">Summary: <strong>{backendSummary}</strong></p>

            <h3>Derived fields</h3>
            <pre className="diag-pre">{JSON.stringify(diagnostics?.derived ?? {}, null, 2)}</pre>
            <h3>Raw memory fields</h3>
            <pre className="diag-pre">{JSON.stringify(diagnostics?.raw.memory ?? {}, null, 2)}</pre>
            <h3>Raw status fields</h3>
            <pre className="diag-pre">{JSON.stringify(diagnostics?.raw.status ?? {}, null, 2)}</pre>

            <h3>Address labels + source</h3>
            <pre className="diag-pre">{JSON.stringify(diagnostics?.fields ?? [], null, 2)}</pre>

            <h3>Change log (latest 30)</h3>
            <pre className="diag-pre">{JSON.stringify(diagnosticChangeLog, null, 2)}</pre>

            <h3>Checks</h3>
            <ul>
              <li>fields missing: {missingFields.length ? missingFields.join(', ') : 'none'}</li>
              <li>fields unstable while idle: {unstableFields.length ? unstableFields.join(', ') : 'none'}</li>
              <li>fields likely incorrect: {likelyIncorrectFields.length ? likelyIncorrectFields.join(', ') : 'none'}</li>
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}