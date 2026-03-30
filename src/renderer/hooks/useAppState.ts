import { useEffect, useMemo, useState } from 'react';
import type { AppInitPayload } from '../../shared/ipc';
import type { GameProfile, HuntConfig, HuntSession, HuntState, Settings } from '../../types/domain';

export function useAppState() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [sessions, setSessions] = useState<HuntSession[]>([]);
  const [state, setState] = useState<HuntState>({ status: 'idle', activeSession: null, elapsedMs: 0 });

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const initialize = async () => {
      if (!window.electronApi) {
        setInitError('Electron preload API ontbreekt. Controleer preload-pad/config.');
        setReady(true);
        return;
      }

      try {
        const payload: AppInitPayload = await window.electronApi.init();
        setSettings(payload.settings);
        setProfiles(payload.profiles);
        setSessions(payload.sessions);
        setState(payload.state);
        unsub = window.electronApi.subscribeState((next) => {
          setState(next);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende initialisatie fout';
        setInitError(`Init mislukt: ${message}`);
      } finally {
        setReady(true);
      }
    };

    void initialize();

    return () => {
      unsub?.();
    };
  }, []);

  const activeConfig = useMemo<HuntConfig>(() => {
    const defaultProfile = profiles[0]?.id ?? '';
    return {
      targetPokemon: 'Ralts',
      gameProfileId: settings?.defaultGameProfileId || defaultProfile,
      huntMode: 'random_encounters',
      emulatorAdapterId: 'mock',
      saveScreenshots: settings?.saveScreenshots ?? true,
      autoPauseOnShiny: settings?.autoPauseOnShiny ?? true,
      enableDiscordNotifications: Boolean(settings?.discordWebhookUrl),
      screenshotFolder: settings?.screenshotFolder ?? ''
    };
  }, [profiles, settings]);

  const refreshSessions = async () => {
    if (!window.electronApi) {
      setInitError('Electron API niet beschikbaar.');
      return;
    }
    setSessions(await window.electronApi.getSessions());
  };

  return {
    ready,
    initError,
    settings,
    setSettings,
    profiles,
    sessions,
    setSessions,
    state,
    setState,
    activeConfig,
    refreshSessions
  };
}