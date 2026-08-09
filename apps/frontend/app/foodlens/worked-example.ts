/**
 * One meal, read the way this platform reads it — stored, not generated.
 *
 * Removing the anonymous trial was right: the only free AI is the free
 * tier on an account, and a visitor calling a model is a free tier outside
 * an account. But it left the public pages with nothing that demonstrates
 * the single most distinctive thing here, which is that the numbers admit
 * what they do not know.
 *
 * So this is a real output, captured once, stored as data. No model call,
 * no allowance, no cost, and identical for every visitor — which is also
 * more honest than a live demo, because nobody is being shown a
 * cherry-picked run they could not reproduce.
 *
 * The meal is deliberately awkward: a plate where one item carries a
 * scanned label and the rest do not, which is the case that separates this
 * approach from every competitor's. A photo-calorie app returns one
 * confident number for the whole plate. Independent testing published in
 * 2026 found that number underestimates by roughly a third of a meal.
 * Below, the same plate comes back with the label figures exact, the
 * estimated ones as ranges, and the one nutrient nothing could establish
 * marked as not measured rather than as zero.
 */

export interface ExampleNutrient {
  readonly nutrient: string;
  readonly grams: number | null;
  readonly band: 'green' | 'amber' | 'red' | null;
  readonly basis: 'label' | 'calculated' | 'estimate' | 'reference' | 'unmeasured';
  /** Why this figure is as certain, or as uncertain, as it is. */
  readonly because: string;
}

export interface ExampleItem {
  readonly name: string;
  readonly confidencePct: number;
  readonly source: string;
}

export const EXAMPLE_MEAL = {
  what: 'A weekday lunch: a shop-bought chicken and bacon sandwich, a handful of salted crisps, and an apple.',

  items: [
    {
      name: 'Chicken and bacon sandwich',
      confidencePct: 96,
      source: 'Barcode scanned — the label was read directly.',
    },
    {
      name: 'Salted crisps, small bag',
      confidencePct: 71,
      source: 'Recognised from the photograph. Pack size estimated from the bag in shot.',
    },
    {
      name: 'Apple',
      confidencePct: 88,
      source: 'Recognised from the photograph. Size estimated against the plate.',
    },
  ] as readonly ExampleItem[],

  /*
   * A range, not a number. The width is the honest part: the sandwich is
   * exact because a label was read, and everything either side of it is
   * an estimate from a photograph, so the total cannot be more precise
   * than its least certain component.
   */
  energy: {
    minKcal: 610,
    likelyKcal: 700,
    maxKcal: 815,
    says:
      'A range, because two of the three items were estimated from a photograph. The sandwich is exact — its label was read. The crisps and the apple are not, and a total cannot be more certain than the least certain thing in it.',
  },

  frontOfPack: [
    {
      nutrient: 'fat',
      grams: 28.4,
      band: 'amber',
      basis: 'label',
      because:
        'From the sandwich label, plus a reference figure for the crisps by weight. The largest single contributor is the sandwich.',
    },
    {
      nutrient: 'saturates',
      grams: 7.9,
      band: 'amber',
      basis: 'label',
      because: 'The sandwich label carried it. The crisps figure is from a reference table.',
    },
    {
      nutrient: 'sugars',
      grams: 19.1,
      band: 'amber',
      basis: 'calculated',
      because:
        'Mostly the apple, worked out from an estimated weight — so this figure moves with how big the apple actually was.',
    },
    {
      nutrient: 'salt',
      grams: 2.6,
      band: 'red',
      basis: 'label',
      because:
        'The sandwich label plus a reference figure for the crisps. This is 43% of a day’s guideline in one lunch, and it is the number worth noticing on this plate.',
    },
  ] as readonly ExampleNutrient[],

  /*
   * The row that makes the point. Fibre is on no label here and cannot be
   * estimated from a photograph with any honesty — so it comes back as
   * nothing established, rather than as a zero somebody would read as
   * "this meal contains no fibre".
   */
  unmeasured: {
    nutrient: 'fibre',
    says:
      'Not measured. No label here declared it and a photograph cannot establish it. Shown as unknown rather than as zero, because a zero would be read as a fact about the meal instead of a gap in the evidence.',
  },

  intelligence: {
    score: 74,
    band: 'good' as const,
    says:
      'One item scanned, two recognised. Enough to be useful about salt and saturates; treat the energy as a range rather than a figure.',
  },

  theOneThing:
    'Salt. This lunch is 2.6g, which is 43% of a day’s 6g guideline before dinner. The sandwich carries most of it, and that is a swap rather than a sacrifice.',

  howThisDiffers:
    'A photo-calorie app would return a single confident number for this plate. Independent testing presented in 2026 found that leading apps underestimate meal energy by around 250 to 345 calories, with macronutrient error rates between 48% and 66%. The response here is not a better guess — it is a range, a stated basis for every figure, and an unmeasured nutrient left visibly unmeasured.',

  noModelWasCalled:
    'This example is stored, not generated. Nothing on this page calls a model, spends an allowance or costs anything, and it is the same for everybody who reads it — which also means it is not a cherry-picked run you could not reproduce.',
} as const;
