import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS, type AppInitPayload, type AzaharDiagnosticPayload, type EmulatorPreviewFrame, type EmulatorWindowInfo } from '../shared/ipc';
import { JsonStorageService } from '../storage/JsonStorage';
import { defaultGameProfiles } from '../profiles/defaultProfiles';
import { BasicShinyDetector } from '../services/ShinyDetector';
import { PlaceholderScreenshotService } from '../services/PlaceholderScreenshotService';
import { DiscordWebhookProvider, LocalDesktopNotificationProvider } from '../services/NotificationProviders';
import { MockEmulatorAdapter } from '../adapters/MockEmulatorAdapter';
import { CitraAdapter } from '../adapters/CitraAdapter';
import { AzaharAdapter } from '../adapters/AzaharAdapter';
import { HuntEngine } from '../core/HuntEngine';
import type { EncounterInfo, HuntConfig, Settings } from '../types/domain';
import { AzaharMemoryStateBackend } from './state/AzaharMemoryStateBackend';
import { ScreenStateBackend } from './state/ScreenStateBackend';
import { PokeApiPokemonService } from './state/PokeApiPokemonService';
import type { EmulatorStateBackend, PokemonGameStateSnapshot } from './state/EmulatorStateBackend';

let mainWindow: BrowserWindow | null = null;
let attachedEmulatorSourceId: string | null = null;
let attachedEmulatorTitle: string | null = null;
let previewInterval: NodeJS.Timeout | null = null;
let lastPreviewFrame: EmulatorPreviewFrame | null = null;
let huntLoopInterval: NodeJS.Timeout | null = null;
let huntLoopRunning = false;
let movementInterval: NodeJS.Timeout | null = null;
let movementDirectionIndex = 0;
let movementEnabled = false;
let movementResumeBlockedUntil = 0;
let captureMode: 'wgc' | 'fallback' = 'wgc';
let attachedNativeHandle: number | null = null;
let frameValidationOk = false;
let lastCaptureSucceeded = false;
let lastCaptureMethod: 'wgc' | 'fallback' | null = null;
let wgcInvalidFrameStreak = 0;
let lastWgcFrameHash: string | null = null;
let fallbackScriptStartedLogged = false;
let fallbackBoundsLogged = false;
let fallbackFrameLogged = false;
let fallbackLastError = '';
let previewLastError = '';
let lastUiState: GameUiState = 'OVERWORLD';
let lastRunAttemptAt = 0;
let stateBackend: EmulatorStateBackend | null = null;
let diagnosticBackend: AzaharMemoryStateBackend | null = null;
let backendMismatchTicks = 0;
const pokeApiService = new PokeApiPokemonService();

const huntVision = {
  previousIntensity: 0,
  inBattle: false,
  lastEncounterAt: 0,
  quietFrames: 0,
  inBattleSince: 0,
  analyzingLogged: false
};

const movementPatternKeys = {
  left_right: ['left', 'right'],
  up_down: ['up', 'down']
} as const;

function logInfo(message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ scope: 'hunt-main', level: 'info', message, ...meta, at: new Date().toISOString() }));
}

function logError(message: string, error: unknown) {
  console.error(JSON.stringify({ scope: 'hunt-main', level: 'error', message, error: String(error), at: new Date().toISOString() }));
}



async function runPowerShell(script: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error((stderr || `powershell exit ${code}`).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function parseNativeHandleFromSourceId(sourceId: string): number | null {
  const match = sourceId.match(/^window:(\d+):/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function getCaptureStatusPayload() {
  return {
    attached: Boolean(attachedEmulatorSourceId),
    captureMode,
    windowTitle: attachedEmulatorTitle,
    nativeHandle: attachedNativeHandle,
    frameValidationOk,
    lastCaptureSucceeded,
    lastCaptureMethod,
    previewRunning: Boolean(previewInterval),
    huntLoopRunning: Boolean(huntLoopInterval),
    backendId: stateBackend?.id ?? null,
    backendHealthy: stateBackend?.isHealthy() ?? false,
    backendLastError: stateBackend?.getLastError() ?? null
  };
}

async function pollAzaharDiagnosticSnapshot(): Promise<AzaharDiagnosticPayload> {
  if (!diagnosticBackend) {
    diagnosticBackend = new AzaharMemoryStateBackend();
  }

  try {
    if (!diagnosticBackend.isHealthy()) {
      await diagnosticBackend.connect();
    }

    const snapshot = await diagnosticBackend.pollState();
    const memoryAddressLabels = diagnosticBackend.getMemoryAddressLabels();
    const memoryRaw = (snapshot.raw?.memory ?? {}) as Record<string, unknown>;
    const statusRaw = (snapshot.raw?.status ?? {}) as Record<string, unknown>;
    const fields = Object.entries(memoryAddressLabels).map(([key, address]) => ({
      key,
      value: memoryRaw[key] ?? null,
      addressLabel: `${key}Addr`,
      addressHex: `0x${address.toString(16)}`,
      source: 'memory.read_u32' as const
    }));

    return {
      polledAt: new Date().toISOString(),
      connected: true,
      rpcConnected: diagnosticBackend.isHealthy(),
      lastError: diagnosticBackend.getLastError(),
      derived: {
        inBattle: snapshot.inBattle,
        commandMenuVisible: snapshot.commandMenuVisible,
        canRun: snapshot.canRun,
        encounteredSpeciesId: snapshot.encounteredSpeciesId,
        isShiny: snapshot.isShiny,
        state: snapshot.state
      },
      raw: {
        status: statusRaw,
        memory: memoryRaw
      },
      fields
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
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
    };
  }
}

function movementKeyToSendKeys(direction: string): string {
  if (direction === 'left') return '{LEFT}';
  if (direction === 'right') return '{RIGHT}';
  if (direction === 'up') return '{UP}';
  return '{DOWN}';
}


async function focusAttachedWindow(): Promise<void> {
  if (!attachedNativeHandle || process.platform !== 'win32') {
    return;
  }

  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FocusNative {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
$hwnd = [IntPtr]${attachedNativeHandle}
[FocusNative]::ShowWindowAsync($hwnd, 9) | Out-Null
[FocusNative]::SetForegroundWindow($hwnd) | Out-Null
`;

  await runPowerShell(script);
}

async function sendDirectionalInput(direction: string, keyHoldMs: number): Promise<void> {
  if (process.platform === 'win32') {
    await focusAttachedWindow();
    const key = movementKeyToSendKeys(direction);
    const repeatCount = Math.max(1, Math.round(keyHoldMs / 60));
    await new Promise<void>((resolve, reject) => {
      const script = `Add-Type -AssemblyName System.Windows.Forms; 1..${repeatCount} | ForEach-Object { [System.Windows.Forms.SendKeys]::SendWait('${key}'); Start-Sleep -Milliseconds 45 }`;
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`powershell exit ${code}`))));
      child.on('error', reject);
    });
    return;
  }

  if (process.platform === 'linux') {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('xdotool', ['key', direction]);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`xdotool exit ${code}`))));
      child.on('error', reject);
    });
    return;
  }

  throw new Error(`Unsupported platform for automatic movement: ${process.platform}`);
}

function stopMovementEngine(reason: string) {
  if (movementInterval) {
    clearInterval(movementInterval);
    movementInterval = null;
  }
  movementEnabled = false;
  logInfo('Movement stopped', { reason });
}

function startMovementEngine(config: HuntConfig) {
  if (config.enableAutoMovement === false) {
    stopMovementEngine('disabled-by-config');
    return;
  }

  stopMovementEngine('restart');
  const pattern = config.movementPattern ?? 'left_right';
  const stepIntervalMs = config.movementIntervalMs ?? 1050;
  const keyHoldMs = config.movementKeyHoldMs ?? 180;
  const keys = movementPatternKeys[pattern];
  movementEnabled = true;

  movementInterval = setInterval(async () => {
    if (!movementEnabled || Date.now() < movementResumeBlockedUntil) {
      return;
    }

    const direction = keys[movementDirectionIndex % keys.length];
    movementDirectionIndex += 1;

    try {
      await sendDirectionalInput(direction, keyHoldMs);
      logInfo('Movement tick', { direction, pattern, keyHoldMs, stepIntervalMs });
    } catch (error) {
      logError('Movement input failed', error);
      stopMovementEngine('input-error');
    }
  }, stepIntervalMs);

  logInfo('Movement started', { pattern, movementKeyHoldMs: keyHoldMs, movementIntervalMs: stepIntervalMs });
}

async function listEmulatorWindows(): Promise<EmulatorWindowInfo[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1, height: 1 },
    fetchWindowIcons: false
  });

  return sources
    .filter((source) => {
      const name = source.name.toLowerCase();
      return name.includes('citra') || name.includes('azahar') || name.includes('lime3ds');
    })
    .map((source) => ({ id: source.id, title: source.name }));
}

async function captureFrameWgc(sourceId: string): Promise<EmulatorPreviewFrame> {
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

  return {
    sourceId,
    dataUrl: thumbnail.toDataURL(),
    capturedAt: new Date().toISOString()
  };
}

async function resolveWindowBounds(nativeHandle: number): Promise<{ left: number; top: number; width: number; height: number }> {
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public struct POINT { public int X; public int Y; }
public static class CaptureNative {
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT pt);
}
'@
$hwnd = [IntPtr]${nativeHandle}
$rect = New-Object RECT
if (-not [CaptureNative]::GetClientRect($hwnd, [ref]$rect)) { throw "GetClientRect failed" }
$pt = New-Object POINT
$pt.X = $rect.Left
$pt.Y = $rect.Top
if (-not [CaptureNative]::ClientToScreen($hwnd, [ref]$pt)) { throw "ClientToScreen failed" }
@{ left=$pt.X; top=$pt.Y; width=($rect.Right-$rect.Left); height=($rect.Bottom-$rect.Top) } | ConvertTo-Json -Compress
`;

  const output = await runPowerShell(script);
  const parsed = JSON.parse(output) as { left: number; top: number; width: number; height: number };
  if (parsed.width <= 0 || parsed.height <= 0) {
    throw new Error('Invalid client bounds');
  }

  if (!fallbackBoundsLogged) {
    logInfo('Fallback bounds resolved successfully', { width: parsed.width, height: parsed.height });
    fallbackBoundsLogged = true;
  }

  return parsed;
}

async function captureFrameFallback(): Promise<EmulatorPreviewFrame> {
  if (!attachedEmulatorTitle || !attachedNativeHandle) {
    throw new Error('Fallback init failed');
  }

  if (process.platform !== 'win32') {
    throw new Error(`Fallback not supported on ${process.platform}`);
  }

  if (!fallbackScriptStartedLogged) {
    logInfo('Fallback script started');
    fallbackScriptStartedLogged = true;
  }

  try {
    const bounds = await resolveWindowBounds(attachedNativeHandle);
    const script = `
Add-Type -AssemblyName System.Drawing
$left = ${Math.floor(bounds.left)}
$top = ${Math.floor(bounds.top)}
$width = ${Math.floor(bounds.width)}
$height = ${Math.floor(bounds.height)}
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($left, $top, 0, 0, $bmp.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"data:image/png;base64,$([Convert]::ToBase64String($ms.ToArray()))"
`;

    const dataUrl = await runPowerShell(script);
    if (!dataUrl.startsWith('data:image/png;base64,')) {
      throw new Error('Invalid fallback frame payload');
    }

    if (!fallbackFrameLogged) {
      logInfo('Fallback frame captured successfully');
      fallbackFrameLogged = true;
    }

    fallbackLastError = '';

    return {
      sourceId: attachedEmulatorSourceId ?? 'fallback-window',
      dataUrl,
      capturedAt: new Date().toISOString()
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (fallbackLastError !== message) {
      logError('Fallback capture failed', message);
      fallbackLastError = message;
    }
    throw new Error('Fallback capture failed');
  }
}

function buildFrameHash(frame: EmulatorPreviewFrame): string {
  const image = nativeImage.createFromDataURL(frame.dataUrl);
  const bitmap = image.resize({ width: 24, height: 24 }).toBitmap();
  let sum = 0;
  for (let i = 0; i < bitmap.length; i += 16) {
    sum += bitmap[i] ?? 0;
  }
  return `${image.getSize().width}x${image.getSize().height}-${sum}`;
}

function isWgcFrameHealthy(frame: EmulatorPreviewFrame): boolean {
  const image = nativeImage.createFromDataURL(frame.dataUrl);
  const { width, height } = image.getSize();
  if (width < 100 || height < 100) {
    return false;
  }

  const hash = buildFrameHash(frame);
  if (lastWgcFrameHash === hash) {
    wgcInvalidFrameStreak += 1;
  } else {
    wgcInvalidFrameStreak = 0;
    lastWgcFrameHash = hash;
  }

  return wgcInvalidFrameStreak < 8;
}

async function captureFrameWithFallback(sourceId: string): Promise<EmulatorPreviewFrame> {
  if (captureMode === 'fallback') {
    const frame = await captureFrameFallback();
    frameValidationOk = true;
    lastCaptureSucceeded = true;
    lastCaptureMethod = 'fallback';
    logInfo('Captured frame', { method: 'fallback' });
    return frame;
  }

  try {
    const frame = await captureFrameWgc(sourceId);
    const healthy = isWgcFrameHealthy(frame);
    if (!healthy) {
      throw new Error('WGC frame health check failed');
    }

    frameValidationOk = true;
    lastCaptureSucceeded = true;
    lastCaptureMethod = 'wgc';
    logInfo('Captured frame', { method: 'wgc' });
    return frame;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldFallback = message.toLowerCase().includes('capturable')
      || message.toLowerCase().includes('thumbnail is empty')
      || message.toLowerCase().includes('health check failed');

    if (!shouldFallback) {
      frameValidationOk = false;
      lastCaptureSucceeded = false;
      throw error;
    }

    captureMode = 'fallback';
    logInfo('Switching capture mode', { from: 'wgc', to: 'fallback', reason: message });
    const frame = await captureFrameFallback();
    frameValidationOk = true;
    lastCaptureSucceeded = true;
    lastCaptureMethod = 'fallback';
    logInfo('Captured frame', { method: 'fallback' });
    return frame;
  }
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
      const frame = await captureFrameWithFallback(attachedEmulatorSourceId);
      lastPreviewFrame = frame;
      previewLastError = '';
      mainWindow.webContents.send(IPC_CHANNELS.EMULATOR_PREVIEW_FRAME, frame);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (previewLastError !== message) {
        logError('Preview frame capture failed', message);
        previewLastError = message;
      }
    }
  }, 450);

  logInfo('Preview loop started', { sourceId: attachedEmulatorSourceId, captureMode });
}

type GameUiState =
  | 'OVERWORLD'
  | 'TRANSITION'
  | 'BATTLE'
  | 'COMMAND_MENU'
  | 'RUN_AVAILABLE'
  | 'RETURNING_TO_OVERWORLD'
  | 'UNKNOWN'
  | 'ERROR';

function sampleRegionMetrics(bitmap: Buffer, width: number, x1: number, y1: number, x2: number, y2: number) {
  const xs = Math.max(0, Math.floor(x1));
  const ys = Math.max(0, Math.floor(y1));
  const xe = Math.max(xs + 1, Math.floor(x2));
  const ye = Math.max(ys + 1, Math.floor(y2));

  let count = 0;
  let bright = 0;
  let greenDominant = 0;
  let blueDominant = 0;
  let edgeCount = 0;

  for (let y = ys; y < ye; y += 2) {
    for (let x = xs; x < xe; x += 2) {
      const i = (y * width + x) * 4;
      const b = bitmap[i] ?? 0;
      const g = bitmap[i + 1] ?? 0;
      const r = bitmap[i + 2] ?? 0;

      const luminance = (r + g + b) / 3;
      bright += luminance;
      if (g > r + 18 && g > b + 18) greenDominant += 1;
      if (b > r + 16 && b > g - 8) blueDominant += 1;

      if (x + 2 < xe) {
        const j = (y * width + (x + 2)) * 4;
        const db = Math.abs((bitmap[j] ?? 0) - b);
        const dg = Math.abs((bitmap[j + 1] ?? 0) - g);
        const dr = Math.abs((bitmap[j + 2] ?? 0) - r);
        if (db + dg + dr > 85) edgeCount += 1;
      }

      count += 1;
    }
  }

  if (!count) {
    return { brightness: 0, greenRatio: 0, blueRatio: 0, edgeRatio: 0 };
  }

  return {
    brightness: bright / count,
    greenRatio: greenDominant / count,
    blueRatio: blueDominant / count,
    edgeRatio: edgeCount / count
  };
}


function findActiveContentBounds(bitmap: Buffer, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      const b = bitmap[i] ?? 0;
      const g = bitmap[i + 1] ?? 0;
      const r = bitmap[i + 2] ?? 0;
      if (r + g + b > 45) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX >= maxX || minY >= maxY) {
    return { x: 0, y: 0, w: width, h: height };
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function detectGameUiState(frameDataUrl: string): GameUiState {
  const image = nativeImage.createFromDataURL(frameDataUrl).resize({ width: 320, height: 180 });
  const bitmap = image.toBitmap();
  const width = 320;
  const height = 180;

  const box = findActiveContentBounds(bitmap, width, height);
  const rx = (p: number) => box.x + box.w * p;
  const ry = (p: number) => box.y + box.h * p;

  const enemyHpRoi = sampleRegionMetrics(bitmap, width, rx(0.64), ry(0.03), rx(0.98), ry(0.17));
  const playerHudRoi = sampleRegionMetrics(bitmap, width, rx(0.04), ry(0.50), rx(0.44), ry(0.72));
  const commandMenuRoi = sampleRegionMetrics(bitmap, width, rx(0.42), ry(0.70), rx(0.99), ry(0.99));
  const runButtonRoi = sampleRegionMetrics(bitmap, width, rx(0.78), ry(0.82), rx(0.99), ry(0.99));
  const fullRoi = sampleRegionMetrics(bitmap, width, rx(0.0), ry(0.0), rx(1.0), ry(1.0));

  const enemyHpVisible = enemyHpRoi.greenRatio > 0.06 && enemyHpRoi.brightness > 35;
  const playerHudVisible = playerHudRoi.edgeRatio > 0.10 && playerHudRoi.brightness > 32;
  const commandMenuVisible = commandMenuRoi.edgeRatio > 0.14 && commandMenuRoi.brightness > 36;
  const runAvailable = runButtonRoi.edgeRatio > 0.13 && runButtonRoi.brightness > 34;

  if (runAvailable && (enemyHpVisible || commandMenuVisible)) return 'RUN_AVAILABLE';
  if (commandMenuVisible && (enemyHpVisible || playerHudVisible)) return 'COMMAND_MENU';
  if (enemyHpVisible || playerHudVisible) return 'BATTLE';

  if (fullRoi.brightness < 20 && fullRoi.edgeRatio < 0.06) return 'TRANSITION';

  if (lastUiState === 'BATTLE' || lastUiState === 'COMMAND_MENU' || lastUiState === 'RUN_AVAILABLE' || lastUiState === 'RETURNING_TO_OVERWORLD') {
    return 'RETURNING_TO_OVERWORLD';
  }
  return 'OVERWORLD';
}

function buildScreenSnapshot(frameDataUrl: string): PokemonGameStateSnapshot {
  const state = detectGameUiState(frameDataUrl);
  return {
    state,
    inBattle: state === 'BATTLE' || state === 'COMMAND_MENU' || state === 'RUN_AVAILABLE',
    commandMenuVisible: state === 'COMMAND_MENU' || state === 'RUN_AVAILABLE',
    canRun: state === 'RUN_AVAILABLE',
    encounteredSpeciesId: null,
    speciesName: null,
    isWildEncounter: null,
    isShiny: null,
    confidence: 0.55,
    source: 'screen',
    raw: { state }
  };
}

async function initializeStateBackend(): Promise<void> {
  const memoryBackend = new AzaharMemoryStateBackend();
  try {
    logInfo('Attempting Azahar memory backend connection');
    await memoryBackend.connect();
    stateBackend = memoryBackend;
    logInfo('Memory backend connected', { backend: memoryBackend.id });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Memory backend unavailable; switching to screen fallback', message);
  }

  stateBackend = new ScreenStateBackend(async () => {
    if (!attachedEmulatorSourceId) throw new Error('No attached emulator source for screen fallback');
    const frame = await captureFrameWithFallback(attachedEmulatorSourceId);
    return buildScreenSnapshot(frame.dataUrl);
  });
  await stateBackend.connect();
  logInfo('Screen fallback backend connected', { backend: stateBackend.id });
}

async function attemptRunFromBattle(): Promise<void> {
  if (Date.now() - lastRunAttemptAt < 1200) {
    return;
  }
  lastRunAttemptAt = Date.now();

  if (process.platform === 'win32') {
    await focusAttachedWindow();
    const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{DOWN}'); Start-Sleep -Milliseconds 55; [System.Windows.Forms.SendKeys]::SendWait('{RIGHT}'); Start-Sleep -Milliseconds 55; [System.Windows.Forms.SendKeys]::SendWait('z')`;
    await runPowerShell(script);
    logInfo('Run command sent', { method: 'keyboard-sequence' });
  }
}

async function saveDebugFrame(frame: EmulatorPreviewFrame, reason: string): Promise<string> {
  const outputDir = path.join(app.getPath('pictures'), 'PokemonShinyHuntAssistant', 'debug-frames');
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${reason}-${Date.now()}.png`);
  const image = nativeImage.createFromDataURL(frame.dataUrl);
  await fs.writeFile(filePath, image.toPNG());
  return filePath;
}

function stopHuntLoop() {
  stopMovementEngine('hunt-loop-stop');
  if (huntLoopInterval) {
    clearInterval(huntLoopInterval);
    huntLoopInterval = null;
  }
  huntLoopRunning = false;
  huntVision.inBattle = false;
  huntVision.lastEncounterAt = 0;
  huntVision.previousIntensity = 0;
  huntVision.quietFrames = 0;
  huntVision.inBattleSince = 0;
  huntVision.analyzingLogged = false;
  lastUiState = 'OVERWORLD';
  lastRunAttemptAt = 0;
  backendMismatchTicks = 0;
}

function startHuntLoop(engine: HuntEngine, config: HuntConfig) {
  if (!attachedEmulatorSourceId) {
    throw new Error('Attach eerst een Citra-window voor je start.');
  }

  stopHuntLoop();
  movementDirectionIndex = 0;
  engine.markBattlePhase('searching');
  startMovementEngine(config);

  if (!stateBackend) {
    throw new Error('State backend is not initialized');
  }

  huntLoopInterval = setInterval(async () => {
    const backend = stateBackend;
    if (huntLoopRunning || !attachedEmulatorSourceId) {
      return;
    }

    huntLoopRunning = true;
    try {
      const frame = await captureFrameWithFallback(attachedEmulatorSourceId);
      lastPreviewFrame = frame;
      mainWindow?.webContents.send(IPC_CHANNELS.EMULATOR_PREVIEW_FRAME, frame);

      const now = Date.now();
      if (!backend) {
        throw new Error('State backend unavailable during hunt tick');
      }
      const memorySnapshot = await backend.pollState();
      const screenSnapshot = buildScreenSnapshot(frame.dataUrl);
      let snapshot = memorySnapshot;

      if (memorySnapshot.source === 'memory') {
        const memoryLooksInvalid = memorySnapshot.state === 'UNKNOWN' || memorySnapshot.state === 'ERROR';
        const memoryShowsBattle = memorySnapshot.state === 'BATTLE' || memorySnapshot.state === 'COMMAND_MENU' || memorySnapshot.state === 'RUN_AVAILABLE';
        const screenShowsBattle = screenSnapshot.state === 'BATTLE' || screenSnapshot.state === 'COMMAND_MENU' || screenSnapshot.state === 'RUN_AVAILABLE';

        const battleMismatch = memoryShowsBattle !== screenShowsBattle;

        if (memoryLooksInvalid || battleMismatch) {
          backendMismatchTicks += 1;
        } else {
          backendMismatchTicks = 0;
        }

        const preferScreenNow = memoryLooksInvalid
          || (screenShowsBattle && !memoryShowsBattle)
          || backendMismatchTicks >= 2;

        if (preferScreenNow) {
          snapshot = screenSnapshot;
          logInfo('Using screen fallback snapshot for this tick', {
            memoryState: memorySnapshot.state,
            screenState: screenSnapshot.state,
            mismatchTicks: backendMismatchTicks,
            reason: memoryLooksInvalid ? 'memory-invalid' : (screenShowsBattle && !memoryShowsBattle ? 'battle-visible-on-screen' : 'state-mismatch')
          });
        }
      }

      const uiState = snapshot.state;
      if (uiState !== lastUiState) {
        logInfo('Resolved game state changed', { from: lastUiState, to: uiState, source: snapshot.source });
      }

      const encounterSignals = uiState === 'BATTLE' || uiState === 'COMMAND_MENU' || uiState === 'RUN_AVAILABLE';
      if (!huntVision.inBattle && encounterSignals && now - huntVision.lastEncounterAt > 5000) {
        huntVision.inBattle = true;
        huntVision.inBattleSince = now;
        huntVision.analyzingLogged = false;
        stopMovementEngine('encounter-detected');
        huntVision.lastEncounterAt = now;
        huntVision.quietFrames = 0;
        logInfo('Encounter detected', { uiState });

        engine.markBattlePhase('encounter_start');
        const debugPath = await saveDebugFrame(frame, 'encounter-start');

        const speciesLookup = snapshot.encounteredSpeciesId
          ? await pokeApiService.getPokemon(snapshot.encounteredSpeciesId)
          : null;

        const encounter: EncounterInfo = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          pokemonName: speciesLookup?.name ?? 'Unknown',
          encounterType: config.huntMode,
          metadata: {
            source: snapshot.source,
            captureMethod: captureMode,
            uiState,
            speciesId: snapshot.encounteredSpeciesId,
            speciesName: speciesLookup?.name ?? null,
            pokeApiShinySprite: speciesLookup?.shinySprite ?? null,
            isShiny: snapshot.isShiny,
            debugPath
          }
        };

        await engine.recordEncounter(encounter, config.emulatorAdapterId);
        engine.markBattlePhase('in_battle');
      }

      if (huntVision.inBattle) {
        if ((uiState === 'BATTLE' || uiState === 'COMMAND_MENU' || uiState === 'RUN_AVAILABLE') && !huntVision.analyzingLogged) {
          engine.markBattlePhase('analyzing');
          logInfo('Entered analyzing', { uiState });
          huntVision.analyzingLogged = true;
        }

        if (snapshot.isShiny === true) {
          const shinyLookup = snapshot.encounteredSpeciesId ? await pokeApiService.getPokemon(snapshot.encounteredSpeciesId) : null;
          logInfo('Shiny detected from backend', { speciesId: snapshot.encounteredSpeciesId, speciesName: shinyLookup?.name ?? null, shinySprite: shinyLookup?.shinySprite ?? null });
        }

        if (uiState === 'RUN_AVAILABLE' && snapshot.isShiny !== true) {
          logInfo('Flee triggered', { canRun: snapshot.canRun, isShiny: snapshot.isShiny });
          await attemptRunFromBattle();
        }

        const leavingBattle = uiState === 'OVERWORLD' || uiState === 'RETURNING_TO_OVERWORLD';
        if (leavingBattle) {
          huntVision.quietFrames += 1;
        } else {
          huntVision.quietFrames = 0;
        }

        const battleTimedOut = now - huntVision.inBattleSince > 22000;
        if (huntVision.quietFrames >= 3 || battleTimedOut) {
          huntVision.inBattle = false;
          huntVision.quietFrames = 0;
          huntVision.analyzingLogged = false;
          engine.markBattlePhase('searching');
          logInfo('Returned to searching', { reason: battleTimedOut ? 'timeout' : 'overworld-confirmed' });

          movementResumeBlockedUntil = Date.now() + (config.movementResumeCooldownMs ?? 1200);
          startMovementEngine(config);
          logInfo('Movement resumed', {
            movementKeyHoldMs: config.movementKeyHoldMs ?? 180,
            movementIntervalMs: config.movementIntervalMs ?? 1050,
            resumeAfterMs: config.movementResumeCooldownMs ?? 1200
          });
        }
      } else if (uiState === 'OVERWORLD' && engine.getState().status !== 'searching') {
        engine.markBattlePhase('searching');
      } else if (engine.getState().status === 'analyzing') {
        engine.markBattlePhase('searching');
      }

      lastUiState = uiState;
    } catch (error) {
      stopMovementEngine('capture-failed');
      engine.markBattlePhase('error');
      logError('Hunt loop tick failed', error);
    } finally {
      huntLoopRunning = false;
    }
  }, 400);
}

async function bootstrap(): Promise<void> {
  const storage = new JsonStorageService();
  const settings = await storage.getSettings();
  let currentSettings = settings;
  let activeLoopConfig: HuntConfig | null = null;

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

  ipcMain.handle(IPC_CHANNELS.HUNT_START, async (_event, config: HuntConfig) => {
    if (config.emulatorAdapterId === 'citra') {
      if (!attachedEmulatorSourceId) {
        throw new Error('Attach a Citra window before starting hunt.');
      }

      try {
        await captureFrameWithFallback(attachedEmulatorSourceId);
      } catch (error) {
        frameValidationOk = false;
        lastCaptureSucceeded = false;
        throw new Error(`Capture validation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    activeLoopConfig = config;
    if (config.emulatorAdapterId === 'citra' || config.emulatorAdapterId === 'azahar') {
      await initializeStateBackend();
    }

    const state = await engine.start(config);
    if (config.emulatorAdapterId === 'citra' || config.emulatorAdapterId === 'azahar') {
      startHuntLoop(engine, config);
    }
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.HUNT_STOP, async () => {
    stopHuntLoop();
    await stateBackend?.disconnect();
    stateBackend = null;
    activeLoopConfig = null;
    return engine.stop();
  });

  ipcMain.handle(IPC_CHANNELS.HUNT_RESET, async () => {
    stopHuntLoop();
    await stateBackend?.disconnect();
    stateBackend = null;
    activeLoopConfig = null;
    return engine.reset();
  });

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
      const windows = await listEmulatorWindows();
      logInfo('Detected emulator windows', { count: windows.length, titles: windows.map((w) => w.title) });
      return windows;
    } catch (error) {
      logError('Failed to list Citra windows', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.EMULATOR_ATTACH, async (_event, sourceId: string) => {
    const windows = await listEmulatorWindows();
    const selectedWindow = windows.find((window) => window.id === sourceId);
    if (!selectedWindow) {
      throw new Error(`Cannot attach. Source not found: ${sourceId}`);
    }

    attachedEmulatorSourceId = sourceId;
    attachedEmulatorTitle = selectedWindow.title;
    attachedNativeHandle = parseNativeHandleFromSourceId(sourceId);
    captureMode = 'wgc';
    frameValidationOk = false;
    lastCaptureSucceeded = false;
    lastCaptureMethod = null;
    wgcInvalidFrameStreak = 0;
    lastWgcFrameHash = null;
    fallbackScriptStartedLogged = false;
    fallbackBoundsLogged = false;
    fallbackFrameLogged = false;
    fallbackLastError = '';
    previewLastError = '';
    engine.markBattlePhase('attached');
    logInfo('Attached emulator window', { sourceId, title: attachedEmulatorTitle, captureMode });
    return { attached: true, sourceId };
  });

  ipcMain.handle(IPC_CHANNELS.EMULATOR_DETACH, async () => {
    stopPreviewLoop();
    stopHuntLoop();
    if (activeLoopConfig?.emulatorAdapterId === 'citra') {
      await engine.stop();
    }
    await stateBackend?.disconnect();
    stateBackend = null;
    activeLoopConfig = null;
    attachedEmulatorSourceId = null;
    attachedEmulatorTitle = null;
    attachedNativeHandle = null;
    lastPreviewFrame = null;
    captureMode = 'wgc';
    frameValidationOk = false;
    lastCaptureSucceeded = false;
    lastCaptureMethod = null;
    fallbackScriptStartedLogged = false;
    fallbackBoundsLogged = false;
    fallbackFrameLogged = false;
    fallbackLastError = '';
    previewLastError = '';
    engine.setStatus('idle');
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

  ipcMain.handle(IPC_CHANNELS.CAPTURE_STATUS, async () => getCaptureStatusPayload());
  ipcMain.handle(IPC_CHANNELS.AZAHAR_DIAG_POLL, async () => pollAzaharDiagnosticSnapshot());

  ipcMain.handle(IPC_CHANNELS.EMULATOR_SAVE_FRAME, async () => {
    if (!lastPreviewFrame) {
      return { saved: false };
    }

    const outputDir = path.join(app.getPath('pictures'), 'PokemonShinyHuntAssistant', 'preview-captures');
    await fs.mkdir(outputDir, { recursive: true });

    const filePath = path.join(outputDir, `preview-${Date.now()}.png`);
    const image = nativeImage.createFromDataURL(lastPreviewFrame.dataUrl);
    await fs.writeFile(filePath, image.toPNG());

    logInfo('Saved preview frame', { filePath, captureMethod: captureMode });
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
  stopHuntLoop();
  void diagnosticBackend?.disconnect();
  diagnosticBackend = null;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});