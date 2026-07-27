/**
 * §13 — Gamification and social architecture, and the Ethical
 * Gamification Charter that constrains it.
 */

/** Four progress meters. Deliberately no single composite score:
 *  composite scores create losers. §13.1. */
export const METERS = ['steadiness', 'strength', 'mobility', 'energy'] as const;
export type Meter = (typeof METERS)[number];

export interface MeterState {
  meter: Meter;
  /** 0–100, relative to the user's own baseline. */
  value: number;
  trend: 'rising' | 'steady' | 'easing';
}

/** Chain counts consecutive *active days*, not perfect days.
 *  One Snap holds the Chain. §13.1. */
export interface Chain {
  userId: string;
  currentDays: number;
  longestDays: number;
  lastActiveDate: string;
  graceTokensRemaining: number;
  hold?: ChainHold;
}

/** §13.6.1 — Chains forgive. */
export const GRACE_TOKENS_PER_MONTH = 2;
export const BEREAVEMENT_HOLD_MAX_DAYS = 60;

export const HOLD_KINDS = ['flare', 'bereavement', 'carer', 'user_requested'] as const;
export type HoldKind = (typeof HOLD_KINDS)[number];

export interface ChainHold {
  kind: HoldKind;
  startedAt: string;
  /** Flare Mode freezes the Chain on declaration — no proof required. */
  proofRequired: false;
  expiresAt?: string;
}

/** Social units. §13.2. */
export const SOCIAL_UNITS = ['pair', 'crew', 'house', 'tenancy_league', 'open_season'] as const;
export type SocialUnit = (typeof SOCIAL_UNITS)[number];

export const SOCIAL_UNIT_SIZE: Readonly<Record<SocialUnit, { min: number; max: number | null }>> = {
  pair: { min: 2, max: 2 },
  crew: { min: 3, max: 12 },
  house: { min: 20, max: 300 },
  tenancy_league: { min: 2, max: null },
  open_season: { min: 2, max: null },
};

/** Seasons are 6-week arcs. §13.1. */
export const SEASON_LENGTH_WEEKS = 6;

/**
 * §13.6 — The Ethical Gamification Charter.
 * Enforced by the Governance Agent and asserted in `charter.spec.ts`.
 * A build that violates the Charter fails the pipeline.
 */
export const CHARTER = [
  {
    id: 'C1',
    rule: 'Chains forgive: Grace Tokens, Flare Mode and Bereavement/Carer Hold.',
  },
  {
    id: 'C2',
    rule: 'No loss-framed copy. No countdown to streak expiry.',
  },
  {
    id: 'C3',
    rule: 'No paid streak restoration. Ever.',
  },
  {
    id: 'C4',
    rule: 'No bottom-of-leaderboard exposure. Users see their own position and the band above.',
  },
  {
    id: 'C5',
    rule: 'No variable-ratio reward mechanics for under-18s.',
  },
  {
    id: 'C6',
    rule:
      'No appearance, weight, BMI or calorie framing is ever surfaced to a user under 18, ' +
      'in any mode or locale. For adults, body-composition features are opt-in, never a ' +
      'default, never a comparison between named individuals, and never a leaderboard.',
  },
  {
    id: 'C7',
    rule: 'Quiet is a legitimate user goal. "Check in less" is one tap from any notification.',
  },
  {
    id: 'C8',
    rule: 'The Charter is asserted in CI. A violating build fails the pipeline.',
  },
] as const;

export type CharterRuleId = (typeof CHARTER)[number]['id'];

/** Product capabilities that the Charter forbids outright, at every age. */
export const FORBIDDEN_MECHANICS = [
  'paid_streak_restore',
  'streak_expiry_countdown',
  'loss_framed_push',
  'bottom_rank_display',
  'named_minor_comparison',
  'variable_ratio_minor',
  'cancellation_friction',
  // Body-composition mechanics banned regardless of age or consent.
  'body_composition_leaderboard',
  'lowest_bmi_leaderboard',
  'public_weight_ranking',
  'child_weight_loss_contest',
  'fasting_competition',
  'calorie_minimisation_game',
  'exercise_to_erase_food_messaging',
] as const;
export type ForbiddenMechanic = (typeof FORBIDDEN_MECHANICS)[number];

/**
 * C6, scoped.
 *
 * The Charter originally banned weight, BMI and calorie framing at every
 * age. That made the platform unable to serve a problem that affects
 * children and adults alike, so the rule is now scoped by audience rather
 * than removed:
 *
 *   - Under 18: an absolute prohibition on *surfacing* any of it. A
 *     centile assessment may exist for safety and escalation, but a child
 *     is never shown a weight target, a body score, a comparison or a
 *     calorie figure. This is unchanged in strength from the original.
 *
 *   - Adults: available, but opt-in and never competitive.
 *
 * The mechanics above stay banned for everyone, at every age, consent or
 * no consent. Asserted in charter.test.ts.
 */
export const BODY_COMPOSITION_MIN_AGE = 18;

export interface BodySurfacePolicy {
  /** Whether any weight/BMI/calorie value may be displayed to this user. */
  mayDisplay: boolean;
  /** Whether the user may set a body-related target. */
  mayTarget: boolean;
  /** Whether the feature must be explicitly opted into. Always true when available. */
  requiresOptIn: boolean;
  reason: string;
}

export function bodySurfacePolicy(age: number, optedIn: boolean): BodySurfacePolicy {
  if (age < BODY_COMPOSITION_MIN_AGE) {
    return {
      mayDisplay: false,
      mayTarget: false,
      requiresOptIn: true,
      reason:
        'Under 18. Growth, energy, confidence and routine are the frame — never a number ' +
        'about the body.',
    };
  }
  return {
    mayDisplay: optedIn,
    mayTarget: optedIn,
    requiresOptIn: true,
    reason: optedIn ? 'Adult, opted in.' : 'Adult, not opted in. Off by default.',
  };
}
