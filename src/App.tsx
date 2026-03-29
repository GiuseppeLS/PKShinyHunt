import { useEffect, useMemo, useState } from "react";
import "./App.css";
import type { HuntConfig, HuntSession, HuntStatus } from "./types";
import { loadConfig, loadSessions, saveConfig, saveSessions } from "./storage";

type Tab = "Dashboard" | "Hunt Config" | "History" | "Settings";

function newSession(config: HuntConfig): HuntSession {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    targetPokemon: config.targetPokemon,
    encounterCount: 0,
    shinyFound: false,
  };
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [config, setConfig] = useState<HuntConfig>(() => loadConfig());
  const [sessions, setSessions] = useState<HuntSession[]>(() => loadSessions());
  const [status, setStatus] = useState<HuntStatus>("idle");
  const [active, setActive] = useState<HuntSession | null>(null);
  const [lastAction, setLastAction] = useState("Idle");

  const elapsed = useMemo(() => {
    if (!active) return 0;
    return Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000);
  }, [active, status]); // status tickt ook mee via rerenders

  const persistConfig = (next: HuntConfig) => {
    setConfig(next);
    saveConfig(next);
  };

  const finalizeSession = (session: HuntSession) => {
    const next = [session, ...sessions].slice(0, 100);
    setSessions(next);
    saveSessions(next);
  };

  const start = () => {
    const s = newSession(config);
    setActive(s);
    setStatus("hunting");
    setLastAction("Entered grass");
  };

  const stop = () => {
    if (!active) return;
    const ended = {
      ...active,
      endedAt: new Date().toISOString(),
      endedReason: "manual" as const,
    };
    finalizeSession(ended);
    setActive(null);
    setStatus("idle");
    setLastAction("Stopped manually");
  };

  const forceShiny = () => {
    if (!active) return;
    const shiny = {
      ...active,
      shinyFound: true,
      endedAt: new Date().toISOString(),
      endedReason: "shiny" as const,
    };
    finalizeSession(shiny);
    setActive(null);
    setStatus("shiny_found");
    setLastAction("✨ Force shiny triggered");
  };

  // Mock hunt loop: encounter -> shiny check -> flee -> repeat
  useEffect(() => {
    if (status !== "hunting" || !active) return;

    const id = setInterval(() => {
      setActive((prev) => {
        if (!prev) return prev;

        const nextCount = prev.encounterCount + 1;
        const isShiny = Math.floor(Math.random() * config.shinyChance) === 0;

        if (isShiny) {
          const shinySession: HuntSession = {
            ...prev,
            encounterCount: nextCount,
            shinyFound: true,
            endedAt: new Date().toISOString(),
            endedReason: "shiny",
          };

          finalizeSession(shinySession);
          setStatus("shiny_found");
          setLastAction(`✨ Shiny found at encounter #${nextCount}`);
          if (config.autoPauseOnShiny) {
            return null;
          }
          return shinySession;
        }

        if (config.autoFleeNonShiny) {
          setLastAction(`Encounter #${nextCount}: non-shiny -> flee`);
        } else {
          setLastAction(`Encounter #${nextCount}: non-shiny`);
        }

        return {
          ...prev,
          encounterCount: nextCount,
        };
      });
    }, Math.max(300, config.encounterIntervalMs));

    return () => clearInterval(id);
  }, [status, active, config]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Pokemon Shiny Hunt Assistant</h1>
        {(["Dashboard", "Hunt Config", "History", "Settings"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </aside>

      <main className="main">
        {tab === "Dashboard" && (
          <section className="panel">
            <h2>Dashboard</h2>
            <div className="grid4">
              <Card label="Status" value={status} />
              <Card label="Encounters" value={String(active?.encounterCount ?? 0)} />
              <Card label="Elapsed" value={`${elapsed}s`} />
              <Card label="Target" value={config.targetPokemon} />
            </div>
            <div className="row">
              <button onClick={start}>Start Hunt</button>
              <button onClick={stop}>Stop Hunt</button>
              <button onClick={forceShiny}>Force Shiny</button>
            </div>
            <p style={{ marginTop: 12, opacity: 0.9 }}>Last action: {lastAction}</p>
          </section>
        )}

        {tab === "Hunt Config" && (
          <section className="panel">
            <h2>Hunt Config</h2>
            <label>
              Target Pokemon
              <input value={config.targetPokemon} onChange={(e) => persistConfig({ ...config, targetPokemon: e.target.value })} />
            </label>
            <label>
              Game Profile
              <input value={config.gameProfile} onChange={(e) => persistConfig({ ...config, gameProfile: e.target.value })} />
            </label>
            <label>
              Hunt Mode
              <select value={config.huntMode} onChange={(e) => persistConfig({ ...config, huntMode: e.target.value as HuntConfig["huntMode"] })}>
                <option value="random_encounters">Random Encounters</option>
                <option value="soft_reset">Soft Reset</option>
                <option value="static_encounter">Static Encounter</option>
              </select>
            </label>

            <label>
              Encounter interval (ms)
              <input
                type="number"
                value={config.encounterIntervalMs}
                onChange={(e) => persistConfig({ ...config, encounterIntervalMs: Number(e.target.value || 1200) })}
              />
            </label>

            <label>
              Shiny chance (1 op X)
              <input
                type="number"
                value={config.shinyChance}
                onChange={(e) => persistConfig({ ...config, shinyChance: Math.max(2, Number(e.target.value || 4096)) })}
              />
            </label>
          </section>
        )}

        {tab === "History" && (
          <section className="panel">
            <h2>History</h2>
            {sessions.length === 0 && <p>Geen sessies nog.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="historyItem">
                <strong>{new Date(s.startedAt).toLocaleString()}</strong>
                <span>{s.targetPokemon}</span>
                <span>{s.encounterCount} encounters</span>
                <span>{s.shinyFound ? "✨ shiny" : "no shiny"}</span>
              </div>
            ))}
          </section>
        )}

        {tab === "Settings" && (
          <section className="panel">
            <h2>Settings</h2>
            <label>
              <input
                type="checkbox"
                checked={config.autoFleeNonShiny}
                onChange={(e) => persistConfig({ ...config, autoFleeNonShiny: e.target.checked })}
              />{" "}
              Auto flee non-shiny
            </label>
            <label>
              <input
                type="checkbox"
                checked={config.autoPauseOnShiny}
                onChange={(e) => persistConfig({ ...config, autoPauseOnShiny: e.target.checked })}
              />{" "}
              Auto pause on shiny
            </label>
            <label>
              <input
                type="checkbox"
                checked={config.discordEnabled}
                onChange={(e) => persistConfig({ ...config, discordEnabled: e.target.checked })}
              />{" "}
              Discord enabled
            </label>
            <label>
              Discord webhook URL
              <input
                value={config.discordWebhookUrl}
                onChange={(e) => persistConfig({ ...config, discordWebhookUrl: e.target.value })}
              />
            </label>
          </section>
        )}
      </main>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}