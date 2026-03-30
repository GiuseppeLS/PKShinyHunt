import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { HuntConfigPanel } from './components/HuntConfigPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useAppState } from './hooks/useAppState';
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

  useEffect(() => {
    setConfig(activeConfig);
  }, [activeConfig]);

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
    if (!window.electronApi) return;
    await action();
  };

  const onStart = async () => {
    await withApi(async () => window.electronApi.startHunt(config));
  };

  const onStop = async () => {
    await withApi(async () => {
      await window.electronApi.stopHunt();
      await refreshSessions();
    });
  };

  const onReset = async () => {
    await withApi(async () => window.electronApi.resetSession());
  };

  const onForceShiny = async () => {
    await withApi(async () => {
      await window.electronApi.forceShiny();
      await refreshSessions();
    });
  };

  const onSaveSettings = async () => {
    await withApi(async () => window.electronApi.saveSettings(settings));
  };

  const onTestNotification = async () => {
    await withApi(async () => window.electronApi.testNotification());
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