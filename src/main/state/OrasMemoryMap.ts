export interface OrasMemoryMap {
    battleFlagAddr: number;
    menuFlagAddr: number;
    runFlagAddr: number;
    speciesAddr: number;
    shinyValueAddr: number;
  }
  
  // NOTE: These offsets are intentionally isolated and version-scoped.
  // They may need adjustment per Azahar build/game region.
  export const ORAS_US_V1_4_OFFSETS: OrasMemoryMap = {
    battleFlagAddr: 0x08c7f4b0,
    menuFlagAddr: 0x08c7f4d0,
    runFlagAddr: 0x08c7f4d8,
    speciesAddr: 0x08c80a90,
    shinyValueAddr: 0x08c80aa8
  };
  