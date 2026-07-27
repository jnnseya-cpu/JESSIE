/**
 * §8 — The BodyCommand Scorecard.
 *
 * "BMI remains visible, but it does not dominate the user's score."
 *
 * BMI contributes nothing directly. The nearest dimension is
 * `waistOrBodyRiskTrend` at 10% — meaning 90% of the score is behaviour
 * the user controls today, not a number on a scale.
 */

export const SCORE_DIMENSIONS = [
  'foodPatternQuality',
  'movementConsistency',
  'sedentaryInterruption',
  'strengthProtection',
  'sleepAndRecovery',
  'waistOrBodyRiskTrend',
  'goalAdherence',
  'behaviouralStability',
  'sustainability',
  'measurementConfidence',
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

/** Weights are percentages and must total exactly 100. Asserted in tests. */
export const SCORE_WEIGHTS: Readonly<Record<ScoreDimension, number>> = {
  foodPatternQuality: 15,
  movementConsistency: 15,
  sedentaryInterruption: 10,
  strengthProtection: 10,
  sleepAndRecovery: 10,
  waistOrBodyRiskTrend: 10,
  goalAdherence: 10,
  behaviouralStability: 10,
  sustainability: 5,
  measurementConfidence: 5,
};

export const SCORE_LABELS: Readonly<Record<ScoreDimension, string>> = {
  foodPatternQuality: 'Food-pattern quality',
  movementConsistency: 'Movement consistency',
  sedentaryInterruption: 'Sedentary interruption',
  strengthProtection: 'Strength protection',
  sleepAndRecovery: 'Sleep and recovery',
  waistOrBodyRiskTrend: 'Waist or body-risk trend',
  goalAdherence: 'Goal adherence',
  behaviouralStability: 'Behavioural stability',
  sustainability: 'Sustainability',
  measurementConfidence: 'Measurement confidence',
};

/** Each dimension is scored 0–100. */
export type ScoreInput = Record<ScoreDimension, number>;

export function bodyCommandScore(input: ScoreInput): number {
  let total = 0;
  for (const dimension of SCORE_DIMENSIONS) {
    const value = Math.max(0, Math.min(100, input[dimension]));
    total += value * (SCORE_WEIGHTS[dimension] / 100);
  }
  return Math.round(total);
}

/**
 * §10 — Gamification without harm.
 * Mechanics banned at the engine level, mirroring the JESSIE-OS Charter's
 * intent. Any of these appearing in a build is a defect.
 */
export const PROHIBITED_MECHANICS = [
  'lowest_bmi_leaderboard',
  'public_weight_ranking',
  'child_weight_loss_contest',
  'fasting_competition',
  'calorie_minimisation_game',
  'exercise_to_erase_food_messaging',
  'punishment_for_missed_days',
  'shame_based_notification',
] as const;
export type ProhibitedMechanic = (typeof PROHIBITED_MECHANICS)[number];

/** Behaviours the system rewards. Note that none of them is a body measurement. */
export const REWARDED_BEHAVIOURS = [
  'completing_movement',
  'preparing_food',
  'scanning_meals',
  'improving_food_variety',
  'strength_training',
  'sleeping_consistently',
  'returning_after_disengagement',
  'completing_professional_referral',
  'maintaining_progress',
  'helping_family_members',
] as const;

/**
 * §9.10 — the Non-Scale Victory Board.
 * The counterweight to the scale, and deliberately the longer list.
 */
export const NON_SCALE_VICTORIES = [
  'strength',
  'mobility',
  'energy',
  'sleep',
  'waist',
  'walking',
  'sitting_reduction',
  'food_confidence',
  'consistency',
  'clothing_comfort',
  'return_after_relapse',
] as const;
