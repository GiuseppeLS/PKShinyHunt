/// <reference types="vite/client" />

interface ShinyDiscordPayload {
    webhookUrl: string;
    pokemon: string;
    encounters: number;
    huntMode: string;
    gameProfile: string;
    screenshotPath?: string;
  }
  
  interface ElectronApi {
    createScreenshot: (sessionId: string) => Promise<string>;
    sendShinyDiscord: (payload: ShinyDiscordPayload) => Promise<{ ok: boolean }>;
  }
  
  interface Window {
    electronApi?: ElectronApi;
  }