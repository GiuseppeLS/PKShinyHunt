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

  // nieuw
  autoFleeNonShiny: boolean;
  encounterIntervalMs: number;
  shinyChance: number; // bv 4096
}

export interface HuntSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  targetPokemon: string;
  encounterCount: number;
  shinyFound: boolean;
  endedReason?: "manual" | "shiny" | "error";
}