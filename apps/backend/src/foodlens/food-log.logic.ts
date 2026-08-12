import { REFERENCE_INTAKE } from '@jessmove/foodlens';

/**
 * The ledger, added up.
 *
 * A single meal is an anecdote. Three months of them is the only honest
 * way to answer "how much salt do I actually eat?" — which is the question
 * every front-of-pack label invites and none of them can answer.
 *
 * Everything here is arithmetic on what was scanned. It is never a
 * complete record of what somebody ate, and the summary says so, because a
 * total that quietly presents itself as complete is a lie that gets acted
 * on.
 */

export type LogWindow = 'week' | 'month' | 'year' | 'all';

/** How many days each window covers. `all` is the full retention period. */
export const WINDOW_DAYS: Record<LogWindow, number> = {
  week: 7,
  month: 30,
  year: 365,
  all: 365 * 3,
};

/** Three years, then it goes. Stated once, here. */
export const RETENTION_DAYS = 365 * 3;

export interface FoodLogEntry {
  id: string;
  at: string;
  kind: 'barcode' | 'photo' | 'declared' | 'basket';
  name: string;
  barcode?: string | null;
  grams?: number | null;
  kcal?: number | null;
  fatG?: number | null;
  saturatesG?: number | null;
  sugarsG?: number | null;
  saltG?: number | null;
  /**
   * The three FoodLens has always estimated and never kept.
   *
   * Null means nobody measured it — a barcode whose record carries no
   * protein figure, or a photograph the model would not put a number on.
   * Never zero, and never filled in with an average, because the whole
   * point of a protein total is that it is the member's own.
   */
  proteinG?: number | null;
  carbohydrateG?: number | null;
  fibreG?: number | null;
  basis: 'label' | 'calculated' | 'estimate';
}

export type NutrientKey =
  | 'energyKcal'
  | 'fatG'
  | 'saturatesG'
  | 'sugarsG'
  | 'saltG'
  | 'proteinG'
  | 'carbohydrateG'
  | 'fibreG';

export interface NutrientRollup {
  key: NutrientKey;
  label: string;
  total: number;
  /** Per day across the window, which is the figure guidance is written in. */
  perDay: number;
  /** That daily figure against the UK adult reference intake. */
  pctOfReference: number;
  /** How much of the total came from a label rather than a photograph. */
  fromLabelPct: number;
  topContributors: { name: string; amount: number }[];
  /**
   * How many of the entries in the window actually carried this nutrient.
   *
   * The number that stops the whole rollup lying, and it matters for
   * protein far more than for salt. Nearly every scan carries salt;
   * protein is missing whenever a barcode record has no figure or the
   * vision model would not estimate one. Summing what is present and
   * dividing by the days the ledger covers silently treats every missing
   * entry as a zero, which reports somebody eating far less protein than
   * they are — and the action that follows an understated protein figure
   * is "eat more protein", which is exactly the wrong thing to tell
   * somebody with reduced kidney function.
   *
   * So the count travels with the figure, all the way to the page.
   */
  measuredIn: number;
  ofEntries: number;
  /**
   * True when enough of the window carried a figure for the daily average
   * to mean anything. Below that the total is still shown — it is real —
   * but the per-day figure and the percentage are not.
   */
  dailyIsMeaningful: boolean;
}

/**
 * How much of a window has to carry a nutrient before a daily average is
 * worth printing.
 *
 * Two thirds is a judgement, not a standard. Below it the missing entries
 * dominate and the average says more about what FoodLens could read than
 * about what somebody ate.
 */
export const DAILY_AVERAGE_COVERAGE = 2 / 3;

export interface FoodLogSummary {
  window: LogWindow;
  windowDays: number;
  /** Days in the window on which anything at all was scanned. */
  daysRecorded: number;
  /**
   * Days of food the ledger actually represents.
   *
   * A week's shopping is scanned in one trip. Dividing it by the one day
   * it was scanned on says a person eats 6,400 kcal and 25g of salt a day,
   * which is not merely wrong — it is the figure a health warning would
   * then be built from. Energy is the only denominator that works across
   * both a pack bought and a meal eaten, so the coverage is the larger of
   * the days scanned on and the days of food the energy adds up to.
   */
  daysCovered: number;
  entries: number;
  totals: NutrientRollup[];
  series: { day: string; kcal: number; saltG: number; saturatesG: number; sugarsG: number }[];
  /** Whole months or weeks, for the longer windows. */
  buckets: { label: string; kcal: number; saltG: number; saturatesG: number; sugarsG: number; entries: number }[];
  coverage: string;
  retentionDays: number;
}

const NUTRIENTS = [
  { key: 'energyKcal', label: 'Energy', field: 'kcal', reference: REFERENCE_INTAKE.energyKcal },
  { key: 'fatG', label: 'Fat', field: 'fatG', reference: REFERENCE_INTAKE.fatG },
  { key: 'saturatesG', label: 'Saturates', field: 'saturatesG', reference: REFERENCE_INTAKE.saturatesG },
  { key: 'sugarsG', label: 'Sugars', field: 'sugarsG', reference: REFERENCE_INTAKE.sugarsG },
  { key: 'saltG', label: 'Salt', field: 'saltG', reference: REFERENCE_INTAKE.saltG },
  { key: 'proteinG', label: 'Protein', field: 'proteinG', reference: REFERENCE_INTAKE.proteinG },
  {
    key: 'carbohydrateG',
    label: 'Carbohydrate',
    field: 'carbohydrateG',
    reference: REFERENCE_INTAKE.carbohydrateG,
  },
  { key: 'fibreG', label: 'Fibre', field: 'fibreG', reference: REFERENCE_INTAKE.fibreG },
] as const;

const round = (value: number, places = 1): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** The day an entry belongs to, in the member's own calendar terms. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

export function summarise(
  entries: FoodLogEntry[],
  window: LogWindow,
  now = new Date(),
): FoodLogSummary {
  const days = WINDOW_DAYS[window];
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const inWindow = entries.filter((e) => new Date(e.at) >= cutoff);

  const recordedDays = new Set(inWindow.map((e) => dayOf(e.at)));
  const daysRecorded = recordedDays.size;

  const totalKcal = inWindow.reduce((sum, e) => sum + (e.kcal ?? 0), 0);
  const daysOfFood = totalKcal / REFERENCE_INTAKE.energyKcal;
  const daysCovered = Math.max(1, daysRecorded, Math.round(daysOfFood * 10) / 10);

  const totals: NutrientRollup[] = NUTRIENTS.map((nutrient) => {
    let total = 0;
    let fromLabel = 0;
    let measuredIn = 0;
    const byName = new Map<string, number>();

    for (const entry of inWindow) {
      const amount = entry[nutrient.field as keyof FoodLogEntry] as number | null | undefined;
      if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
      measuredIn += 1;
      total += amount;
      if (entry.basis === 'label') fromLabel += amount;
      byName.set(entry.name, (byName.get(entry.name) ?? 0) + amount);
    }

    // Divided by the food the ledger covers, never by the window. A
    // fortnight of scanning inside a year is a fortnight's evidence, and
    // spreading it across 365 days would make everybody look angelic;
    // dividing a week's shop by its one scanning day does the opposite.
    const perDay = total / daysCovered;

    return {
      key: nutrient.key,
      label: nutrient.label,
      total: nutrient.key === 'energyKcal' ? Math.round(total) : round(total),
      perDay: nutrient.key === 'energyKcal' ? Math.round(perDay) : round(perDay),
      pctOfReference: Math.round((perDay / nutrient.reference) * 100),
      fromLabelPct: total > 0 ? Math.round((fromLabel / total) * 100) : 0,
      measuredIn,
      ofEntries: inWindow.length,
      dailyIsMeaningful:
        inWindow.length > 0 && measuredIn / inWindow.length >= DAILY_AVERAGE_COVERAGE,
      topContributors: [...byName.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, amount]) => ({
          name,
          amount: nutrient.key === 'energyKcal' ? Math.round(amount) : round(amount),
        })),
    };
  }).filter((t) => t.total > 0);

  return {
    window,
    windowDays: days,
    daysRecorded,
    daysCovered,
    entries: inWindow.length,
    totals,
    series: seriesFrom(inWindow, Math.min(days, 90), now),
    buckets: bucketsFrom(inWindow, window),
    coverage:
      daysRecorded === 0
        ? 'Nothing scanned in this period yet.'
        : `Built from ${inWindow.length} scan${inWindow.length === 1 ? '' : 's'} across ${daysRecorded} day${daysRecorded === 1 ? '' : 's'}, carrying about ${daysCovered} day${daysCovered === 1 ? '' : 's'} of food. Daily figures are against that, not against the calendar. It is what you scanned, not everything you ate.`,
    retentionDays: RETENTION_DAYS,
  };
}

/** A point per day, for drawing. Capped so a year does not become 365 bars. */
function seriesFrom(
  entries: FoodLogEntry[],
  days: number,
  now: Date,
): FoodLogSummary['series'] {
  const byDay = new Map<string, { kcal: number; saltG: number; saturatesG: number; sugarsG: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(day, { kcal: 0, saltG: 0, saturatesG: 0, sugarsG: 0 });
  }
  for (const entry of entries) {
    const bucket = byDay.get(dayOf(entry.at));
    if (!bucket) continue;
    bucket.kcal += entry.kcal ?? 0;
    bucket.saltG += entry.saltG ?? 0;
    bucket.saturatesG += entry.saturatesG ?? 0;
    bucket.sugarsG += entry.sugarsG ?? 0;
  }
  return [...byDay.entries()].map(([day, v]) => ({
    day,
    kcal: Math.round(v.kcal),
    saltG: round(v.saltG),
    saturatesG: round(v.saturatesG),
    sugarsG: round(v.sugarsG),
  }));
}

/**
 * Coarser bars: weeks inside a month, months inside a year, years across
 * the lot. A year of daily bars is a smear; twelve monthly ones is a trend.
 */
function bucketsFrom(entries: FoodLogEntry[], window: LogWindow): FoodLogSummary['buckets'] {
  const keyFor = (iso: string): string => {
    if (window === 'week' || window === 'month') return dayOf(iso);
    if (window === 'year') return iso.slice(0, 7);
    return iso.slice(0, 4);
  };

  const byKey = new Map<
    string,
    { kcal: number; saltG: number; saturatesG: number; sugarsG: number; entries: number }
  >();
  for (const entry of entries) {
    const key = keyFor(entry.at);
    const bucket = byKey.get(key) ?? { kcal: 0, saltG: 0, saturatesG: 0, sugarsG: 0, entries: 0 };
    bucket.kcal += entry.kcal ?? 0;
    bucket.saltG += entry.saltG ?? 0;
    bucket.saturatesG += entry.saturatesG ?? 0;
    bucket.sugarsG += entry.sugarsG ?? 0;
    bucket.entries += 1;
    byKey.set(key, bucket);
  }

  return [...byKey.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, v]) => ({
      label,
      kcal: Math.round(v.kcal),
      saltG: round(v.saltG),
      saturatesG: round(v.saturatesG),
      sugarsG: round(v.sugarsG),
      entries: v.entries,
    }));
}

/**
 * One scanned product, reduced to what the ledger keeps.
 *
 * Per-100g figures are useless in a total: a total needs the amount of the
 * thing that was actually bought. A pack whose size cannot be read
 * contributes nothing rather than a guess, exactly as the trolley does.
 */
export function entryFromProduct(input: {
  id: string;
  name: string;
  barcode?: string | null;
  grams?: number | null;
  kcalPer100g?: number | null;
  per100g?: {
    fatG?: number;
    saturatesG?: number;
    sugarsG?: number;
    saltG?: number;
    proteinG?: number;
    carbohydrateG?: number;
    fibreG?: number;
  } | null;
  at?: string;
}): FoodLogEntry {
  const grams = typeof input.grams === 'number' && input.grams > 0 ? input.grams : null;
  const packs = grams === null ? null : grams / 100;
  const scale = (per100: number | undefined): number | null =>
    packs === null || typeof per100 !== 'number' ? null : round(per100 * packs);

  return {
    id: input.id,
    at: input.at ?? new Date().toISOString(),
    kind: 'barcode',
    name: input.name,
    barcode: input.barcode ?? null,
    grams,
    kcal: packs === null || typeof input.kcalPer100g !== 'number'
      ? null
      : Math.round(input.kcalPer100g * packs),
    fatG: scale(input.per100g?.fatG),
    saturatesG: scale(input.per100g?.saturatesG),
    sugarsG: scale(input.per100g?.sugarsG),
    saltG: scale(input.per100g?.saltG),
    /*
     * A label figure, not an estimate. This is the best protein number the
     * platform will ever have — a manufacturer had to put it there — and
     * `scale` already returns null when the label does not carry one, so
     * an absent figure stays absent rather than becoming a zero.
     */
    proteinG: scale(input.per100g?.proteinG),
    carbohydrateG: scale(input.per100g?.carbohydrateG),
    fibreG: scale(input.per100g?.fibreG),
    basis: 'label',
  };
}
