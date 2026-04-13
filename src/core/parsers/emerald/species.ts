const EMERALD_SPECIES_BY_ID: Record<number, string> = {
    1: 'Bulbasaur',
    4: 'Charmander',
    7: 'Squirtle',
    25: 'Pikachu',
    133: 'Eevee',
    252: 'Treecko',
    253: 'Grovyle',
    254: 'Sceptile',
    255: 'Torchic',
    256: 'Combusken',
    257: 'Blaziken',
    258: 'Mudkip',
    259: 'Marshtomp',
    260: 'Swampert',
    280: 'Ralts',
    281: 'Kirlia',
    282: 'Gardevoir',
    283: 'Surskit',
    284: 'Masquerain',
    379: 'Registeel',
    380: 'Latias',
    381: 'Latios',
    382: 'Kyogre',
    383: 'Groudon',
    384: 'Rayquaza',
    385: 'Jirachi',
    386: 'Deoxys'
  };
  
  export function resolveEmeraldSpecies(speciesId: number | null | undefined): string | null {
    if (!speciesId || speciesId <= 0) {
      return null;
    }
  
    return EMERALD_SPECIES_BY_ID[speciesId] ?? `Species#${speciesId}`;
  }