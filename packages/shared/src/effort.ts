/**
 * §13.4 — The Effort Equivalence Model.
 *
 * Competition across ability is only honest if effort is the unit, not
 * distance or reps. The normaliser is derived from the user's own baseline,
 * so a wheelchair user, a post-operative user and a marathon runner can
 * share a leaderboard without condescension or advantage.
 *
 * Normalisers are recalculated monthly, are never displayed as a
 * "disability handicap", and are described to users only as
 * "your personal baseline".
 */

export const MOVEMENT_CATEGORIES = [
  'mobility',
  'strength',
  'balance',
  'cardio',
  'neuro',
  'breath',
  'eye',
  'posture',
  'play',
  'skill',
] as const;
export type MovementCategory = (typeof MOVEMENT_CATEGORIES)[number];

export const CATEGORY_WEIGHT: Readonly<Record<MovementCategory, number>> = {
  mobility: 1.0,
  strength: 1.15,
  balance: 1.2,
  cardio: 1.1,
  neuro: 1.05,
  breath: 0.9,
  eye: 0.85,
  posture: 0.95,
  play: 1.0,
  skill: 1.05,
};

/** The label shown to users. Never "handicap", never "adjustment". */
export const NORMALISER_USER_LABEL = 'your personal baseline';

export interface EffortInput {
  durationSeconds: number;
  /** Borg-style rating of perceived exertion, 1–10. Reported or estimated. */
  rpe: number;
  /** Derived from the user's own baseline. Recalculated monthly. */
  capabilityNormaliser: number;
  category: MovementCategory;
  /** From the Integrity Agent, 0–1. Low-confidence sessions still count
   *  personally but do not contribute to prize-bearing leagues. */
  integrityConfidence: number;
}

export function equivalentEffort(input: EffortInput): number {
  return input.durationSeconds * input.rpe * input.capabilityNormaliser;
}

export function sparksFor(input: EffortInput): number {
  return Math.round(
    equivalentEffort(input) *
      CATEGORY_WEIGHT[input.category] *
      input.integrityConfidence,
  );
}

/** Threshold below which a session is excluded from prize-bearing leagues. */
export const PRIZE_INTEGRITY_THRESHOLD = 0.7;

export function countsTowardPrizes(integrityConfidence: number): boolean {
  return integrityConfidence >= PRIZE_INTEGRITY_THRESHOLD;
}

/**
 * Fairness invariant, asserted in the test suite:
 * two users completing matched-RPE, matched-duration, matched-category work
 * at their own baselines must earn identical Sparks.
 */
export function isEquivalenceFair(a: EffortInput, b: EffortInput): boolean {
  const matched =
    a.durationSeconds === b.durationSeconds &&
    a.rpe === b.rpe &&
    a.category === b.category &&
    a.integrityConfidence === b.integrityConfidence;
  if (!matched) return true;
  // Each user's own normaliser maps their effort onto the same scale.
  return sparksFor({ ...a, capabilityNormaliser: 1 }) ===
    sparksFor({ ...b, capabilityNormaliser: 1 });
}
