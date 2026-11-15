/**
 * Nutri-Score, computed rather than copied.
 *
 * The front-of-pack letter, A to E, from the official algorithm applied
 * to the figures on the packet. Computed here for three reasons, each of
 * which is a thing a supermarket app does not do.
 *
 * **It shows its working.** A letter nobody can interrogate is a verdict.
 * Every point is attributed to the nutrient that earned it, so a shopper
 * can see that a cereal is a D because of sugar rather than fat, which is
 * the only version of this that leads to a different purchase.
 *
 * **It works when the database does not.** Open Food Facts publishes a
 * grade for products somebody has already graded. A new line, a store
 * brand, a reformulated recipe — these arrive with a nutrition panel and
 * no grade, and a scanner that shrugs at those is a scanner that fails in
 * exactly the aisle where the shopper has least to go on.
 *
 * **It can disagree, out loud.** When the database does publish a grade,
 * both are reported. Agreement is worth knowing and disagreement is worth
 * much more: it means the panel on the packet and the record in the
 * database are not describing the same product, which is the single most
 * useful thing a scan can discover.
 *
 * ── Which version ──
 *
 * This is the **2017** algorithm, the one published by Santé publique
 * France and used for the label as it was first rolled out. It is named
 * in every result rather than left implicit.
 *
 * The 2023 revision is real and this is not it. It changed the energy and
 * sugar tables, moved milk-based drinks into the beverage scale, capped
 * protein points for red meat, and added a penalty for non-nutritive
 * sweeteners. Implementing it from memory would produce a number that
 * looked official and was not, which is worse than being a version
 * behind and saying so. Where the database publishes a 2023 grade, that
 * grade is reported as the published one and any disagreement with this
 * computation is surfaced rather than reconciled away.
 *
 * ── What it is not ──
 *
 * It is not this platform's opinion of a food, and it is never merged
 * with anything else into a single number. `NEVER_CLAIM` forbids a
 * composite health score and this does not become one by being combined
 * with processing, additives or origin: those are reported beside it, as
 * separate readings with separate sources, because they answer different
 * questions and a shopper deciding between two yoghurts needs to see
 * which one they are actually choosing on.
 */

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/**
 * The algorithm is four algorithms wearing one name.
 *
 * Beverages get their own tables because a drink and a cheese cannot be
 * scored on the same energy scale without one of them being nonsense.
 * Added fats are scored on the ratio of saturates to total fat, because
 * every oil would otherwise be an E on energy alone. Cheese is the one
 * exception to the protein rule below. Water is defined as an A.
 */
export const NUTRI_CATEGORIES = ['food', 'beverage', 'fat', 'cheese', 'water'] as const;
export type NutriCategory = (typeof NUTRI_CATEGORIES)[number];

export const NUTRI_CATEGORY_LABELS: Readonly<Record<NutriCategory, string>> = {
  food: 'General food',
  beverage: 'Drink',
  fat: 'Added fat or oil',
  cheese: 'Cheese',
  water: 'Water',
};

/* ------------------------------------------------------------------ *
 * The point tables
 * ------------------------------------------------------------------ */

/**
 * Each table is the official list of upper bounds, in order.
 *
 * Written as thresholds rather than as a formula because the official
 * tables are not perfectly linear and a formula that is "close enough"
 * produces a different letter at the boundary, which is precisely where
 * a letter matters.
 */
type Thresholds = readonly number[];

/** Points = the count of thresholds the value exceeds. */
function pointsFor(value: number, thresholds: Thresholds): number {
  let points = 0;
  for (const threshold of thresholds) {
    if (value > threshold) points += 1;
    else break;
  }
  return points;
}

/** Energy, kJ per 100 g. */
const ENERGY_FOOD: Thresholds = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
/** Energy, kJ per 100 ml. A drink's scale is an order of magnitude tighter. */
const ENERGY_BEVERAGE: Thresholds = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270];

/** Sugars, g per 100 g. */
const SUGARS_FOOD: Thresholds = [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45];
/** Sugars, g per 100 ml. */
const SUGARS_BEVERAGE: Thresholds = [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5];

/** Saturated fat, g per 100 g. */
const SATURATES: Thresholds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** For added fats: saturates as a percentage of total fat. */
const SATURATES_RATIO: Thresholds = [10, 16, 22, 28, 34, 40, 46, 52, 58, 64];

/**
 * Sodium, mg per 100 g.
 *
 * Labels print salt and the algorithm wants sodium. Salt is sodium
 * chloride and the conversion is the official one: sodium = salt ÷ 2.5,
 * so a gram of salt is 400 mg of sodium. Doing this conversion wrongly —
 * or not at all — is the most common way an unofficial implementation
 * produces a letter that is two grades out.
 */
const SODIUM: Thresholds = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900];
export const SALT_TO_SODIUM_MG = 400;

/**
 * Oils the official algorithm counts as fruit and vegetables.
 *
 * Rapeseed, walnut and olive oils are credited at their full content in
 * the fruit/vegetable/pulse/nut component. Without this, every oil is an
 * E on energy alone and olive oil is indistinguishable from palm oil,
 * which is the comparison the component exists to make.
 *
 * This was missing from the first version of this file and the
 * reconciliation against the published grade is what found it: olive oil
 * computed D where the database published C, and the database was right.
 */
export const QUALIFYING_OILS = ['olive', 'rapeseed', 'canola', 'walnut'] as const;

/**
 * The fruit-and-vegetable percentage to score an added fat on.
 *
 * Returns 100 for a qualifying oil with no declared figure, and leaves
 * anything else alone. An oil that already declares a figure keeps it.
 */
export function oilFruitVegPercent(
  name: string,
  declared: number | null | undefined,
): number | null {
  if (declared != null) return declared;
  const haystack = name.toLowerCase();
  return QUALIFYING_OILS.some((oil) => haystack.includes(oil)) ? 100 : null;
}

/** Fruit, vegetables, pulses, nuts and rapeseed/walnut/olive oils, %. */
const FRUIT_VEG_FOOD: readonly { over: number; points: number }[] = [
  { over: 80, points: 5 },
  { over: 60, points: 2 },
  { over: 40, points: 1 },
];
const FRUIT_VEG_BEVERAGE: readonly { over: number; points: number }[] = [
  { over: 80, points: 10 },
  { over: 60, points: 4 },
  { over: 40, points: 2 },
];

/** Fibre, g per 100 g (AOAC). */
const FIBRE: Thresholds = [0.9, 1.9, 2.8, 3.7, 4.7];
/** Protein, g per 100 g. */
const PROTEIN: Thresholds = [1.6, 3.2, 4.8, 6.4, 8.0];

/* ------------------------------------------------------------------ *
 * Input and result
 * ------------------------------------------------------------------ */

export interface NutriInput {
  readonly category: NutriCategory;
  /** kJ per 100 g or ml. Supply energy OR kcal; kJ is what the table uses. */
  readonly energyKj?: number | null;
  readonly energyKcal?: number | null;
  readonly sugarsG?: number | null;
  readonly saturatesG?: number | null;
  readonly fatG?: number | null;
  /** Grams of salt. Converted to sodium internally. */
  readonly saltG?: number | null;
  readonly fibreG?: number | null;
  readonly proteinG?: number | null;
  /**
   * Percentage of fruit, vegetables, pulses and nuts.
   *
   * Absent means zero points, which is the official fallback and is
   * deliberately pessimistic: a product that does not declare its fruit
   * content does not get credit for fruit it might contain.
   */
  readonly fruitVegPercent?: number | null;
}

export interface NutriComponent {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
  readonly unit: string;
  readonly points: number;
  readonly maxPoints: number;
  /** Plain language, for somebody standing in an aisle. */
  readonly says: string;
}

export const NUTRI_GRADES = ['A', 'B', 'C', 'D', 'E'] as const;
export type NutriGrade = (typeof NUTRI_GRADES)[number];

export interface NutriResult {
  readonly grade: NutriGrade;
  readonly score: number;
  readonly category: NutriCategory;
  readonly negativePoints: number;
  readonly positivePoints: number;
  readonly negatives: readonly NutriComponent[];
  readonly positives: readonly NutriComponent[];
  /** True when the protein points were excluded by the official rule. */
  readonly proteinExcluded: boolean;
  /** Which figures the panel did not carry. Named, never assumed zero. */
  readonly missing: readonly string[];
  readonly algorithmVersion: '2017';
  /** One sentence a shopper can act on. */
  readonly says: string;
}

export const GRADE_MEANING: Readonly<Record<NutriGrade, string>> = {
  A: 'More favourable nutrient composition than most products of its kind.',
  B: 'Good nutritional quality, with minor trade-offs.',
  C: 'Middle of its category — neither a concern nor a win.',
  D: 'Less favourable: higher in some combination of sugar, saturated fat or salt.',
  E: 'Least favourable composition in its category. Fine occasionally; not an everyday basket item.',
};

/* ------------------------------------------------------------------ *
 * The computation
 * ------------------------------------------------------------------ */

const KCAL_TO_KJ = 4.184;

/**
 * Score a product.
 *
 * Returns null rather than a letter when the panel is too incomplete to
 * score. A Nutri-Score computed from two of its four negative inputs is
 * not a cautious Nutri-Score, it is a different and much better-looking
 * number, and the products most likely to be missing figures are not
 * randomly distributed.
 */
export function nutriScore(input: NutriInput): NutriResult | null {
  if (input.category === 'water') {
    return {
      grade: 'A',
      score: -15,
      category: 'water',
      negativePoints: 0,
      positivePoints: 0,
      negatives: [],
      positives: [],
      proteinExcluded: false,
      missing: [],
      algorithmVersion: '2017',
      says: 'Water is graded A by definition.',
    };
  }

  const beverage = input.category === 'beverage';
  const energyKj =
    input.energyKj ??
    (input.energyKcal != null ? Math.round(input.energyKcal * KCAL_TO_KJ) : null);

  const missing: string[] = [];
  const need = (value: number | null | undefined, name: string): number | null => {
    if (value == null || !Number.isFinite(value)) {
      missing.push(name);
      return null;
    }
    return value;
  };

  const energy = need(energyKj, 'energy');
  const sugars = need(input.sugarsG, 'sugars');
  const saturates = need(input.saturatesG, 'saturated fat');
  const salt = need(input.saltG, 'salt');

  /*
   * All four negatives are required. The positives are not: a missing
   * fibre figure costs the product points it might have earned, which is
   * the conservative direction. A missing negative would hand it points
   * it has not earned, which is the direction that misleads.
   */
  if (energy == null || sugars == null || saturates == null || salt == null) {
    return null;
  }

  const energyPoints = pointsFor(energy, beverage ? ENERGY_BEVERAGE : ENERGY_FOOD);
  const sugarPoints = pointsFor(sugars, beverage ? SUGARS_BEVERAGE : SUGARS_FOOD);

  /*
   * Added fats are scored on the proportion of their fat that is
   * saturated, not on the absolute amount. Without this, olive oil and
   * lard score identically on the saturates line, which is the one
   * comparison a bottle of oil exists to lose.
   */
  let saturatesPoints: number;
  let saturatesValue = saturates;
  let saturatesUnit = 'g per 100 g';
  let saturatesLabel = 'Saturated fat';
  if (input.category === 'fat' && input.fatG != null && input.fatG > 0) {
    saturatesValue = Math.round((saturates / input.fatG) * 1000) / 10;
    saturatesUnit = '% of total fat';
    saturatesLabel = 'Saturated share of the fat';
    saturatesPoints = pointsFor(saturatesValue, SATURATES_RATIO);
  } else {
    saturatesPoints = pointsFor(saturates, SATURATES);
  }

  const sodiumMg = salt * SALT_TO_SODIUM_MG;
  const sodiumPoints = pointsFor(sodiumMg, SODIUM);

  const negativePoints = energyPoints + sugarPoints + saturatesPoints + sodiumPoints;

  const fruitVeg = input.fruitVegPercent ?? 0;
  if (input.fruitVegPercent == null) missing.push('fruit and vegetable content');
  const fruitTable = beverage ? FRUIT_VEG_BEVERAGE : FRUIT_VEG_FOOD;
  const fruitPoints = fruitTable.find((row) => fruitVeg > row.over)?.points ?? 0;

  const fibre = input.fibreG ?? 0;
  if (input.fibreG == null) missing.push('fibre');
  const fibrePoints = pointsFor(fibre, FIBRE);

  const protein = input.proteinG ?? 0;
  if (input.proteinG == null) missing.push('protein');
  const proteinPointsRaw = pointsFor(protein, PROTEIN);

  /*
   * The protein rule, and the reason it exists.
   *
   * Above eleven negative points, protein stops counting — otherwise a
   * processed meat high in salt and saturated fat climbs back up the
   * scale on its protein content alone. Two exceptions: cheese, which is
   * always allowed its protein, and anything already scoring full marks
   * on fruit and vegetables, which has demonstrated it is not that kind
   * of product.
   */
  const fullFruitMarks = fruitPoints >= (beverage ? 10 : 5);
  const proteinCounts =
    negativePoints < 11 || input.category === 'cheese' || fullFruitMarks;
  const proteinPoints = proteinCounts ? proteinPointsRaw : 0;
  const positivePoints = fruitPoints + fibrePoints + proteinPoints;

  const score = negativePoints - positivePoints;
  const grade = gradeFor(score, input.category);

  const negatives: NutriComponent[] = [
    component('energy', 'Energy', energy, 'kJ per 100 g', energyPoints, 10),
    component('sugars', 'Sugars', sugars, 'g per 100 g', sugarPoints, 10),
    component('saturates', saturatesLabel, saturatesValue, saturatesUnit, saturatesPoints, 10),
    component('sodium', 'Salt', salt, 'g per 100 g', sodiumPoints, 10),
  ];
  const positives: NutriComponent[] = [
    component('fruitVeg', 'Fruit, vegetables, pulses and nuts', fruitVeg, '%', fruitPoints, beverage ? 10 : 5),
    component('fibre', 'Fibre', input.fibreG ?? null, 'g per 100 g', fibrePoints, 5),
    {
      ...component('protein', 'Protein', input.proteinG ?? null, 'g per 100 g', proteinPoints, 5),
      says: proteinCounts
        ? pointSentence('Protein', proteinPoints, 5)
        : `Protein scored ${proteinPointsRaw} of 5, and those points do not count: ` +
          'the official rule withholds them above eleven negative points, so a ' +
          'high-protein product cannot climb the scale on protein alone.',
    },
  ];

  return {
    grade,
    score,
    category: input.category,
    negativePoints,
    positivePoints,
    negatives,
    positives,
    proteinExcluded: !proteinCounts && proteinPointsRaw > 0,
    missing: [...new Set(missing)],
    algorithmVersion: '2017',
    says: verdictSentence(grade, negatives),
  };
}

function component(
  key: string,
  label: string,
  value: number | null,
  unit: string,
  points: number,
  maxPoints: number,
): NutriComponent {
  return { key, label, value, unit, points, maxPoints, says: pointSentence(label, points, maxPoints) };
}

function pointSentence(label: string, points: number, max: number): string {
  if (points === 0) return `${label} scored nothing against it.`;
  if (points === max) return `${label} is at the top of the scale — ${points} of ${max}.`;
  return `${label} scored ${points} of ${max}.`;
}

/**
 * The sentence a shopper actually reads.
 *
 * Names the single nutrient carrying most of the penalty, because "this
 * is a D" changes nothing and "this is a D because of the sugar" changes
 * which box goes in the trolley.
 */
function verdictSentence(grade: NutriGrade, negatives: readonly NutriComponent[]): string {
  const worst = [...negatives].sort((a, b) => b.points - a.points)[0];
  if (grade === 'A' || grade === 'B' || !worst || worst.points === 0) {
    return GRADE_MEANING[grade];
  }
  return `${GRADE_MEANING[grade]} Most of that is ${worst.label.toLowerCase()}.`;
}

/**
 * Score to letter.
 *
 * Beverages use their own cut-offs, and A is unreachable for anything but
 * water — which is the point of the drinks scale and surprises people.
 */
export function gradeFor(score: number, category: NutriCategory): NutriGrade {
  if (category === 'water') return 'A';
  if (category === 'beverage') {
    if (score <= 1) return 'B';
    if (score <= 5) return 'C';
    if (score <= 9) return 'D';
    return 'E';
  }
  if (score <= -1) return 'A';
  if (score <= 2) return 'B';
  if (score <= 10) return 'C';
  if (score <= 18) return 'D';
  return 'E';
}

/* ------------------------------------------------------------------ *
 * The comparison rule
 * ------------------------------------------------------------------ */

/**
 * Whether two grades may be compared at all.
 *
 * The label is built to rank a yoghurt against another yoghurt. Ranking
 * olive oil against a frozen pizza produces a true number and a false
 * conclusion, and it is the single most common way the score is misread
 * — including by people who designed shelf-edge displays around it.
 *
 * So the comparison is refused across categories rather than discouraged
 * in a footnote.
 */
export function mayCompare(
  a: NutriCategory,
  b: NutriCategory,
): { allowed: boolean; why: string } {
  if (a === b) {
    return {
      allowed: true,
      why: `Both are ${NUTRI_CATEGORY_LABELS[a].toLowerCase()}, so the letters are on the same scale.`,
    };
  }
  return {
    allowed: false,
    why:
      `${NUTRI_CATEGORY_LABELS[a]} and ${NUTRI_CATEGORY_LABELS[b].toLowerCase()} ` +
      'are scored on different tables, so their letters do not rank against ' +
      'each other. Nutri-Score compares like with like.',
  };
}

/* ------------------------------------------------------------------ *
 * Reconciliation with the published grade
 * ------------------------------------------------------------------ */

export interface NutriReconciliation {
  readonly computed: NutriGrade | null;
  readonly published: NutriGrade | null;
  readonly agree: boolean | null;
  readonly says: string;
}

/**
 * Compare what the panel says with what the database publishes.
 *
 * Disagreement is not an error to be smoothed over. It means the
 * nutrition figures on this record and the grade on this record describe
 * different things — a reformulation the grade has not caught up with, a
 * mis-entered panel, or a product scored under the 2023 revision while
 * this computes the 2017 one. All three are worth telling a shopper, and
 * none of them is worth hiding behind whichever number looks tidier.
 */
export function reconcile(
  computed: NutriGrade | null,
  published: string | null | undefined,
): NutriReconciliation {
  const pub = normaliseGrade(published);
  if (!computed && !pub) {
    return {
      computed: null,
      published: null,
      agree: null,
      says: 'No Nutri-Score: the panel is missing figures the algorithm needs, and the database publishes none.',
    };
  }
  if (computed && !pub) {
    return {
      computed,
      published: null,
      agree: null,
      says: `Computed ${computed} from the panel on the packet. The database publishes no grade for this product.`,
    };
  }
  if (!computed && pub) {
    return {
      computed: null,
      published: pub,
      agree: null,
      says: `The database publishes ${pub}. The panel here is missing figures, so this could not be checked independently.`,
    };
  }
  if (computed === pub) {
    return {
      computed,
      published: pub,
      agree: true,
      says: `${computed}, and the published grade agrees.`,
    };
  }
  return {
    computed,
    published: pub,
    agree: false,
    says:
      `The panel computes ${computed} and the database publishes ${pub}. ` +
      'They disagree, which usually means the recipe changed and one of the ' +
      'two has not caught up, or the published grade uses the 2023 revision. ' +
      'Treat the packet in your hand as the one describing what you are buying.',
  };
}

function normaliseGrade(value: string | null | undefined): NutriGrade | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return (NUTRI_GRADES as readonly string[]).includes(upper) ? (upper as NutriGrade) : null;
}

/* ------------------------------------------------------------------ *
 * What it does not see
 * ------------------------------------------------------------------ */

/**
 * The limitations, carried with every result rather than in a footnote.
 *
 * A score shown without these is a score that gets over-read, and the
 * things it ignores are precisely the things this scanner reports
 * separately: how processed the product is, what has been added to it,
 * and where it came from. Saying so is what makes the other three
 * readings legible instead of decorative.
 */
export const NUTRI_LIMITATIONS: readonly string[] = [
  'It compares like with like. A letter only ranks a product against others of its kind, never against a different food group.',
  'It does not see additives, sweeteners or how processed a product is — those are read separately here.',
  'It does not see vitamins or minerals.',
  'It scores per 100 g or 100 ml, so it says nothing about how much is in the pack or how much you will eat.',
  'It is voluntary. A product with no letter has not been scored, which is not the same as scoring badly.',
];
