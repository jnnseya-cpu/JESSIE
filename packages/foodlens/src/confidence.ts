/**
 * §14 — Accuracy and trust architecture.
 *
 * The single most important design rule in this module: be highly
 * intelligent without pretending a photograph provides perfect
 * nutritional certainty. Everything here exists to make uncertainty
 * explicit rather than hide it behind a tidy number.
 */

/** Where a value came from. Ordered best-first — see DATA_PRIORITY. */
export const EVIDENCE_SOURCES = [
  'user_confirmed_quantity',
  'verified_manufacturer_label',
  'barcode_verified_product',
  'restaurant_supplied_recipe',
  'trusted_composition_database',
  'ai_visual_estimate',
  'general_recipe_probability',
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** §16 — data priority. A lower index always wins. */
export const DATA_PRIORITY: readonly EvidenceSource[] = EVIDENCE_SOURCES;

export function preferSource(a: EvidenceSource, b: EvidenceSource): EvidenceSource {
  return DATA_PRIORITY.indexOf(a) <= DATA_PRIORITY.indexOf(b) ? a : b;
}

export const CONFIDENCE_LEVELS = [
  'verified',
  'high',
  'medium',
  'low',
  'unknown',
] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export function confidenceFor(source: EvidenceSource): ConfidenceLevel {
  switch (source) {
    case 'user_confirmed_quantity':
    case 'verified_manufacturer_label':
    case 'barcode_verified_product':
      return 'verified';
    case 'restaurant_supplied_recipe':
      return 'high';
    case 'trusted_composition_database':
      return 'medium';
    case 'ai_visual_estimate':
      return 'low';
    default:
      return 'unknown';
  }
}

/**
 * The confidence cone. Never show a single figure where the underlying
 * estimate is a range — a photograph cannot resolve oil and sauce.
 */
export interface Range {
  min: number;
  likely: number;
  max: number;
}

export class FalsePrecisionError extends Error {
  constructor(field: string) {
    super(
      `${field} was given as an exact figure, but its evidence source does not support ` +
        `exactness. Supply a range instead.`,
    );
    this.name = 'FalsePrecisionError';
  }
}

/**
 * Builds a range and refuses to collapse it when the source is an
 * estimate. This is the guard that stops "690 kcal" being presented
 * as fact when it is really 620–760.
 */
export function estimate(
  likely: number,
  source: EvidenceSource,
  spread = 0.1,
): Range {
  const level = confidenceFor(source);
  if (level === 'verified') {
    return { min: likely, likely, max: likely };
  }
  const widen = level === 'low' || level === 'unknown' ? spread * 2 : spread;
  return {
    min: Math.round(likely * (1 - widen)),
    likely: Math.round(likely),
    max: Math.round(likely * (1 + widen)),
  };
}

export function isExact(range: Range): boolean {
  return range.min === range.likely && range.likely === range.max;
}

/** A value the user is shown, always carrying its own provenance. */
export interface EvidencedValue {
  range: Range;
  source: EvidenceSource;
  confidence: ConfidenceLevel;
  /** The single largest reason this is not more certain. */
  mainUncertainty?: string;
}

export function evidenced(
  likely: number,
  source: EvidenceSource,
  mainUncertainty?: string,
): EvidencedValue {
  return {
    range: estimate(likely, source),
    source,
    confidence: confidenceFor(source),
    mainUncertainty,
  };
}

/**
 * §14 — claims the module must never make, whatever the model outputs.
 * Each is a hard refusal, not a confidence threshold.
 */
export const NEVER_CLAIM = [
  'allergen_absence_from_appearance',
  'microbial_safety_from_image',
  'disease_diagnosis',
  'exact_calorie_count_from_photo',
  'medical_treatment_advice',
  'that_movement_cancels_out_food',
  'a_single_composite_health_score',
  'a_comparison_against_another_named_person',
] as const;
export type ForbiddenClaim = (typeof NEVER_CLAIM)[number];

export class ForbiddenClaimError extends Error {
  constructor(readonly claim: ForbiddenClaim) {
    super(`FoodLens must never assert: ${claim}`);
    this.name = 'ForbiddenClaimError';
  }
}
