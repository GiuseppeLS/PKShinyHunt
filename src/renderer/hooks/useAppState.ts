import { useEffect, useMemo, useState } from "react";
import type { AppInitPayload } from "../../shared/ipc";
import type { GameProfile, HuntConfig, HuntSession, HuntState, Settings } from "../../types/domain";

export function useAppState() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [sessions, setSessions] = useState<HuntSession[]>([]);
  const [state, setState] = useState<HuntState>({ status: "idle", activeSession: null, elapsedMs: 0 });

  useEffect(() => {
    let unsub: (() => void) | null = null;
    const init = async () => {
      try {
        const payload: AppInitPayload = await window.electronApi.init();
        setSettings(payload.settings);
        setProfiles(payload.profiles);
        setSessions(payload.sessions);
        setState(payload.state);
        unsub = window.electronApi.subscribeState((next) => setState(next));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Onbekende fout";
        setInitError(msg);
      } finally {
        setReady(true);
      }
    };
    void init();
    return () => { unsub?.(); };
  }, []);

  const activeConfig = useMemo<HuntConfig>(() => {
    const defaultProfile = profiles[0]?.id ?? "";
    return {
      targetPokemon: "Ralts",
      gameProfileId: settings?.defaultGameProfileId || defaultProfile,
      huntMode: "random_encounters",
      emulatorAdapterId: "mock",
      saveScreenshots: settings?.saveScreenshots ?? true,
      autoPauseOnShiny: settings?.autoPauseOnShiny ?? true,
      enableDiscordNotifications: Boolean(settings?.discordWebhookUrl),
      screenshotFolder: settings?.screenshotFolder ?? ""
    };
  }, [profiles, settings]);

  const refreshSessions = async () => setSessions(await window.electronApi.getSessions());

  return { ready, initError, settings, setSettings, profiles, sessions, state, activeConfig, refreshSessions };
}
