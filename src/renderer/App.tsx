import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { HuntConfigPanel } from "./components/HuntConfigPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useAppState } from "./hooks/useAppState";
import type { HuntConfig } from "../types/domain";

export function App() {
  const { ready, initError, settings, setSettings, profiles, sessions, state, activeConfig, refreshSessions } =
    useAppState();

  const [tab, setTab] = useState("Dashboard");
  const [config, setConfig] = useState<HuntConfig>(activeConfig);

  useEffect(() => {
    setConfig(activeConfig);
  }, [activeConfig]);

  if (!ready) return <div className="loading">Loading Pokemon Shiny Hunt Assistant...</div>;
  if (!settings) return <div className="loading">App kon niet starten. {initError}</div>;

  const run = async (fn: () => Promise<unknown>) => {
    await fn();
  };

  return (
    <div className="layout">
      <Sidebar tab={tab} setTab={setTab} />
      <main>
        {initError && <div className="error-banner">⚠ {initError}</div>}

        {tab === "Dashboard" && (
          <Dashboard
            state={state}
            onStart={() => run(async () => window.electronApi.startHunt(config))}
            onStop={() =>
              run(async () => {
                await window.electronApi.stopHunt();
                await refreshSessions();
              })
            }
            onReset={() => run(async () => window.electronApi.resetSession())}
            onForceShiny={() =>
              run(async () => {
                await window.electronApi.forceShiny();
                await refreshSessions();
              })
            }
            onTestNotification={() => run(async () => window.electronApi.testNotification())}
          />
        )}

        {tab === "Hunt Config" && <HuntConfigPanel config={config} setConfig={setConfig} profiles={profiles} />}
        {tab === "History" && <HistoryPanel sessions={sessions} />}
        {tab === "Settings" && (
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            onSave={async () => {
              await window.electronApi.saveSettings(settings);
            }}
          />
        )}
      </main>
    </div>
  );
}