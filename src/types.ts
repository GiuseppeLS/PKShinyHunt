export type HuntStatus = "idle" | "hunting" | "shiny_found" | "error";
export type HuntMode = "random_encounters" | "soft_reset" | "static_encounter";

export interface HuntConfig {
  targetPokemon: string;
  gameProfile: string;
  huntMode: HuntMode;
  saveScreenshots: boolean;
  autoPauseOnShiny: boolean;
  discordEnabled: boolean;
  discordWebhookUrl: string;
  autoFleeNonShiny: boolean;
  encounterIntervalMs: number;
  shinyChance: number; // 1 op X
}

export interface HuntSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  targetPokemon: string;
  encounterCount: number;
  shinyFound: boolean;
  endedReason?: "manual" | "shiny" | "error";
  screenshotPath?: string;
  errorMessage?: string;
}