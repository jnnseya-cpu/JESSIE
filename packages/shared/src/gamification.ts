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

/**
 * The adult healthy BMI range, and the only copy of it.
 *
 * It lived in `apps/backend/src/health/risk.logic.ts`, which no package
 * can import, so `energyBand` had written 18.5 again. A clinical
 * threshold with two homes is a threshold that will eventually disagree
 * with itself, and the half that moves last will be the one deciding
 * whether somebody is offered a deficit.
 */
export const HEALTHY_BMI = { min: 18.5, max: 24.9 } as const;

/**
 * Whether the daily energy band is shown to members yet.
 *
 * Released on 18 October 2026 on the instruction of Justin Nseya, the
 * platform owner, who is the named human reviewer this release rests on.
 *
 * That is recorded precisely rather than generously. The standing rule is
 * that nothing an agent writes about health reaches a member without a
 * named human reviewer, and it is satisfied: there is a named person who
 * reviewed it and decided. It is **not** a clinician's sign-off, which is
 * what an earlier draft of this comment asked for, and the difference is
 * written down here so nobody later reads this flag as clinical assurance
 * it never had. A clinical review is still worth having; it has not
 * happened.
 *
 * What the reviewer is accountable for, so the record is concrete: the
 * band's arithmetic — a 1,500 kcal floor that is never crossed, a deficit
 * capped at the lesser of 0.5 kg/week and 1% of body weight, anchored on
 * the member's own recorded intake over at least seven confirmed days —
 * and its refusal copy, which is the larger part of the surface. Seven of
 * the eight possible answers are a refusal, and those sentences are what
 * most members will actually receive.
 *
 * A boolean rather than a feature flag service, matching
 * `MOBILE_APP_RELEASED`: it is one fact and it changes once.
 */
export const ENERGY_BAND_RELEASED = true;

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

/**
 * Did movement happen on this day?
 *
 * Two kinds count and they are counted separately everywhere else: a Snap
 * the engine offered and the member completed, and a walk the member did
 * on their own and logged. Both are movement; only the first is evidence
 * about the engine's timing, which is why they stay separate fields and
 * meet only here.
 *
 * It lives in the shared package rather than beside the dashboard because
 * the streak, the readings and the rewards all have to agree on it, and a
 * predicate copied into three files is a predicate that will disagree in
 * two of them within a year.
 */
export function movedOnDay(day: { completed: number; walks: number }): boolean {
  return day.completed > 0 || day.walks > 0;
}
