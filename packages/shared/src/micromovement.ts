import type { AgeMode } from './age-modes';
import { MOVEMENT_VARIANTS, type MovementVariant } from './movements';
import { MAX_WEEKLY_ESCALATION } from './snaps';

/**
 * The micro-movement selection engine.
 *
 * Choosing what somebody will actually do in the next two minutes is a
 * constraint-satisfaction problem before it is a coaching problem. The
 * room, the clothes, the noise, the privacy and the body all narrow the
 * library — and every one of those narrowings must be able to explain
 * itself, because an unexplained refusal looks like a bug.
 *
 * The ordering rule that matters: constraints are applied before
 * preference. A movement the person loves that would have them kneeling
 * on an office floor in a suit is not offered, however much they love it.
 */

/* ============================================================
   1 — Environment
   ============================================================ */

export const SPACE_LEVELS = ['seat_only', 'arms_length', 'one_stride', 'open_room'] as const;
export type SpaceLevel = (typeof SPACE_LEVELS)[number];

export const NOISE_LEVELS = ['silent', 'quiet', 'unrestricted'] as const;
export type NoiseLevel = (typeof NOISE_LEVELS)[number];

export const PRIVACY_LEVELS = ['public', 'semi_public', 'private'] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const FOOTWEAR = ['barefoot', 'socks', 'soft_shoes', 'formal_shoes', 'heels', 'boots'] as const;
export type Footwear = (typeof FOOTWEAR)[number];

export const CLOTHING = ['unrestrictive', 'work_clothes', 'formal', 'restrictive'] as const;
export type Clothing = (typeof CLOTHING)[number];

export interface MovementEnvironment {
  readonly space: SpaceLevel;
  readonly noise: NoiseLevel;
  readonly privacy: PrivacyLevel;
  readonly footwear: Footwear;
  readonly clothing: Clothing;
  /** Whether a stable surface is within reach. Governs balance work. */
  readonly stableSupport: boolean;
  /** Moving vehicle, train, plane. Blocks anything needing balance. */
  readonly inMotion: boolean;
}

/* ============================================================
   2 — Movement requirements
   ============================================================ */

export interface MovementRequirements {
  readonly minSpace: SpaceLevel;
  readonly maxNoise: NoiseLevel;
  /** Lowest privacy this movement is comfortable in. */
  readonly minPrivacy: PrivacyLevel;
  readonly needsGrip: boolean;
  readonly needsBalance: boolean;
  readonly needsFloor: boolean;
  readonly forbiddenFootwear: readonly Footwear[];
  readonly needsUnrestrictiveClothing: boolean;
}

const SPACE_ORDER: readonly SpaceLevel[] = SPACE_LEVELS;
const NOISE_ORDER: readonly NoiseLevel[] = NOISE_LEVELS;
const PRIVACY_ORDER: readonly PrivacyLevel[] = PRIVACY_LEVELS;

const rank = <T,>(order: readonly T[], v: T) => order.indexOf(v);

/* ============================================================
   3 — Fit, with reasons
   ============================================================ */

export interface FitResult {
  readonly fits: boolean;
  /** Every constraint that failed, in the words the user is shown. */
  readonly blockedBy: readonly string[];
  /** What would have to change for this to become available. */
  readonly unlockedBy: readonly string[];
}

/**
 * A movement fits an environment, or it does not, and it always says why.
 * A refusal that cannot name its reason is indistinguishable from a bug.
 */
export function fitsEnvironment(
  req: MovementRequirements,
  env: MovementEnvironment,
): FitResult {
  const blockedBy: string[] = [];
  const unlockedBy: string[] = [];

  if (rank(SPACE_ORDER, env.space) < rank(SPACE_ORDER, req.minSpace)) {
    blockedBy.push(`Needs ${req.minSpace.replace(/_/g, ' ')}; you have ${env.space.replace(/_/g, ' ')}.`);
    unlockedBy.push('More room — a corridor or a doorway is usually enough.');
  }
  // NOISE_LEVELS ascend in loudness. `req.maxNoise` is how loud the movement
  // gets; `env.noise` is how loud this place tolerates. Louder than tolerated
  // is a block.
  if (rank(NOISE_ORDER, req.maxNoise) > rank(NOISE_ORDER, env.noise)) {
    blockedBy.push('Makes more noise than this place allows.');
    unlockedBy.push('Somewhere you can make a little noise.');
  }
  if (rank(PRIVACY_ORDER, env.privacy) < rank(PRIVACY_ORDER, req.minPrivacy)) {
    blockedBy.push('Looks more conspicuous than you would want here.');
    unlockedBy.push('A more private spot, even a stairwell.');
  }
  if (req.needsFloor && env.space === 'seat_only') {
    blockedBy.push('Needs floor space.');
    unlockedBy.push('Room to get down and back up safely.');
  }
  if (req.needsBalance && env.inMotion) {
    blockedBy.push('Balance work is unsafe in a moving vehicle.');
    unlockedBy.push('Being stationary.');
  }
  if (req.needsBalance && !env.stableSupport) {
    blockedBy.push('No stable surface within reach.');
    unlockedBy.push('A counter, a chair back or a wall.');
  }
  if (req.forbiddenFootwear.includes(env.footwear)) {
    blockedBy.push(`Not in ${env.footwear.replace(/_/g, ' ')}.`);
    unlockedBy.push('Different footwear, or the seated variant.');
  }
  if (req.needsUnrestrictiveClothing && env.clothing !== 'unrestrictive') {
    blockedBy.push('Needs more range than these clothes allow.');
    unlockedBy.push('Looser clothing, or the reduced-range variant.');
  }

  return { fits: blockedBy.length === 0, blockedBy, unlockedBy };
}

/* ============================================================
   4 — Variant selection
   ============================================================ */

export interface MovementCapability {
  readonly baseline: MovementVariant;
  /** Standing cleared by a clinician. Governs later-life modes. */
  readonly standingCleared: boolean;
  readonly singleLimbOnly: boolean;
  readonly wheelchairUser: boolean;
  /** Today's flare state. Narrows, never widens. */
  readonly flare: boolean;
}

/**
 * Picks the variant to offer. Selection can only ever move *down* the
 * support ladder from the person's baseline, never up — an easier variant
 * is always safe to offer, a harder one never is.
 */
export function selectVariant(
  profile: MovementCapability,
  env: MovementEnvironment,
  mode: AgeMode,
): { variant: MovementVariant; because: string } {
  if (profile.wheelchairUser || profile.singleLimbOnly) {
    return {
      variant: 'adaptive_single_limb',
      because: 'Authored for this body independently, not degraded from the standing version.',
    };
  }
  if (profile.flare) {
    return { variant: 'bed_recliner', because: 'Flare reported today. The gentlest variant is the default.' };
  }
  if (env.inMotion || env.space === 'seat_only') {
    return { variant: 'seated', because: 'Seated is the only variant this space supports.' };
  }
  if (mode === 'vitality' && !profile.standingCleared) {
    return {
      variant: 'chair_supported',
      because: 'Standing work is opt-up in Vitality Mode and has not been cleared.',
    };
  }
  // In later life, support that is within reach is used rather than ignored.
  // This moves *down* the ladder from standing, which is always permitted.
  if (mode === 'independence' && profile.baseline === 'standing' && env.stableSupport) {
    return { variant: 'chair_supported', because: 'Support is within reach, so it is used.' };
  }
  return { variant: profile.baseline, because: 'Matches your baseline, and the room allows it.' };
}

/** Support ladder, gentlest first. Selection may move down it, never up. */
export const SUPPORT_LADDER: readonly MovementVariant[] = [
  'bed_recliner',
  'adaptive_single_limb',
  'chair_supported',
  'seated',
  'standing',
];

export function isDownwardSubstitution(
  from: MovementVariant,
  to: MovementVariant,
): boolean {
  return SUPPORT_LADDER.indexOf(to) <= SUPPORT_LADDER.indexOf(from);
}

/* ============================================================
   5 — Dose
   ============================================================ */

/* Law 1's escalation ceiling is defined once, in snaps.ts. */

export interface DoseInput {
  /** Seconds the person completed at this movement, most recent first. */
  readonly recentCompletions: readonly number[];
  /** 0–1, from the completion-probability model. */
  readonly completionProbability: number;
  /** Mode's permitted window. */
  readonly window: readonly [number, number];
}

/**
 * Returns a duration in seconds. Escalation is capped at 7% a week and
 * the result is always clamped into the mode's window — a Vitality-Mode
 * user cannot be handed a five-minute block because they had a good run.
 */
export function calibrateDose(input: DoseInput): { seconds: number; rationale: string } {
  const [min, max] = input.window;
  if (input.recentCompletions.length === 0) {
    return {
      seconds: min,
      rationale: 'No history yet, so it starts at the floor and earns its way up.',
    };
  }
  const last = input.recentCompletions[0];
  // Below 60% completion probability the dose comes *down*, not up.
  const factor =
    input.completionProbability >= 0.75
      ? 1 + MAX_WEEKLY_ESCALATION
      : input.completionProbability >= 0.6
        ? 1
        : 0.9;
  const seconds = Math.round(Math.min(max, Math.max(min, last * factor)));
  const rationale =
    factor > 1
      ? `Completion is strong, so it rises by the maximum ${Math.round(MAX_WEEKLY_ESCALATION * 100)}%.`
      : factor === 1
        ? 'Completion is steady. The ask stays where it is.'
        : 'Completion has slipped, so the ask gets smaller — not louder.';
  return { seconds, rationale };
}

/* ============================================================
   6 — Repetition
   ============================================================ */

/**
 * Boredom is the quiet killer of this category. A movement offered too
 * recently is suppressed even when it scores best, and the suppression is
 * itself explained.
 */
export const REPETITION_WINDOW_HOURS = 20;

export function suppressForRepetition(
  lastOfferedHoursAgo: number | undefined,
  categoryUsedTodayCount: number,
): { suppress: boolean; because?: string } {
  if (lastOfferedHoursAgo !== undefined && lastOfferedHoursAgo < REPETITION_WINDOW_HOURS) {
    return {
      suppress: true,
      because: `Offered ${Math.round(lastOfferedHoursAgo)}h ago. Variety keeps this working.`,
    };
  }
  if (categoryUsedTodayCount >= 2) {
    return { suppress: true, because: 'Two from this category already today.' };
  }
  return { suppress: false };
}

/* ============================================================
   7 — The publishing gate, restated
   ============================================================ */

/**
 * Every movement ships in all five variants with cue text for all six
 * modes. `MOVEMENT_VARIANTS` is the authority; this is the count the
 * marketing surface quotes, derived rather than typed.
 */
export const REQUIRED_VARIANTS = MOVEMENT_VARIANTS.length;

export const CUE_CHANNELS = ['text', 'audio', 'captioned_video', 'haptic', 'voice_only'] as const;
export type CueChannel = (typeof CUE_CHANNELS)[number];

/** What a movement must carry before it can be published. */
export const MOVEMENT_METADATA = [
  'target age range',
  'required capability',
  'contraindication flags',
  'accessibility alternatives',
  'environment requirements',
  'intensity',
  'balance demand',
  'equipment',
  'clinical review status',
  'version history',
] as const;
