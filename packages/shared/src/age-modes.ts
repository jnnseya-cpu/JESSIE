import { MIN_BODY_PX } from './design';

/**
 * §6 — The OS runs six modes. Mode is derived from verified age band plus
 * capability profile, not chosen freely. Mode governs UI density, copy
 * register, MOVA's voice, gamification mechanics, data collection scope,
 * safeguarding rules and clinical guardrails.
 *
 * The six bands are canonical: a single interface must not be presented
 * to a ten-year-old and a ninety-year-old. Adulthood in particular is not
 * one band — the movement problem at 24 (meetings, commuting, early
 * career) is not the movement problem at 55 (stiffness, joint load,
 * sustainable energy), and collapsing them produces coaching that fits
 * neither.
 */
export const AGE_MODES = [
  'explorer',
  'teen',
  'momentum',
  'balance',
  'independence',
  'vitality',
] as const;
export type AgeMode = (typeof AGE_MODES)[number];

/** Circle / Proxy is cross-cutting, not an age band. §6.6. */
export type OperatingMode = AgeMode | 'circle';

export interface AgeModeDefinition {
  readonly mode: AgeMode;
  readonly label: string;
  readonly minAge: number;
  readonly maxAge: number;
  /** MOVA's register in this mode. One personality, six voices. */
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
  /** What this mode is actually built to solve, in one line. */
  readonly focus: string;
}

export const AGE_MODE_DEFINITIONS: Readonly<Record<AgeMode, AgeModeDefinition>> = {
  explorer: {
    mode: 'explorer',
    label: 'Explorer Mode',
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
    focus: 'Adventure, not health. Screen-break missions, coordination, classroom-safe play.',
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
    focus: 'Autonomy and identity. Revision resets, gaming recovery, private crews.',
  },
  momentum: {
    mode: 'momentum',
    label: 'Momentum Mode',
    minAge: 18,
    maxAge: 39,
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
    focus: 'University, hybrid work, commuting, early parenting. Meeting recovery and stress resets.',
  },
  balance: {
    mode: 'balance',
    label: 'Balance Mode',
    minAge: 40,
    maxAge: 64,
    register: 'Direct, unfussy, respectful of a full workload. Long-horizon framing.',
    dailyCap: 5,
    minBodyPx: MIN_BODY_PX.default,
    contrast: 'AA',
    strictLexicon: false,
    instructionCeiling: 3,
    durationRange: [90, 300],
    guardianRequired: false,
    openLeaderboards: true,
    freeTextAllowed: true,
    biometricsAllowed: true,
    focus:
      'Stiffness prevention, joint-friendly strength, posture, travel movement, ' +
      'optional menopause-aware personalisation.',
  },
  independence: {
    mode: 'independence',
    label: 'Independence Mode',
    minAge: 65,
    maxAge: 79,
    register: 'Unhurried, plain, respectful. Capability neutral.',
    dailyCap: 4,
    minBodyPx: MIN_BODY_PX.independence,
    contrast: 'AAA',
    strictLexicon: false,
    instructionCeiling: 2,
    durationRange: [90, 240],
    guardianRequired: false,
    openLeaderboards: true,
    freeTextAllowed: true,
    biometricsAllowed: true,
    focus: 'Balance, lower-limb strength, grip and gait — confidence and staying independent.',
  },
  vitality: {
    mode: 'vitality',
    label: 'Vitality Mode',
    minAge: 80,
    maxAge: 100,
    register: 'Slow, concrete, one action per screen. No timers, no failure states.',
    dailyCap: 2,
    minBodyPx: MIN_BODY_PX.vitality,
    contrast: 'AAA',
    strictLexicon: true,
    instructionCeiling: 1,
    durationRange: [90, 180],
    guardianRequired: false,
    openLeaderboards: true,
    freeTextAllowed: true,
    biometricsAllowed: true,
    readingAgeCeiling: 9,
    focus: 'Dignity and simplicity. Seated and bed-compatible, carer-assisted, voice-operated.',
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
  return age < AGE_MODE_DEFINITIONS.explorer.minAge ? 'explorer' : 'vitality';
}

/** A minor may never be placed into an adult mode. */
export function isMinorMode(mode: AgeMode): boolean {
  return mode === 'explorer' || mode === 'teen';
}

/** Independence and Vitality default to the chair-supported variant. §6.4. */
export function defaultsToChairSupport(mode: AgeMode): boolean {
  return mode === 'independence' || mode === 'vitality';
}

/** Standing work is opt-up in later-life modes, never opt-out. §6.4, §6.5. */
export function standingRequiresClearance(mode: AgeMode): boolean {
  return mode === 'vitality';
}
