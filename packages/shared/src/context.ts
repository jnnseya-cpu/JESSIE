import type { Environment } from './movements';

/**
 * CTX — Context Sensing Agent. §9.2.
 * "Never nudge a person who cannot move."
 * This is the single most defensible component of the system.
 */

/** Device motion state, classified on-device. */
export const MOTION_STATES = ['still', 'walking', 'driving', 'cycling', 'unknown'] as const;
export type MotionState = (typeof MOTION_STATES)[number];

/** Coarse location class. Precise coordinates are never collected or stored. */
export const LOCATION_CLASSES = [
  'home',
  'office',
  'transit',
  'outdoor',
  'clinical',
  'school',
  'unknown',
] as const;
export type LocationClass = (typeof LOCATION_CLASSES)[number];

/**
 * Determines whether MOVA offers a star jump or a discreet ankle circle.
 */
export const PRIVACY_CLASSES = ['alone', 'semi_public', 'public'] as const;
export type PrivacyClass = (typeof PRIVACY_CLASSES)[number];

/** Conditions that hard-block a nudge. §9.2. */
export const HARD_BLOCKS = [
  'driving',
  'on_call',
  'in_lesson',
  'sleep_window',
  'clinically_flagged_rest',
  'quiet_hours',
  'daily_cap_reached',
  'cooldown_active',
  'nudges_disabled',
  'safeguarding_hold',
  'bereavement_hold',
] as const;
export type HardBlock = (typeof HARD_BLOCKS)[number];

/** Signal classes CTX may consult. Each is individually revocable. */
export const SIGNAL_CLASSES = [
  'calendar',
  'motion',
  'device_state',
  'location_class',
  'declared_schedule',
  'history',
  'ambient_audio',
] as const;
export type SignalClass = (typeof SIGNAL_CLASSES)[number];

export interface MovabilityVerdict {
  verdict: 'movable' | 'blocked' | 'defer';
  confidence: number;
  environmentClass: Environment;
  privacyClass: PrivacyClass;
  /** Populated when `verdict === 'blocked'`. */
  blocks: HardBlock[];
  /** Which signal classes contributed. Must never be empty. */
  basis: SignalClass[];
  deferUntil?: string;
}

export interface ContextDecision extends MovabilityVerdict {
  id: string;
  userId: string;
  evaluatedAt: string;
  /** Decisions expire. A stale decision may never deliver a Snap. */
  ttlSeconds: number;
}

/** A ContextDecision older than its TTL must not be used to deliver. */
export function isDecisionFresh(decision: ContextDecision, now = new Date()): boolean {
  const age = (now.getTime() - new Date(decision.evaluatedAt).getTime()) / 1000;
  return age >= 0 && age < decision.ttlSeconds;
}

/**
 * Law 2 — No Empty Nudges.
 * A notification fired when the user cannot move is a defect, logged as
 * `nudge.misfire` and used to retrain the timing bandit. §0.
 */
export const NUDGE_EVENT = {
  sent: 'nudge.sent',
  converted: 'nudge.converted',
  misfire: 'nudge.misfire',
  suppressed: 'nudge.suppressed',
} as const;

/** Nudge-to-Snap conversion target. Industry reminder apps sit at 4–11%. */
export const NUDGE_CONVERSION_TARGET = 0.62;

/** Rolling misfire error budget against delivered Snaps, 28 days. */
export const MISFIRE_ERROR_BUDGET = 0.02;

/** Volume governance. §9.4 of the engineering spec. */
export const VOLUME_GOVERNANCE = {
  defaultDailyCap: 3,
  minIntervalMinutes: 90,
  hardFloorIntervalMinutes: 45,
  cooldownAfterDeclineMinutes: 120,
  cooldownAfterTwoDeclines: 'rest_of_day',
  cooldownAfterThreeExpiriesHours: 48,
} as const;
