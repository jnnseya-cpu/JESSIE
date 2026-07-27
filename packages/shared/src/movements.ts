import type { AgeMode } from './age-modes';

/**
 * Law 3 — Every Body Qualifies.
 * A movement without all five variants cannot be published. This is a
 * publishing gate, not an accessibility feature bolted on. §0, §10.
 */
export const MOVEMENT_VARIANTS = [
  'standing',
  'seated',
  'chair_supported',
  'bed_recliner',
  'adaptive_single_limb',
] as const;
export type MovementVariant = (typeof MOVEMENT_VARIANTS)[number];

export const VARIANT_LABELS: Readonly<Record<MovementVariant, string>> = {
  standing: 'Standing',
  seated: 'Seated',
  chair_supported: 'Chair-supported',
  bed_recliner: 'Bed / Recliner',
  adaptive_single_limb: 'Single-limb / Adaptive',
};

/**
 * The 9-dimension Movement Vector. §10.1.
 * Every movement is embedded on these axes for candidate retrieval.
 */
export interface MovementVector {
  /** What the movement is for. */
  intent: 'mobilise' | 'lengthen' | 'activate' | 'circulate' | 'decompress' | 'settle' | 'orient';
  /** Primary body region. */
  region:
    | 'cervical'
    | 'thoracic'
    | 'lumbar'
    | 'shoulder'
    | 'hip'
    | 'knee'
    | 'ankle'
    | 'wrist'
    | 'whole_body';
  /** Plane of motion. */
  plane: 'sagittal' | 'frontal' | 'transverse' | 'multi';
  /** Mechanical load. */
  load: 'none' | 'bodyweight_partial' | 'bodyweight_full' | 'external';
  /** Balance and coordination demand. 0 = none, 3 = high. */
  neuroDemand: 0 | 1 | 2 | 3;
  /** Breath coupling. */
  breath: 'none' | 'paced' | 'extended_exhale';
  /** Dominant sensory register. */
  sensory: 'proprioceptive' | 'vestibular' | 'interoceptive';
  /** Space required, in square metres. */
  footprintM2: number;
  /** Social cost — how conspicuous the movement is in a shared space. 0 = invisible, 3 = overt. */
  conspicuousness: 0 | 1 | 2 | 3;
}

/** Environment classes a Snap can be performed in. */
export const ENVIRONMENTS = [
  'desk',
  'open_office',
  'meeting_room',
  'home',
  'bedside',
  'care_setting',
  'classroom',
  'outdoors',
  'transit',
  'vehicle_stationary',
] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** Contraindication codes. A variant carries the codes it is unsuitable for. */
export const CONTRAINDICATIONS = [
  'recent_surgery',
  'joint_instability',
  'uncontrolled_cardiovascular',
  'acute_injury',
  'vestibular_disorder',
  'pregnancy_late',
  'osteoporosis_loading',
  'implanted_device',
  'uncontrolled_hypertension',
  'active_flare',
] as const;
export type ContraindicationCode = (typeof CONTRAINDICATIONS)[number];

/** Cue text for one variant in one age mode. */
export interface CueSet {
  ageMode: AgeMode;
  /** Primary instruction. A1 and A6 permit exactly one. */
  instructions: string[];
  /** Optional safety note surfaced before the movement begins. */
  safetyNote?: string;
}

export type PublishState = 'draft' | 'in_review' | 'published' | 'retired';

export interface MovementVariantRecord {
  id: string;
  variant: MovementVariant;
  vector: MovementVector;
  /** Codes this variant must not be prescribed against. */
  contraindications: ContraindicationCode[];
  /** Environments this variant is viable in. */
  environments: Environment[];
  durationSeconds: number;
  cueSets: CueSet[];
  screeningPassed: boolean;
  /** Named reviewer who signed the safety screening. §23. */
  screenedBy?: string;
  screenedAt?: string;
}

export interface Movement {
  id: string;
  slug: string;
  title: string;
  state: PublishState;
  variants: MovementVariantRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PublishGateFailure {
  reason:
    | 'missing_variant'
    | 'missing_cue_set'
    | 'screening_incomplete'
    | 'duration_out_of_range';
  detail: string;
}

/**
 * The publishing gate. There is no override flag, no `force_publish`
 * and no admin bypass — a partial movement stays in `draft` indefinitely.
 *
 * Returns an empty array when the movement may be published.
 */
export function evaluatePublishGate(
  movement: Movement,
  requiredAgeModes: readonly AgeMode[],
): PublishGateFailure[] {
  const failures: PublishGateFailure[] = [];
  const present = new Set(movement.variants.map((v) => v.variant));

  for (const required of MOVEMENT_VARIANTS) {
    if (!present.has(required)) {
      failures.push({
        reason: 'missing_variant',
        detail: `Variant "${VARIANT_LABELS[required]}" is absent.`,
      });
    }
  }

  for (const variant of movement.variants) {
    const modes = new Set(variant.cueSets.map((c) => c.ageMode));
    for (const mode of requiredAgeModes) {
      if (!modes.has(mode)) {
        failures.push({
          reason: 'missing_cue_set',
          detail: `Variant "${VARIANT_LABELS[variant.variant]}" has no cue set for age mode ${mode}.`,
        });
      }
    }
    if (!variant.screeningPassed) {
      failures.push({
        reason: 'screening_incomplete',
        detail: `Variant "${VARIANT_LABELS[variant.variant]}" has not passed contraindication screening.`,
      });
    }
    if (
      variant.durationSeconds < SNAP_DURATION_SECONDS.min ||
      variant.durationSeconds > SNAP_DURATION_SECONDS.max
    ) {
      failures.push({
        reason: 'duration_out_of_range',
        detail: `Variant "${VARIANT_LABELS[variant.variant]}" is ${variant.durationSeconds}s; a Snap must be ${SNAP_DURATION_SECONDS.min}–${SNAP_DURATION_SECONDS.max}s.`,
      });
    }
  }

  return failures;
}

/** A Snap is 90–300 seconds. Anything longer is not a Snap. §0. */
export const SNAP_DURATION_SECONDS = { min: 90, max: 300 } as const;
