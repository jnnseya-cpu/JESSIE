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
  /** Null when the model did not state one. Never a made-up middle value. */
  readonly confidencePct: number | null;
}

export interface AnalysisFacts {
  /** Age gates what may be shown, not what is computed. */
  readonly age: number;
  readonly items: readonly DetectedFood[];
  readonly likelyKcal: number | null;
  /** How the energy figure is evidenced. */
  readonly source: EvidenceSource;
  readonly per100g?: Partial<{ fatG: number; saturatesG: number; sugarsG: number; saltG: number }>;
  /** Total edible weight, which is what makes a per-100g figure derivable. */
  readonly plateGrams?: number;
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
  // Items whose confidence the model never stated cannot count towards
  // coverage in either direction — they are simply not evidence.
  const stated = facts.items.filter((i) => typeof i.confidencePct === 'number');
  const itemCoverage =
    stated.length === 0
      ? 0
      : stated.reduce((a, i) => a + Math.min(Math.max(i.confidencePct as number, 0), 100), 0) /
        (stated.length * 100);

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
    frontOfPack: frontOfPackFrom(facts),
    allergens: UK_ALLERGENS.map((allergen) => {
      const status = facts.allergenEvidence
        ? allergenStatus(allergen, facts.allergenEvidence)
        : 'unknown';
      return { allergen, status, ...(status === 'unknown' ? { note: ALLERGEN_UNKNOWN_COPY } : {}) };
    }),
    wheel: wheelFrom(facts, score, minor),
    capture: captureQualityFrom(facts),
    swaps: minor ? [] : swapLadderFor(facts),
    plants: plantsFrom(facts.items),
    framing: { permitted: PERMITTED_FRAMINGS, banned: BANNED_FRAMINGS },
    neverClaimed: NEVER_CLAIM,
    underEighteen: minor,
  };
}

/** UK front-of-pack thresholds per 100g, for the nutrients we can band. */
const BANDS = {
  fatG: { low: 3, high: 17.5, label: 'fat' },
  saturatesG: { low: 1.5, high: 5, label: 'saturates' },
  sugarsG: { low: 5, high: 22.5, label: 'sugars' },
  saltG: { low: 0.3, high: 1.5, label: 'salt' },
} as const;

/**
 * Front-of-pack, built only from figures that exist.
 *
 * Every nutrient here is either stated by the source or worked out from
 * the plate's own macros and weight, and each row says which. A nutrient
 * nobody measured does not appear — it does not appear as 0g, and it
 * does not appear as a grey box, because a panel with a hole in it is
 * more honest than a panel that fills the hole.
 */
export function frontOfPackFrom(facts: AnalysisFacts): {
  nutrient: string;
  grams: number;
  band: 'green' | 'amber' | 'red';
  derived: boolean;
  basis: 'label' | 'estimate' | 'calculated';
}[] | null {
  const rows: {
    nutrient: string;
    grams: number;
    band: 'green' | 'amber' | 'red';
    derived: boolean;
    basis: 'label' | 'estimate' | 'calculated';
  }[] = [];

  // A figure from a barcode or a confirmed label is a fact. The same
  // figure from a photograph is an estimate, and the row must say so.
  const verified =
    facts.source === 'barcode_verified_product' ||
    facts.source === 'verified_manufacturer_label' ||
    facts.source === 'user_confirmed_quantity';

  const bandFor = (value: number, low: number, high: number): 'green' | 'amber' | 'red' =>
    value <= low ? 'green' : value >= high ? 'red' : 'amber';

  for (const key of ['fatG', 'saturatesG', 'sugarsG', 'saltG'] as const) {
    const stated = facts.per100g?.[key];
    let value: number | undefined = typeof stated === 'number' ? stated : undefined;
    let derived = false;

    // Fat is the one the plate's own macros can produce exactly.
    if (value === undefined && key === 'fatG' && facts.grams && facts.plateGrams && facts.plateGrams > 20) {
      value = Number(((facts.grams.fatG / facts.plateGrams) * 100).toFixed(1));
      derived = true;
    }
    if (value === undefined) continue;

    const spec = BANDS[key];
    rows.push({
      nutrient: spec.label,
      grams: value,
      band: bandFor(value, spec.low, spec.high),
      derived,
      basis: derived ? 'calculated' : verified ? 'label' : 'estimate',
    });
  }

  return rows.length > 0 ? rows : null;
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
    fatQuality: typeof per100g?.saturatesG === 'number' ? invert(per100g.saturatesG, 1.5, 5) : null,
    sugarLoad: typeof per100g?.sugarsG === 'number' ? invert(per100g.sugarsG, 5, 22.5) : null,
    saltLoad: typeof per100g?.saltG === 'number' ? invert(per100g.saltG, 0.3, 1.5) : null,
    processingLevel: null,
    portionAlignment: Math.round(clamp01(facts.portionCertainty) * 100),
    personalFit: null,
    allergenConfidence,
    mealConfidence: intelligenceScore,
  };
}

/**
 * What the photograph gave us, and what would have made it better. Every
 * failed check is a specific instruction rather than a scolding — a
 * barcode or a second angle is worth more than any amount of model
 * confidence, and the member is the only one who can supply them.
 */
export function captureQualityFrom(facts: AnalysisFacts): {
  checks: { check: string; passed: boolean; detail: string }[];
  passRate: number;
} {
  // An item with no stated certainty is not "named with confidence" —
  // silence is not agreement.
  const namedWell =
    facts.items.length > 0 &&
    facts.items.every((i) => typeof i.confidencePct === 'number' && i.confidencePct >= 60);

  const checks = [
    {
      check: 'Food recognised',
      passed: facts.items.length > 0,
      detail: facts.items.length > 0
        ? `${facts.items.length} item${facts.items.length === 1 ? '' : 's'} named.`
        : 'Nothing on the plate could be named.',
    },
    {
      check: 'Named with confidence',
      passed: namedWell,
      detail: namedWell
        ? 'Every item was recognised clearly.'
        : 'At least one item is a guess. Correcting it narrows everything below.',
    },
    {
      check: 'Portion pinned down',
      passed: facts.portionCertainty >= 0.6,
      detail:
        facts.portionCertainty >= 0.6
          ? 'The portion is reasonably clear.'
          : 'A second photo from the side resolves depth, which is most of portion size.',
    },
    {
      check: 'Preparation known',
      passed: facts.preparationCertainty >= 0.6,
      detail:
        facts.preparationCertainty >= 0.6
          ? 'The cooking method is visible.'
          : 'Cooking method is unclear, and that is where the hidden oil lives.',
    },
    {
      check: 'Verified source',
      passed: facts.source === 'barcode_verified_product' || facts.source === 'user_confirmed_quantity',
      detail:
        facts.source === 'barcode_verified_product' || facts.source === 'user_confirmed_quantity'
          ? 'A verified source is in play, so the range can collapse.'
          : 'If it came in a packet, scan the barcode. It beats any estimate.',
    },
    {
      check: 'Allergens declared',
      passed: Boolean(facts.allergenEvidence?.declaresFullList),
      detail: facts.allergenEvidence?.declaresFullList
        ? 'A complete declaration is available.'
        : 'No verifiable declaration, so absence can never be stated.',
    },
  ];

  return {
    checks,
    passRate: Math.round((checks.filter((c) => c.passed).length / checks.length) * 100),
  };
}

/**
 * The swap ladder: the smallest change first. "Choose something else" is
 * level five, because a suggestion that ignores what you actually feel
 * like eating is a suggestion nobody takes.
 */
export function swapLadderFor(facts: AnalysisFacts): {
  level: number;
  action: string;
  effect: string;
  keeps: string;
}[] {
  const fatty = (facts.per100g?.fatG ?? 0) >= 17.5 || facts.preparationCertainty < 0.5;
  const salty = (facts.per100g?.saltG ?? 0) >= 1.5;

  const ladder = [
    {
      level: 1,
      action: salty ? 'Use half the sauce or dressing.' : 'Keep the meal, reduce one element.',
      effect: 'Directional: less salt and less added fat, same meal.',
      keeps: 'Everything you actually wanted to eat.',
    },
    {
      level: 2,
      action: fatty ? 'Grill or air-fry instead of deep-frying.' : 'Change the cooking method.',
      effect: 'Directional: the largest single change to added oil.',
      keeps: 'The same dish, sauce and sides.',
    },
    {
      level: 3,
      action: 'Replace one side — half the chips or rice for vegetables or salad.',
      effect: 'Directional: more fibre, more volume, less energy density.',
      keeps: 'The main part of the plate.',
    },
    {
      level: 4,
      action: 'Rebuild the plate: keep the protein, reduce the starch, add vegetables.',
      effect: 'Directional: a different balance, same ingredients.',
      keeps: 'The food you already have in.',
    },
    {
      level: 5,
      action: 'Choose a different meal.',
      effect: 'The last resort, deliberately.',
      keeps: 'Nothing — which is why it is last.',
    },
  ];
  return ladder;
}

/**
 * Distinct plants on the plate, named as plants.
 *
 * A model returns "Fried ripe plantain (dodo), deep-fried slices" — one
 * plant wearing a sentence. Counting the sentence gives a diversity list
 * nobody can read, so the plant word itself is what gets counted, once.
 */
const PLANT_WORDS = [
  'plantain', 'banana', 'apple', 'orange', 'mango', 'berry', 'blueberry', 'strawberry',
  'tomato', 'potato', 'sweet potato', 'yam', 'cassava', 'rice', 'oat', 'wheat', 'barley',
  'quinoa', 'bean', 'black bean', 'lentil', 'chickpea', 'pea', 'spinach', 'kale', 'cabbage',
  'broccoli', 'cauliflower', 'carrot', 'pepper', 'onion', 'spring onion', 'leek', 'garlic',
  'ginger', 'turmeric', 'coriander', 'parsley', 'basil', 'mushroom', 'courgette', 'aubergine',
  'cucumber', 'lettuce', 'avocado', 'sweetcorn', 'corn', 'okra', 'celery', 'beetroot',
  'squash', 'pumpkin', 'olive', 'almond', 'walnut', 'cashew', 'peanut', 'sesame', 'seed',
] as const;

export function plantsFrom(items: readonly DetectedFood[]): {
  distinct: string[];
  count: number;
} {
  const found = new Set<string>();
  for (const item of items) {
    const text = item.name.toLowerCase();
    for (const plant of PLANT_WORDS) {
      // Word-boundary match so "pea" does not fire inside "peanut butter".
      if (new RegExp(`\\b${plant}s?\\b`).test(text)) found.add(plant);
    }
  }
  // Prefer the specific name where both matched: "black bean" over "bean".
  const distinct = [...found].filter(
    (plant) => ![...found].some((other) => other !== plant && other.includes(plant)),
  );
  return { distinct: distinct.sort(), count: distinct.length };
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

/** The JSON contract the vision model must return. */
export const VISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'likelyKcal', 'portionCertainty', 'preparationCertainty', 'per100g', 'grams', 'plateGrams'],
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
    plateGrams: { type: 'number', minimum: 0, maximum: 5000 },
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
  '- Every item MUST carry confidencePct: your genuine visual certainty, 0-100.',
  '- Never default to 50. If you are sure, say 90+. If you are guessing, say 20.',
  '- likelyKcal is your central estimate; the platform will widen it into a range itself.',
  '- grams holds your best estimate of protein, carbohydrate and fat for the whole plate.',
  '- per100g is REQUIRED: fat, saturates, sugars and salt per 100g of this food.',
  '- If no label is visible, estimate per100g from the typical composition of the dish.',
  '  An estimate labelled as an estimate is useful; an omission is not. Never return all zeros.',
  '- grams is the whole plate: protein, carbohydrate and fat in grams.',
  '- plateGrams is the total edible weight of the meal in grams, your best estimate.',
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
