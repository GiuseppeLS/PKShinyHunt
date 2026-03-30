import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS, type AppInitPayload } from '../shared/ipc';
import { JsonStorageService } from '../storage/JsonStorage';
import { defaultGameProfiles } from '../profiles/defaultProfiles';
import { BasicShinyDetector } from '../services/ShinyDetector';
import { PlaceholderScreenshotService } from '../services/PlaceholderScreenshotService';
import { DiscordWebhookProvider, LocalDesktopNotificationProvider } from '../services/NotificationProviders';
import { MockEmulatorAdapter } from '../adapters/MockEmulatorAdapter';
import { CitraAdapter } from '../adapters/CitraAdapter';
import { AzaharAdapter } from '../adapters/AzaharAdapter';
import { HuntEngine } from '../core/HuntEngine';
import type { HuntConfig, Settings } from '../types/domain';

let mainWindow: BrowserWindow | null = null;

async function bootstrap(): Promise<void> {
  const storage = new JsonStorageService();
  const settings = await storage.getSettings();
  let currentSettings = settings;

  const adapters = new Map([
    ['mock', new MockEmulatorAdapter()],
    ['citra', new CitraAdapter()],
    ['azahar', new AzaharAdapter()]
  ]);

  const engine = new HuntEngine(
    adapters,
    new BasicShinyDetector(),
    new PlaceholderScreenshotService(),
    [
      new LocalDesktopNotificationProvider(),
      new DiscordWebhookProvider(() => currentSettings)
    ],
    storage,
    defaultGameProfiles,
    settings
  );

  engine.on('stateChanged', (state) => {
    mainWindow?.webContents.send(IPC_CHANNELS.STATE_SUBSCRIBE, state);
  });

  ipcMain.handle(IPC_CHANNELS.APP_INIT, async (): Promise<AppInitPayload> => ({
    settings: currentSettings,
    profiles: await engine.listProfiles(),
    sessions: await storage.listSessions(),
    state: engine.getState()
  }));

  ipcMain.handle(IPC_CHANNELS.HUNT_START, async (_event, config: HuntConfig) => engine.start(config));
  ipcMain.handle(IPC_CHANNELS.HUNT_STOP, async () => engine.stop());
  ipcMain.handle(IPC_CHANNELS.HUNT_RESET, async () => engine.reset());
  ipcMain.handle(IPC_CHANNELS.HUNT_FORCE_SHINY, async () => engine.forceShiny());
  ipcMain.handle(IPC_CHANNELS.HUNT_TEST_NOTIFICATION, async () => {
    const local = new LocalDesktopNotificationProvider();
    await local.sendTestMessage?.();
    if (currentSettings.discordWebhookUrl) {
      await new DiscordWebhookProvider(() => currentSettings).sendTestMessage?.();
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, settingsPayload: Settings) => {
    currentSettings = settingsPayload;
    engine.setSettings(settingsPayload);
    await storage.saveSettings(settingsPayload);
    return settingsPayload;
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async () => storage.listSessions());
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 900,
    minWidth: 1150,
    minHeight: 780,
    backgroundColor: '#050816',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, '../../index.html'));
}

app.whenReady().then(async () => {
  await bootstrap();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});