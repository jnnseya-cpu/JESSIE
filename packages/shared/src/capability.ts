import type { ContraindicationCode, MovementVariant } from './movements';

/**
 * §6.7 — The Adaptive Layer is not a mode. It is a permanent capability
 * profile that cross-cuts every mode and maps to hard filters in the
 * Prescription Agent's candidate retrieval, and to Effort Equivalence
 * scoring so competition stays fair.
 */

export const ADAPTIVE_FLAGS = [
  'seated_permanent',
  'seated_temporary',
  'single_limb',
  'limited_grip',
  'low_vision',
  'deaf_or_hoh',
  'cognitive_load_ceiling',
  'chronic_pain_fatigue',
  'post_surgical_restriction',
  'pregnancy_postnatal',
] as const;
export type AdaptiveFlag = (typeof ADAPTIVE_FLAGS)[number];

/** Chronic conditions that drive Flare Mode eligibility. */
export const FATIGUE_CONDITIONS = [
  'me_cfs',
  'long_covid',
  'fibromyalgia',
  'ms',
  'other',
] as const;
export type FatigueCondition = (typeof FATIGUE_CONDITIONS)[number];

export type CapabilityVolatility = 'static' | 'recovering' | 'progressive' | 'relapsing';

export interface CapabilityProfile {
  userId: string;
  /** The variant the user starts from. Standing is never assumed. */
  baselineVariant: MovementVariant;
  adaptiveFlags: AdaptiveFlag[];
  fatigueCondition?: FatigueCondition;
  contraindications: ContraindicationCode[];
  /** Drives the re-profiling cadence. */
  volatility: CapabilityVolatility;
  /** Ceiling on simultaneous instructions the user can hold. */
  instructionCeiling: number;
  /** Set by a clinician in Care Link; the user cannot raise it themselves. */
  clinicianRestrictions?: ClinicianRestriction[];
  confirmedBy: 'self' | 'carer' | 'clinician';
  confirmedAt: string;
  updatedAt: string;
}

export interface ClinicianRestriction {
  code: ContraindicationCode | 'balance_risk' | 'standing_work';
  setBy: string;
  setAt: string;
  expiresAt?: string;
  note?: string;
}

/** Re-profiling cadence in days, by volatility. */
export const REPROFILE_CADENCE_DAYS: Readonly<Record<CapabilityVolatility, number>> = {
  static: 180,
  recovering: 14,
  progressive: 30,
  relapsing: 21,
};

/**
 * Resolves which variants are permissible for a profile.
 * Returns an empty array when nothing is safe — in which case the
 * Prescription Agent must not deliver, and logs a `library_gap` event.
 * It never substitutes an unsafe variant.
 */
export function permittedVariants(profile: CapabilityProfile): MovementVariant[] {
  const flags = new Set(profile.adaptiveFlags);
  const restricted = new Set((profile.clinicianRestrictions ?? []).map((r) => r.code));

  const all: MovementVariant[] = [
    'standing',
    'seated',
    'chair_supported',
    'bed_recliner',
    'adaptive_single_limb',
  ];

  return all.filter((variant) => {
    if (variant === 'standing') {
      if (flags.has('seated_permanent') || flags.has('seated_temporary')) return false;
      if (restricted.has('standing_work') || restricted.has('balance_risk')) return false;
    }
    if (variant === 'chair_supported' && restricted.has('balance_risk')) {
      // Chair-supported is the falls-risk pathway and remains available.
      return true;
    }
    if (variant === 'adaptive_single_limb' && !flags.has('single_limb')) {
      // Available to anyone, but never the default unless declared.
      return true;
    }
    return true;
  });
}
