interface PokeApiSpriteSet {
    front_default: string | null;
    front_shiny: string | null;
  }
  
  interface PokeApiPokemonResponse {
    id: number;
    name: string;
    sprites: PokeApiSpriteSet;
  }
  
  export interface PokemonLookup {
    id: number;
    name: string;
    defaultSprite: string | null;
    shinySprite: string | null;
  }
  
  export class PokeApiPokemonService {
    private readonly cache = new Map<string, PokemonLookup>();
  
    async getPokemon(idOrName: number | string): Promise<PokemonLookup | null> {
      const key = String(idOrName).toLowerCase();
      if (this.cache.has(key)) return this.cache.get(key)!;
  
      try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(key)}/`);
        if (!response.ok) return null;
  
        const data = (await response.json()) as PokeApiPokemonResponse;
        const result: PokemonLookup = {
          id: data.id,
          name: data.name,
          defaultSprite: data.sprites.front_default,
          shinySprite: data.sprites.front_shiny
        };
  
        this.cache.set(key, result);
        this.cache.set(String(result.id), result);
        this.cache.set(result.name.toLowerCase(), result);
        return result;
      } catch {
        return null;
      }
    }
  }
  