import {
  type ConfidenceLevel,
  type EvidenceSource,
  type EvidencedValue,
  type Range,
  confidenceFor,
  preferSource,
} from './confidence';
import type { CookingMethod, Light, TrafficLights } from './twin';

/**
 * FoodLens 360° — the analysis engine.
 *
 * §18 of the brand specification asks for a "Meal Intelligence" hero
 * figure. §5 of the product specification forbids a single composite
 * health score, and the wheel test asserts that no `healthScore`
 * dimension exists.
 *
 * Both survive here because they are different numbers. MEAL INTELLIGENCE
 * scores *how much the system actually knows about this plate* — evidence
 * quality, ingredient coverage, portion certainty, whether a barcode or a
 * label was read. It never scores how good the food is. A takeaway with a
 * scanned barcode and a confirmed portion earns a high Meal Intelligence;
 * a home-cooked salad photographed in bad light earns a low one. The
 * number is about the analysis, and the copy says so on every surface.
 */

/* ============================================================
   1 — Capture
   ============================================================ */

/** §18 — the live overlays the camera runs before the shutter fires. */
export const CAPTURE_CHECKS = [
  'plate_detected',
  'lighting_quality',
  'item_recognition_borders',
  'barcode_detected',
  'second_angle_guidance',
  'portion_reference_visible',
] as const;
export type CaptureCheck = (typeof CAPTURE_CHECKS)[number];

export interface CaptureState {
  readonly check: CaptureCheck;
  /** 0–1. Below `CAPTURE_ACCEPTABLE` the camera asks rather than guesses. */
  readonly score: number;
  readonly hint: string;
}

export const CAPTURE_ACCEPTABLE = 0.6;

export const CAPTURE_HINTS: Readonly<Record<CaptureCheck, string>> = {
  plate_detected: 'Fit the whole plate in frame — edges included.',
  lighting_quality: 'More light, or move out of your own shadow.',
  item_recognition_borders: 'Separate items help. Nudge things apart if you can.',
  barcode_detected: 'If it came in a packet, scan the barcode. It beats any estimate.',
  second_angle_guidance: 'A second photo from the side resolves depth, which is most of portion size.',
  portion_reference_visible: 'Include a fork, a hand or a standard mug for scale.',
};

/**
 * A photograph is a poor instrument for depth, and depth is most of
 * portion size. These are the everyday references the estimator can
 * actually use, with their nominal dimension in millimetres.
 */
export const PORTION_REFERENCES = [
  { name: 'Dinner fork', mm: 195 },
  { name: 'Teaspoon', mm: 130 },
  { name: 'Adult hand span', mm: 190 },
  { name: 'Standard mug', mm: 95 },
  { name: 'Dinner plate', mm: 270 },
  { name: 'Credit card', mm: 86 },
] as const;

/** How much the estimate tightens when a reference object is in frame. */
export function spreadForCapture(states: readonly CaptureState[]): number {
  const hasReference =
    states.find((s) => s.check === 'portion_reference_visible')?.score ?? 0;
  const hasSecondAngle =
    states.find((s) => s.check === 'second_angle_guidance')?.score ?? 0;
  const light = states.find((s) => s.check === 'lighting_quality')?.score ?? 0.5;

  // Base spread for a single photograph in acceptable light.
  let spread = 0.24;
  if (hasReference >= CAPTURE_ACCEPTABLE) spread -= 0.06;
  if (hasSecondAngle >= CAPTURE_ACCEPTABLE) spread -= 0.07;
  if (light < CAPTURE_ACCEPTABLE) spread += 0.08;
  return Number(Math.max(0.06, spread).toFixed(3));
}

/* ============================================================
   2 — Processing
   ============================================================ */

/** §18 — the visible processing sequence. Order is normative. */
export const PROCESSING_STAGES = [
  { key: 'finding', label: 'Finding foods', detail: 'Segmenting the plate into recognisable items.' },
  { key: 'portions', label: 'Estimating portions', detail: 'Volume from area and depth, against a reference object.' },
  { key: 'preparation', label: 'Checking preparation', detail: 'Cooking method, and the added oil nobody photographs.' },
  { key: 'nutrition', label: 'Calculating nutrition', detail: 'Composition lookup per item, ranges carried throughout.' },
  { key: 'pattern', label: 'Comparing with your pattern', detail: 'Against your own fortnight — never against another person.' },
  { key: 'alternatives', label: 'Creating alternatives', detail: 'The smallest change first. A different meal is a last resort.' },
] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number]['key'];

/* ============================================================
   3 — Meal Intelligence
   ============================================================ */

/**
 * The four inputs to Meal Intelligence. Each is 0–1 and each is about
 * the *analysis*, never about the food.
 */
export interface IntelligenceInput {
  /** Best evidence source available across the plate. */
  readonly bestSource: EvidenceSource;
  /** Share of detected items the model is confident it named. 0–1. */
  readonly itemCoverage: number;
  /** How tightly portion size is pinned down. 0–1. */
  readonly portionCertainty: number;
  /** Whether the cooking method — and so the added oil — is known. 0–1. */
  readonly preparationCertainty: number;
}

const SOURCE_WEIGHT: Readonly<Record<ConfidenceLevel, number>> = {
  verified: 1,
  high: 0.82,
  medium: 0.64,
  low: 0.38,
  unknown: 0.18,
};

/**
 * Returns 0–100. Deliberately *not* a judgement of the meal: the copy
 * beside it must always read "how much we know about this plate".
 */
export function mealIntelligence(input: IntelligenceInput): number {
  for (const [k, v] of Object.entries({
    itemCoverage: input.itemCoverage,
    portionCertainty: input.portionCertainty,
    preparationCertainty: input.preparationCertainty,
  })) {
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new RangeError(`${k} must be between 0 and 1`);
    }
  }
  const evidence = SOURCE_WEIGHT[confidenceFor(input.bestSource)];
  const score =
    evidence * 40 +
    input.itemCoverage * 24 +
    input.portionCertainty * 22 +
    input.preparationCertainty * 14;
  return Math.round(score);
}

/** The label shown beside the figure. There is no other permitted wording. */
export const MEAL_INTELLIGENCE_CAPTION =
  'How much we know about this plate — not a rating of the food.';

export function intelligenceBand(score: number): {
  band: 'strong' | 'workable' | 'thin';
  says: string;
} {
  if (score >= 75) {
    return {
      band: 'strong',
      says: 'Enough evidence to give you figures you can act on.',
    };
  }
  if (score >= 50) {
    return {
      band: 'workable',
      says: 'Reasonable, but the ranges are wide. One correction would narrow them.',
    };
  }
  return {
    band: 'thin',
    says: 'Mostly inference. Treat the numbers as directional and correct anything wrong.',
  };
}

/* ============================================================
   4 — Plate composition and macros
   ============================================================ */

export const PLATE_COMPONENTS = [
  'vegetables_and_salad',
  'protein',
  'starchy_carbohydrate',
  'dairy',
  'fruit',
  'fats_and_sauces',
  'discretionary',
] as const;
export type PlateComponent = (typeof PLATE_COMPONENTS)[number];

export const PLATE_LABELS: Readonly<Record<PlateComponent, string>> = {
  vegetables_and_salad: 'Vegetables & salad',
  protein: 'Protein',
  starchy_carbohydrate: 'Starchy carbohydrate',
  dairy: 'Dairy',
  fruit: 'Fruit',
  fats_and_sauces: 'Fats & sauces',
  discretionary: 'Discretionary',
};

export type PlateComposition = Partial<Record<PlateComponent, number>>;

/** Normalises a plate to percentages that sum to 100. */
export function normalisePlate(plate: PlateComposition): PlateComposition {
  const total = Object.values(plate).reduce<number>((a, v) => a + (v ?? 0), 0);
  if (total <= 0) throw new RangeError('plate must contain at least one component');
  const out: PlateComposition = {};
  for (const [k, v] of Object.entries(plate)) {
    out[k as PlateComponent] = Number((((v ?? 0) / total) * 100).toFixed(1));
  }
  return out;
}

/** Atwater factors. Used to sanity-check a macro split against energy. */
export const KCAL_PER_G = { protein: 4, carbohydrate: 4, fat: 9, fibre: 2 } as const;

export interface MacroSplit {
  readonly proteinPct: number;
  readonly carbohydratePct: number;
  readonly fatPct: number;
}

export function macroSplit(g: {
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}): MacroSplit {
  const kcal =
    g.proteinG * KCAL_PER_G.protein +
    g.carbohydrateG * KCAL_PER_G.carbohydrate +
    g.fatG * KCAL_PER_G.fat;
  if (kcal <= 0) throw new RangeError('a meal with no energy cannot have a macro split');
  const pct = (v: number, f: number) => Number((((v * f) / kcal) * 100).toFixed(1));
  return {
    proteinPct: pct(g.proteinG, KCAL_PER_G.protein),
    carbohydratePct: pct(g.carbohydrateG, KCAL_PER_G.carbohydrate),
    fatPct: pct(g.fatG, KCAL_PER_G.fat),
  };
}

/**
 * Cross-checks the stated energy against the macros. A gap means one of
 * the two is wrong, and the honest response is to widen the range rather
 * than pick a side.
 */
export function energyAgreement(statedKcal: number, g: {
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}): { impliedKcal: number; deltaPct: number; agrees: boolean } {
  const implied =
    g.proteinG * KCAL_PER_G.protein +
    g.carbohydrateG * KCAL_PER_G.carbohydrate +
    g.fatG * KCAL_PER_G.fat;
  const deltaPct = Number((((implied - statedKcal) / statedKcal) * 100).toFixed(1));
  return { impliedKcal: Math.round(implied), deltaPct, agrees: Math.abs(deltaPct) <= 12 };
}

/* ============================================================
   5 — Plant diversity
   ============================================================ */

/**
 * Distinct plants across a rolling week. Counted, never scored against
 * another person, and never framed as a target you are failing.
 */
export const PLANT_GROUPS = [
  'vegetables',
  'fruit',
  'wholegrains',
  'legumes',
  'nuts_and_seeds',
  'herbs_and_spices',
] as const;
export type PlantGroup = (typeof PLANT_GROUPS)[number];

export interface PlantPoints {
  readonly distinctPlants: number;
  readonly byGroup: Partial<Record<PlantGroup, number>>;
  readonly newThisWeek: readonly string[];
}

export function plantPoints(
  weekItems: ReadonlyArray<{ name: string; group: PlantGroup }>,
  previousWeekNames: readonly string[] = [],
): PlantPoints {
  const seen = new Set<string>();
  const byGroup: Partial<Record<PlantGroup, number>> = {};
  for (const item of weekItems) {
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    byGroup[item.group] = (byGroup[item.group] ?? 0) + 1;
  }
  const before = new Set(previousWeekNames.map((n) => n.trim().toLowerCase()));
  return {
    distinctPlants: seen.size,
    byGroup,
    newThisWeek: [...seen].filter((n) => !before.has(n)).sort(),
  };
}

/* ============================================================
   6 — Allergens
   ============================================================ */

/** The 14 allergens that must be declared in the UK. */
export const UK_ALLERGENS = [
  'celery', 'cereals containing gluten', 'crustaceans', 'eggs', 'fish',
  'lupin', 'milk', 'molluscs', 'mustard', 'peanuts', 'sesame', 'soybeans',
  'sulphur dioxide and sulphites', 'tree nuts',
] as const;
export type Allergen = (typeof UK_ALLERGENS)[number];

export type AllergenStatus = 'declared_present' | 'declared_absent' | 'unknown';

/**
 * The one rule that matters: absence is never inferred from a
 * photograph. If a label or a recipe has not declared it, the answer is
 * `unknown` — and `unknown` is displayed as a warning, not as a pass.
 */
export function allergenStatus(
  allergen: Allergen,
  evidence: { source: EvidenceSource; declaresPresent?: readonly Allergen[]; declaresFullList?: boolean },
): AllergenStatus {
  const level = confidenceFor(evidence.source);
  if (evidence.declaresPresent?.includes(allergen)) return 'declared_present';
  // Only a source that gives a *complete* declaration may say "absent".
  if (evidence.declaresFullList && (level === 'verified' || level === 'high')) {
    return 'declared_absent';
  }
  return 'unknown';
}

export const ALLERGEN_UNKNOWN_COPY =
  'Not declared by a source we can verify. We cannot tell from a photograph — ' +
  'check the packet or ask, especially if a reaction would be serious.';

/* ============================================================
   7 — Swap simulation
   ============================================================ */

export interface SwapEffect {
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly action: string;
  /** Directional deltas as percentages. Never presented as a promise. */
  readonly deltas: Readonly<Partial<Record<'energy' | 'saturates' | 'salt' | 'fibre' | 'protein', number>>>;
  readonly keeps: string;
}

/**
 * Applies a swap to a nutrient set and returns the new figures with the
 * range *widened*, because a simulated meal is less certain than the one
 * that was actually photographed.
 */
export function simulateSwap(
  before: { energyKcal: number; saturatesG: number; saltG: number; fibreG: number; proteinG: number },
  effect: SwapEffect,
): { after: typeof before; extraUncertainty: number } {
  const apply = (v: number, pct?: number) =>
    Number((v * (1 + (pct ?? 0) / 100)).toFixed(1));
  return {
    after: {
      energyKcal: Math.round(apply(before.energyKcal, effect.deltas.energy)),
      saturatesG: apply(before.saturatesG, effect.deltas.saturates),
      saltG: apply(before.saltG, effect.deltas.salt),
      fibreG: apply(before.fibreG, effect.deltas.fibre),
      proteinG: apply(before.proteinG, effect.deltas.protein),
    },
    // A meal you have not eaten yet cannot be known as well as one you have.
    extraUncertainty: 0.08,
  };
}

/* ============================================================
   8 — Pattern
   ============================================================ */

/**
 * §5 — pattern comparison is always against the person's own history.
 * There is no cohort comparison and no percentile against other users,
 * because that is a leaderboard about food and it is banned.
 */
export interface PatternPoint {
  readonly day: string;
  readonly value: number;
}

export function personalDelta(
  today: number,
  ownHistory: readonly PatternPoint[],
): { median: number; deltaPct: number; direction: 'above' | 'below' | 'typical' } {
  if (ownHistory.length === 0) {
    throw new RangeError('a pattern needs history; there is nothing to compare against yet');
  }
  const sorted = [...ownHistory].map((p) => p.value).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const deltaPct = Number((((today - median) / median) * 100).toFixed(1));
  return {
    median: Number(median.toFixed(1)),
    deltaPct,
    direction: Math.abs(deltaPct) <= 10 ? 'typical' : deltaPct > 0 ? 'above' : 'below',
  };
}

/* ============================================================
   9 — Re-exports
   ============================================================ */

/** So a caller never has to reach past this module. */
export type { ConfidenceLevel, EvidenceSource, EvidencedValue, Range };
export type { CookingMethod, Light, TrafficLights };
export { confidenceFor, preferSource };

/**
 * UK adult reference intakes, per day.
 *
 * The published figures every front-of-pack label is drawn against. They
 * live here rather than in one module because the trolley, the ledger and
 * the health picture must all be totalling against the same numbers — a
 * second copy that drifts is a set of percentages that quietly disagree.
 */
export const REFERENCE_INTAKE = {
  energyKcal: 2000,
  fatG: 70,
  saturatesG: 20,
  sugarsG: 90,
  saltG: 6,
} as const;
