import type { GameProfile } from "../types/domain";

export const defaultGameProfiles: GameProfile[] = [
  { id: "oras-starters", name: "ORAS Starters", game: "Omega Ruby / Alpha Sapphire", generation: 6 },
  { id: "usum-legendaries", name: "USUM Legendaries", game: "Ultra Sun / Ultra Moon", generation: 7 },
  { id: "xy-friend-safari", name: "XY Friend Safari", game: "X / Y", generation: 6 }
];
