export interface OrasMemoryField {
  key: 'battleFlag' | 'menuFlag' | 'runFlag' | 'speciesId' | 'shinyValue';
  address: number;
  bytes: 4;
  description: string;
  assumption: string;
}

export interface OrasMemoryMap {
  profile: string;
  game: string;
  region: string;
  revision: string;
  notes: string[];
  fields: Record<OrasMemoryField['key'], OrasMemoryField>;
}

// IMPORTANT:
// These addresses are still best-effort for ORAS (US v1.4) and should be treated as candidate offsets.
// They are intentionally isolated to make verification/update easier when Azahar or ROM revisions differ.
export const ORAS_US_V1_4_MEMORY_MAP: OrasMemoryMap = {
  profile: 'oras-us-v1.4-candidate',
  game: 'Pokemon ORAS',
  region: 'US',
  revision: '1.4',
  notes: [
    'Offsets are candidate addresses and may shift per game update/build.',
    'battleFlag/menuFlag/runFlag interpretation currently assumes non-zero means true.',
    'speciesId and shinyValue decoding require field validation in live battles.',
    'If values are always zero or highly unstable, map is likely incorrect for your build.'
  ],
  fields: {
    battleFlag: {
      key: 'battleFlag',
      address: 0x08c7f4b0,
      bytes: 4,
      description: 'Battle-context flag; expected non-zero in battle.',
      assumption: 'non-zero => battle active'
    },
    menuFlag: {
      key: 'menuFlag',
      address: 0x08c7f4d0,
      bytes: 4,
      description: 'Command-menu visibility signal inside battle.',
      assumption: 'non-zero => command menu visible'
    },
    runFlag: {
      key: 'runFlag',
      address: 0x08c7f4d8,
      bytes: 4,
      description: 'Run option availability when in wild battle.',
      assumption: 'non-zero => run action available'
    },
    speciesId: {
      key: 'speciesId',
      address: 0x08c80a90,
      bytes: 4,
      description: 'Encountered species numeric id.',
      assumption: '1..1025 likely valid; outside range is suspicious'
    },
    shinyValue: {
      key: 'shinyValue',
      address: 0x08c80aa8,
      bytes: 4,
      description: 'Shiny-related value/flag from encounter data.',
      assumption: 'bit 0 interpreted as shiny candidate'
    }
  }
};