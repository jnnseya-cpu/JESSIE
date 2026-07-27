import type { EvidencedValue, EvidenceSource, Range } from './confidence';

/**
 * §2 — the Digital Food Twin. A structured AI representation of the
 * photographed food, updated whenever the user corrects it.
 */

export const INTELLIGENCE_MODES = ['cooked', 'raw', 'packaged'] as const;
export type IntelligenceMode = (typeof INTELLIGENCE_MODES)[number];

export const COOKING_METHODS = [
  'boiled', 'steamed', 'baked', 'grilled', 'roasted', 'air_fried',
  'shallow_fried', 'deep_fried', 'sauteed', 'braised', 'smoked',
  'raw', 'fermented', 'reheated', 'unknown',
] as const;
export type CookingMethod = (typeof COOKING_METHODS)[number];

export interface DetectedItem {
  name: string;
  /** 0–1. Shown to the user as an ingredient-certainty bar. */
  confidence: number;
  estimatedVolumeMl?: number;
  estimatedGrams?: EvidencedValue;
}

export interface Nutrients {
  energyKcal: EvidencedValue;
  proteinG: EvidencedValue;
  carbohydrateG: EvidencedValue;
  fatG: EvidencedValue;
  saturatedFatG: EvidencedValue;
  fibreG: EvidencedValue;
  sugarsG: EvidencedValue;
  saltG: EvidencedValue;
}

export interface DigitalFoodTwin {
  id: string;
  mode: IntelligenceMode;
  detectedItems: DetectedItem[];
  cookingMethod: CookingMethod;
  /** Oil is the single largest source of uncertainty in cooked meals. */
  estimatedAddedOilMl?: Range;
  nutrients: Nutrients;
  /** 0–1 across the whole plate. */
  mealConfidence: number;
  /** Populated when the user corrects the model. */
  corrections: Correction[];
  capturedAt: string;
}

export interface Correction {
  field: string;
  from: string;
  to: string;
  correctedAt: string;
  /** A user correction outranks every inferred source. */
  source: Extract<EvidenceSource, 'user_confirmed_quantity'>;
}

/**
 * §3.3 — UK front-of-pack traffic lights. Thresholds are per 100g for
 * food. These are the published UK bands.
 */
export type Light = 'green' | 'amber' | 'red';

export interface TrafficLights {
  fat: Light;
  saturates: Light;
  sugars: Light;
  salt: Light;
}

const BANDS = {
  fat:       { green: 3.0,  red: 17.5 },
  saturates: { green: 1.5,  red: 5.0 },
  sugars:    { green: 5.0,  red: 22.5 },
  salt:      { green: 0.3,  red: 1.5 },
} as const;

function band(value: number, key: keyof typeof BANDS): Light {
  const { green, red } = BANDS[key];
  if (value <= green) return 'green';
  if (value > red) return 'red';
  return 'amber';
}

export function trafficLightsPer100g(per100g: {
  fatG: number;
  saturatesG: number;
  sugarsG: number;
  saltG: number;
}): TrafficLights {
  return {
    fat: band(per100g.fatG, 'fat'),
    saturates: band(per100g.saturatesG, 'saturates'),
    sugars: band(per100g.sugarsG, 'sugars'),
    salt: band(per100g.saltG, 'salt'),
  };
}

/**
 * §5 — the Food Intelligence Wheel. Twelve dimensions, 0–100.
 * Deliberately not one "healthy" score.
 */
export const WHEEL_DIMENSIONS = [
  'energyBalance', 'proteinStrength', 'fibreStrength', 'plantDiversity',
  'fatQuality', 'sugarLoad', 'saltLoad', 'processingLevel',
  'portionAlignment', 'personalFit', 'allergenConfidence', 'mealConfidence',
] as const;
export type WheelDimension = (typeof WHEEL_DIMENSIONS)[number];

export type FoodWheel = Record<WheelDimension, number>;

/**
 * §5 — a food is never labelled simply "bad". These are the permitted
 * framings, and the list is exhaustive.
 */
export const PERMITTED_FRAMINGS = [
  'high_frequency_concern',
  'high_in_salt',
  'high_in_saturated_fat',
  'low_in_fibre',
  'portion_may_exceed_target',
  'uncertain_ingredients',
  'better_alternatives_available',
] as const;
export type Framing = (typeof PERMITTED_FRAMINGS)[number];

export const BANNED_FRAMINGS = ['bad', 'junk', 'cheat', 'guilty', 'sinful', 'clean', 'toxic'] as const;

/**
 * §9 — the swap ladder. Level 1 changes least and is tried first;
 * "choose a different meal" is a last resort, not an opening move.
 */
export const SWAP_LEVELS = [
  { level: 1, name: 'Keep the meal, reduce one element', example: 'Use half the sauce.' },
  { level: 2, name: 'Change the cooking method', example: 'Grill or air-fry instead of deep-frying.' },
  { level: 3, name: 'Replace one side', example: 'Replace half the chips with vegetables or salad.' },
  { level: 4, name: 'Rebuild the plate', example: 'Keep the chicken, reduce the rice, add vegetables, lighter sauce.' },
  { level: 5, name: 'Choose a different meal', example: 'Grilled chicken, rice and vegetables instead of the breaded dish.' },
] as const;

export interface Swap {
  level: 1 | 2 | 3 | 4 | 5;
  action: string;
  /** Directional only — never a promised figure. */
  expectedEffect: string;
  /** Constraints the swap must respect. §4, Agent 8. */
  respects: readonly string[];
}

export const SWAP_CONSTRAINTS = [
  'culture', 'budget', 'local_availability', 'allergies', 'religion',
  'cooking_skill', 'family_size', 'preparation_time', 'preferred_foods',
  'supermarket_accessibility',
] as const;

/** §12 — the movement-pairing rule, stated as code so it cannot drift. */
export const MOVEMENT_PAIRING_COPY = {
  correct:
    'A short walk may support your movement target and break up sitting after the meal.',
  forbidden: 'Walk for 20 minutes to burn off the burger.',
} as const;
