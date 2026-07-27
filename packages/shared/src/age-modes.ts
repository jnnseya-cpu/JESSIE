import { MIN_BODY_PX } from './design';

/**
 * §6 — The OS runs six modes. Mode is derived from verified age band plus
 * capability profile, not chosen freely. Mode governs UI density, copy
 * register, Jess's voice, gamification mechanics, data collection scope,
 * safeguarding rules and clinical guardrails.
 */
export const AGE_MODES = [
  'kid',
  'teen',
  'standard',
  'silver',
  'centennial',
] as const;
export type AgeMode = (typeof AGE_MODES)[number];

/** Circle / Proxy is cross-cutting, not an age band. §6.6. */
export type OperatingMode = AgeMode | 'circle';

export interface AgeModeDefinition {
  readonly mode: AgeMode;
  readonly label: string;
  readonly minAge: number;
  readonly maxAge: number;
  /** Jess's register in this mode. One personality, six voices. */
  readonly register: string;
  /** Hard daily nudge cap. §9.2 (NUDGE). */
  readonly dailyCap: number;
  /** Minimum body type size in pixels. */
  readonly minBodyPx: number;
  /** WCAG conformance floor. */
  readonly contrast: 'AA' | 'AAA';
  /** Whether the strict lexicon applies on top of the base banned list. */
  readonly strictLexicon: boolean;
  /** Maximum simultaneous primary instructions in one Snap. */
  readonly instructionCeiling: number;
  /** Typical Snap duration window for this mode, in seconds. */
  readonly durationRange: readonly [number, number];
  /** Whether a guardian account is mandatory. */
  readonly guardianRequired: boolean;
  /** Whether open/public leaderboards may be offered. */
  readonly openLeaderboards: boolean;
  /** Whether free-text interaction with the AI is permitted. */
  readonly freeTextAllowed: boolean;
  /** Whether biometric ingestion is permitted. */
  readonly biometricsAllowed: boolean;
  /** Reading-age ceiling for all copy in this mode. */
  readonly readingAgeCeiling?: number;
}

export const AGE_MODE_DEFINITIONS: Readonly<Record<AgeMode, AgeModeDefinition>> = {
  kid: {
    mode: 'kid',
    label: 'Kid Mode',
    minAge: 10,
    maxAge: 12,
    register: 'Play-framed, permission-giving, safe. Never evaluative about the body.',
    dailyCap: 3,
    minBodyPx: MIN_BODY_PX.default,
    contrast: 'AAA',
    strictLexicon: true,
    instructionCeiling: 1,
    durationRange: [60, 120],
    guardianRequired: true,
    openLeaderboards: false,
    freeTextAllowed: false,
    biometricsAllowed: false,
    readingAgeCeiling: 9,
  },
  teen: {
    mode: 'teen',
    label: 'Teen Mode',
    minAge: 13,
    maxAge: 17,
    register: 'Dry, low-hype, zero kiddie language, zero body-image framing.',
    dailyCap: 4,
    minBodyPx: MIN_BODY_PX.default,
    contrast: 'AA',
    strictLexicon: true,
    instructionCeiling: 2,
    durationRange: [90, 180],
    guardianRequired: false,
    openLeaderboards: false,
    freeTextAllowed: true,
    biometricsAllowed: false,
  },
  standard: {
    mode: 'standard',
    label: 'Standard Mode',
    minAge: 18,
    maxAge: 64,
    register: 'Warm, brief, efficient, time-aware.',
    dailyCap: 6,
    minBodyPx: MIN_BODY_PX.default,
    contrast: 'AA',
    strictLexicon: false,
    instructionCeiling: 3,
    durationRange: [90, 300],
    guardianRequired: false,
    openLeaderboards: true,
    freeTextAllowed: true,
    biometricsAllowed: true,
  },
  silver: {
    mode: 'silver',
    label: 'Silver Mode',
    minAge: 65,
    maxAge: 79,
    register: 'Unhurried, plain, respectful. Capability neutral.',
    dailyCap: 4,
    minBodyPx: MIN_BODY_PX.silver,
    contrast: 'AAA',
    strictLexicon: false,
    instructionCeiling: 2,
    durationRange: [90, 240],
    guardianRequired: false,
    openLeaderboards: true,
    freeTextAllowed: true,
    biometricsAllowed: true,
  },
  centennial: {
    mode: 'centennial',
    label: 'Centennial Mode',
    minAge: 80,
    maxAge: 100,
    register: 'Slow, concrete, one action per screen. No timers, no failure states.',
    dailyCap: 2,
    minBodyPx: MIN_BODY_PX.centennial,
    contrast: 'AAA',
    strictLexicon: true,
    instructionCeiling: 1,
    durationRange: [90, 180],
    guardianRequired: false,
    openLeaderboards: true,
    freeTextAllowed: true,
    biometricsAllowed: true,
    readingAgeCeiling: 9,
  },
};

/**
 * Derives the mode from a verified age.
 * Mode is never inferred from behaviour, capability or delivery tier —
 * an 88-year-old may be a standing-baseline T1 user, and a 24-year-old
 * may be a bed-baseline T3 user.
 */
export function modeForAge(age: number): AgeMode {
  for (const mode of AGE_MODES) {
    const def = AGE_MODE_DEFINITIONS[mode];
    if (age >= def.minAge && age <= def.maxAge) return mode;
  }
  return age < AGE_MODE_DEFINITIONS.kid.minAge ? 'kid' : 'centennial';
}

/** A minor may never be placed into an adult mode. */
export function isMinorMode(mode: AgeMode): boolean {
  return mode === 'kid' || mode === 'teen';
}

/** Silver and Centennial default to the chair-supported variant. §6.4. */
export function defaultsToChairSupport(mode: AgeMode): boolean {
  return mode === 'silver' || mode === 'centennial';
}

/** Standing work is opt-up in later-life modes, never opt-out. §6.4, §6.5. */
export function standingRequiresClearance(mode: AgeMode): boolean {
  return mode === 'centennial';
}
