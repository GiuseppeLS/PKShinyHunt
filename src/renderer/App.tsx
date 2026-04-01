import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { HuntConfigPanel } from './components/HuntConfigPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useAppState } from './hooks/useAppState';
import type { EmulatorWindowInfo } from '../shared/ipc';
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
      </main>
    </div>
  );
}

