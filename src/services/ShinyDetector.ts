import type { EncounterInfo, ShinyDetectionResult } from '../types/domain';
import type { ShinyDetector } from '../types/interfaces';

export class BasicShinyDetector implements ShinyDetector {
  detect(encounter: EncounterInfo): ShinyDetectionResult {
    if (encounter.isShinyCandidate) {
      return { isShiny: true, confidence: 1, reason: 'Adapter flagged encounter as shiny candidate' };
    }

    return { isShiny: false, confidence: 0.95, reason: 'No shiny indicators in encounter payload' };
  }
}

