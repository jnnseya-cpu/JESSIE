import {
  ALLERGEN_UNKNOWN_COPY,
  BANNED_FRAMINGS,
  MEAL_INTELLIGENCE_CAPTION,
  NEVER_CLAIM,
  PERMITTED_FRAMINGS,
  UK_ALLERGENS,
  allergenStatus,
  confidenceFor,
  energyAgreement,
  estimate,
  intelligenceBand,
  macroSplit,
  mealIntelligence,
  trafficLightsPer100g,
  type Allergen,
  type EvidenceSource,
} from '@jessmove/foodlens';

/**
 * The analysis pipeline, kept free of Nest decorators so the tests can
 * exercise it directly. The service supplies detected items — from the
 * vision model when a provider is configured, from the caller's
 * declarations otherwise — and this file turns them into the honest
 * result the FoodLens page describes: a range, a source, a confidence
 * level, and refusals where refusal is the only correct answer.
 */

export interface DetectedFood {
  readonly name: string;
  readonly confidencePct: number;
}

export interface AnalysisFacts {
  /** Age gates what may be shown, not what is computed. */
  readonly age: number;
  readonly items: readonly DetectedFood[];
  readonly likelyKcal: number | null;
  /** How the energy figure is evidenced. */
  readonly source: EvidenceSource;
  readonly per100g?: { fatG: number; saturatesG: number; sugarsG: number; saltG: number };
  readonly grams?: { proteinG: number; carbohydrateG: number; fatG: number };
  readonly portionCertainty: number;
  readonly preparationCertainty: number;
  readonly allergenEvidence?: {
    source: EvidenceSource;
    declaresPresent?: readonly Allergen[];
    declaresFullList?: boolean;
  };
}

export function analyse(facts: AnalysisFacts): Record<string, unknown> {
  const confidence = confidenceFor(facts.source);
  const itemCoverage =
    facts.items.length === 0
      ? 0
      : facts.items.reduce((a, i) => a + Math.min(Math.max(i.confidencePct, 0), 100), 0) /
        (facts.items.length * 100);

  const score = mealIntelligence({
    bestSource: facts.source,
    itemCoverage,
    portionCertainty: clamp01(facts.portionCertainty),
    preparationCertainty: clamp01(facts.preparationCertainty),
  });

  const minor = facts.age < 18;

  // §14 — the energy figure is a range unless the source is verified,
  // and below 18 it is not shown at all, under any consent setting.
  const energy =
    facts.likelyKcal == null
      ? null
      : minor
        ? { withheld: true as const, why: 'No calorie figures are shown under 18, in any mode.' }
        : {
            ...estimate(facts.likelyKcal, facts.source, 0.18),
            unit: 'kcal',
            source: facts.source,
            confidence,
          };

  const agreement =
    !minor && facts.likelyKcal != null && facts.grams
      ? energyAgreement(facts.likelyKcal, facts.grams)
      : null;

  return {
    items: facts.items,
    intelligence: {
      score,
      ...intelligenceBand(score),
      caption: MEAL_INTELLIGENCE_CAPTION,
    },
    energy,
    macros: !minor && facts.grams ? macroSplit(facts.grams) : null,
    energyAgreement: agreement,
    frontOfPack: facts.per100g ? trafficLightsPer100g(facts.per100g) : null,
    // The grams behind the bands, so the surface can print the figure
    // beside the colour — colour alone is not an accessible signal.
    per100g: facts.per100g ?? null,
    allergens: UK_ALLERGENS.map((allergen) => {
      const status = facts.allergenEvidence
        ? allergenStatus(allergen, facts.allergenEvidence)
        : 'unknown';
      return { allergen, status, ...(status === 'unknown' ? { note: ALLERGEN_UNKNOWN_COPY } : {}) };
    }),
    wheel: wheelFrom(facts, score, minor),
    framing: { permitted: PERMITTED_FRAMINGS, banned: BANNED_FRAMINGS },
    neverClaimed: NEVER_CLAIM,
    underEighteen: minor,
  };
}

/**
 * The twelve-axis wheel, filled only where the photograph actually told
 * us something. An axis with no evidence is null rather than a middling
 * guess — a half-full spoke would read as a measurement, and it is not
 * one. Under 18 the energy axis is absent along with every other figure.
 */
export function wheelFrom(
  facts: AnalysisFacts,
  intelligenceScore: number,
  minor: boolean,
): Record<string, number | null> {
  const per100g = facts.per100g;
  // Front-of-pack thresholds, inverted: a low load is a high reading.
  const invert = (value: number, low: number, high: number): number =>
    Math.round(100 - Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)));

  const grams = facts.grams;
  const proteinShare =
    grams && grams.proteinG + grams.carbohydrateG + grams.fatG > 0
      ? grams.proteinG / (grams.proteinG + grams.carbohydrateG + grams.fatG)
      : null;

  const allergenConfidence = facts.allergenEvidence?.declaresFullList
    ? 100
    : facts.allergenEvidence
      ? 55
      : null;

  return {
    energyBalance: minor || facts.likelyKcal == null ? null : Math.round(clamp01(facts.portionCertainty) * 100),
    proteinStrength: proteinShare == null ? null : Math.round(Math.min(1, proteinShare / 0.35) * 100),
    fibreStrength: null,
    plantDiversity: null,
    fatQuality: per100g ? invert(per100g.saturatesG, 1.5, 5) : null,
    sugarLoad: per100g ? invert(per100g.sugarsG, 5, 22.5) : null,
    saltLoad: per100g ? invert(per100g.saltG, 0.3, 1.5) : null,
    processingLevel: null,
    portionAlignment: Math.round(clamp01(facts.portionCertainty) * 100),
    personalFit: null,
    allergenConfidence,
    mealConfidence: intelligenceScore,
  };
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

/** The JSON contract the vision model must return. */
export const VISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'likelyKcal', 'portionCertainty', 'preparationCertainty'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'confidencePct'],
        properties: {
          name: { type: 'string' },
          confidencePct: { type: 'number', minimum: 0, maximum: 100 },
        },
      },
    },
    likelyKcal: { type: 'number', minimum: 0, maximum: 6000 },
    portionCertainty: { type: 'number', minimum: 0, maximum: 1 },
    preparationCertainty: { type: 'number', minimum: 0, maximum: 1 },
    grams: {
      type: 'object',
      additionalProperties: false,
      required: ['proteinG', 'carbohydrateG', 'fatG'],
      properties: {
        proteinG: { type: 'number', minimum: 0 },
        carbohydrateG: { type: 'number', minimum: 0 },
        fatG: { type: 'number', minimum: 0 },
      },
    },
    per100g: {
      type: 'object',
      additionalProperties: false,
      required: ['fatG', 'saturatesG', 'sugarsG', 'saltG'],
      properties: {
        fatG: { type: 'number', minimum: 0 },
        saturatesG: { type: 'number', minimum: 0 },
        sugarsG: { type: 'number', minimum: 0 },
        saltG: { type: 'number', minimum: 0 },
      },
    },
  },
} as const;

export const VISION_PROMPT = [
  'You are FoodLens, the meal-photo analyst for a wellness platform.',
  'Identify the foods on the plate and estimate the meal generously honestly.',
  'Rules that override everything else:',
  '- Confidence per item reflects genuine visual certainty, never politeness.',
  '- likelyKcal is your central estimate; the platform will widen it into a range itself.',
  '- grams holds your best estimate of protein, carbohydrate and fat for the whole plate.',
  '- per100g holds fat, saturates, sugars and salt per 100g, so front-of-pack bands can be shown.',
  '- portionCertainty and preparationCertainty are 0–1 and low unless a reference object or clear preparation is visible.',
  '- Never claim an allergen is absent, never diagnose, never judge the eater.',
  '',
  'Output format, and it is strict:',
  '- Return a single raw JSON object and nothing else.',
  '- No markdown code fence, no ```json, no commentary before or after it.',
  '- Use exactly the keys in the schema. Do not invent keys.',
  '- If the photograph genuinely cannot be read as food, return',
  '  {"items": [], "likelyKcal": 0, "portionCertainty": 0, "preparationCertainty": 0,',
  '   "imageUsable": false, "imageIssue": "<one short sentence>"}.',
].join('\n');
