import { REFERENCE_INTAKE } from './basket.logic';

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
  basis: 'label' | 'calculated' | 'estimate';
}

export interface NutrientRollup {
  key: 'energyKcal' | 'fatG' | 'saturatesG' | 'sugarsG' | 'saltG';
  label: string;
  total: number;
  /** Per day across the window, which is the figure guidance is written in. */
  perDay: number;
  /** That daily figure against the UK adult reference intake. */
  pctOfReference: number;
  /** How much of the total came from a label rather than a photograph. */
  fromLabelPct: number;
  topContributors: { name: string; amount: number }[];
}

export interface FoodLogSummary {
  window: LogWindow;
  windowDays: number;
  /** Days in the window on which anything at all was scanned. */
  daysRecorded: number;
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

  const totals: NutrientRollup[] = NUTRIENTS.map((nutrient) => {
    let total = 0;
    let fromLabel = 0;
    const byName = new Map<string, number>();

    for (const entry of inWindow) {
      const amount = entry[nutrient.field as keyof FoodLogEntry] as number | null | undefined;
      if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
      total += amount;
      if (entry.basis === 'label') fromLabel += amount;
      byName.set(entry.name, (byName.get(entry.name) ?? 0) + amount);
    }

    // Per day is divided by days actually recorded, not by the window. A
    // fortnight of scanning inside a year is a fortnight's evidence, and
    // spreading it across 365 days would make everybody look angelic.
    const divisor = Math.max(1, daysRecorded);
    const perDay = total / divisor;

    return {
      key: nutrient.key,
      label: nutrient.label,
      total: nutrient.key === 'energyKcal' ? Math.round(total) : round(total),
      perDay: nutrient.key === 'energyKcal' ? Math.round(perDay) : round(perDay),
      pctOfReference: Math.round((perDay / nutrient.reference) * 100),
      fromLabelPct: total > 0 ? Math.round((fromLabel / total) * 100) : 0,
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
    entries: inWindow.length,
    totals,
    series: seriesFrom(inWindow, Math.min(days, 90), now),
    buckets: bucketsFrom(inWindow, window),
    coverage:
      daysRecorded === 0
        ? 'Nothing scanned in this period yet.'
        : `Built from ${inWindow.length} scan${inWindow.length === 1 ? '' : 's'} across ${daysRecorded} day${daysRecorded === 1 ? '' : 's'}. It is what you scanned, not everything you ate.`,
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
  per100g?: { fatG?: number; saturatesG?: number; sugarsG?: number; saltG?: number } | null;
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
    basis: 'label',
  };
}
