import type { ShinyDetector } from "../types/interfaces";
import type { EncounterInfo, ShinyDetectionResult } from "../types/domain";

export class BasicShinyDetector implements ShinyDetector {
  detect(encounter: EncounterInfo): ShinyDetectionResult {
    return {
      isShiny: Boolean(encounter.isShinyCandidate),
      confidence: encounter.isShinyCandidate ? 1 : 0.95,
      reason: encounter.isShinyCandidate ? "Adapter shiny flag" : "No shiny indicators"
    };
  }
}
