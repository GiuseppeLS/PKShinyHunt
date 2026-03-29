const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fsp = require("node:fs/promises");
const fs = require("node:fs");
const { PNG } = require("pngjs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  win.loadURL(devUrl);
}

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

async function createPlaceholderPng(filePath) {
  const width = 1280;
  const height = 720;
  const png = new PNG({ width, height });

  // Gradient background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const r = clamp(8 + (x / width) * 40);
      const g = clamp(12 + (y / height) * 20);
      const b = clamp(35 + (x / width) * 90);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }

  // Add simple bright banner block (fake "shiny flash")
  for (let y = 200; y < 320; y++) {
    for (let x = 120; x < 1160; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 250;
      png.data[idx + 1] = 204;
      png.data[idx + 2] = 21;
      png.data[idx + 3] = 210;
    }
  }

  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    png.pack().pipe(stream);
  });
}

ipcMain.handle("screenshot:create", async (_event, sessionId) => {
  const dir = path.join(app.getPath("pictures"), "PKShinyHunt", "screenshots");
  await fsp.mkdir(dir, { recursive: true });

  const fileName = `shiny-${sessionId}-${Date.now()}.png`;
  const filePath = path.join(dir, fileName);

  await createPlaceholderPng(filePath);

  console.log("[screenshot:create] wrote:", filePath);
  return filePath;
});

ipcMain.handle("discord:sendShiny", async (_event, payload) => {
  const { webhookUrl, pokemon, encounters, screenshotPath, gameProfile, huntMode } = payload || {};

  if (!webhookUrl) throw new Error("Webhook URL ontbreekt.");

  const content = [
    "✨ **SHINY FOUND!**",
    `Pokemon: **${pokemon ?? "Unknown"}**`,
    `Encounters: **${encounters ?? 0}**`,
    `Mode: **${huntMode ?? "random_encounters"}**`,
    `Profile: **${gameProfile ?? "Unknown"}**`,
    `Time: **${new Date().toISOString()}**`,
  ].join("\n");

  if (!screenshotPath) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Pokemon Shiny Hunt Assistant",
        content,
      }),
    });
    if (!res.ok) throw new Error(`Discord webhook failed (${res.status})`);
    return { ok: true, attached: false };
  }

  let fileBuffer;
  try {
    fileBuffer = await fsp.readFile(screenshotPath);
  } catch (e) {
    console.error("[discord:sendShiny] screenshot read failed:", screenshotPath, e);
    throw new Error(`Screenshot file niet leesbaar: ${screenshotPath}`);
  }

  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      username: "Pokemon Shiny Hunt Assistant",
      content,
    })
  );
  form.append("files[0]", new Blob([fileBuffer]), path.basename(screenshotPath));

  const res = await fetch(webhookUrl, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[discord:sendShiny] discord error:", res.status, txt);
    throw new Error(`Discord webhook failed (${res.status})`);
  }

  console.log("[discord:sendShiny] sent with attachment:", screenshotPath);
  return { ok: true, attached: true };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});