import type { EncounterLifecycle, NormalizedGameState } from '../GameState';

export class EncounterLifecycleTracker {
  private wasActive = false;

  update(state: NormalizedGameState): EncounterLifecycle | null {
    const isActive = state.encounter.active;

    if (!this.wasActive && isActive) {
      this.wasActive = true;
      return 'encounter_started';
    }

    if (this.wasActive && isActive) {
      return 'encounter_active';
    }

    if (this.wasActive && !isActive) {
      this.wasActive = false;
      return 'encounter_ended';
    }

    return null;
  }

  reset(): void {
    this.wasActive = false;
  }
}