import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS, type AppInitPayload, type EmulatorPreviewFrame, type EmulatorWindowInfo } from '../shared/ipc';
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
let attachedEmulatorSourceId: string | null = null;
let previewInterval: NodeJS.Timeout | null = null;
let lastPreviewFrame: EmulatorPreviewFrame | null = null;

function logInfo(message: string, meta?: Record<string, unknown>) {
  console.log(`[emulator] ${message}`, meta ?? '');
}

function logError(message: string, error: unknown) {
  console.error(`[emulator] ${message}`, error);
}

async function listCitraWindows(): Promise<EmulatorWindowInfo[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1, height: 1 },
    fetchWindowIcons: false
  });

  return sources
    .filter((source) => source.name.toLowerCase().includes('citra'))
    .map((source) => ({ id: source.id, title: source.name }));
}

async function captureFrameFromSource(sourceId: string): Promise<EmulatorPreviewFrame> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 960, height: 540 },
    fetchWindowIcons: false
  });

  const source = sources.find((item) => item.id === sourceId);
  if (!source) {
    throw new Error(`Attached source not found: ${sourceId}`);
  }

  const thumbnail = source.thumbnail;
  if (thumbnail.isEmpty()) {
    throw new Error(`Source thumbnail is empty for ${sourceId}`);
  }

  const dataUrl = thumbnail.toDataURL();
  return {
    sourceId,
    dataUrl,
    capturedAt: new Date().toISOString()
  };
}

function stopPreviewLoop() {
  if (previewInterval) {
    clearInterval(previewInterval);
    previewInterval = null;
    logInfo('Preview loop stopped');
  }
}

function startPreviewLoop() {
  if (!mainWindow || !attachedEmulatorSourceId) {
    throw new Error('Cannot start preview: no attached emulator source');
  }

  stopPreviewLoop();

  previewInterval = setInterval(async () => {
    if (!attachedEmulatorSourceId || !mainWindow) {
      return;
    }

    try {
      const frame = await captureFrameFromSource(attachedEmulatorSourceId);
      lastPreviewFrame = frame;
      mainWindow.webContents.send(IPC_CHANNELS.EMULATOR_PREVIEW_FRAME, frame);
    } catch (error) {
      logError('Preview frame capture failed', error);
    }
  }, 450);

  logInfo('Preview loop started', { sourceId: attachedEmulatorSourceId });
}

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

  ipcMain.handle(IPC_CHANNELS.EMULATOR_LIST_WINDOWS, async () => {
    try {
      const windows = await listCitraWindows();
      logInfo('Detected Citra windows', { count: windows.length });
      return windows;
    } catch (error) {
      logError('Failed to list Citra windows', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.EMULATOR_ATTACH, async (_event, sourceId: string) => {
    const windows = await listCitraWindows();
    const exists = windows.some((window) => window.id === sourceId);
    if (!exists) {
      throw new Error(`Cannot attach. Source not found: ${sourceId}`);
    }

    attachedEmulatorSourceId = sourceId;
    logInfo('Attached emulator window', { sourceId });
    return { attached: true, sourceId };
  });

  ipcMain.handle(IPC_CHANNELS.EMULATOR_DETACH, async () => {
    stopPreviewLoop();
    attachedEmulatorSourceId = null;
    lastPreviewFrame = null;
    logInfo('Detached emulator window');
    return { attached: false };
  });

  ipcMain.handle(IPC_CHANNELS.EMULATOR_START_PREVIEW, async () => {
    try {
      startPreviewLoop();
      return { running: true };
    } catch (error) {
      logError('Failed to start preview loop', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.EMULATOR_STOP_PREVIEW, async () => {
    stopPreviewLoop();
    return { running: false };
  });

  ipcMain.handle(IPC_CHANNELS.EMULATOR_SAVE_FRAME, async () => {
    if (!lastPreviewFrame) {
      return { saved: false };
    }

    const outputDir = path.join(app.getPath('pictures'), 'PokemonShinyHuntAssistant', 'preview-captures');
    await fs.mkdir(outputDir, { recursive: true });

    const filePath = path.join(outputDir, `preview-${Date.now()}.png`);
    const image = nativeImage.createFromDataURL(lastPreviewFrame.dataUrl);
    await fs.writeFile(filePath, image.toPNG());

    logInfo('Saved preview frame', { filePath });
    return { saved: true, filePath };
  });
}

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, 'preload.js'),
    path.join(app.getAppPath(), 'dist', 'main', 'main', 'preload.js'),
    path.join(process.cwd(), 'dist', 'main', 'main', 'preload.js')
  ];

  const preloadPath = candidates.find((candidate) => existsSync(candidate));
  if (!preloadPath) {
    throw new Error(`Preload bundle not found. Checked: ${candidates.join(' | ')}`);
  }

  return preloadPath;
}

async function createWindow(): Promise<void> {
  const preloadPath = resolvePreloadPath();
  logInfo('Using preload script', { preloadPath });

  mainWindow = new BrowserWindow({
    width: 1340,
    height: 900,
    minWidth: 1150,
    minHeight: 780,
    backgroundColor: '#050816',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedUrl) => {
    logError('Renderer failed to load', { code, description, validatedUrl });
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
  stopPreviewLoop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});