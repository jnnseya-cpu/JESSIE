import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  RETENTION_DAYS,
  WINDOW_DAYS,
  entryFromProduct,
  summarise,
  type FoodLogEntry,
} from '../src/foodlens/food-log.logic.ts';

const NOW = new Date('2026-08-02T12:00:00.000Z');
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const entry = (over: Partial<FoodLogEntry> & { at: string }): FoodLogEntry => ({
  id: `fl_${Math.random().toString(36).slice(2, 8)}`,
  kind: 'barcode',
  name: 'Something',
  basis: 'label',
  ...over,
});

test('a pack is scaled from per-100g figures by the size actually bought', () => {
  const built = entryFromProduct({
    id: 'x',
    name: 'Mature Cheddar',
    grams: 400,
    kcalPer100g: 416,
    per100g: { fatG: 34.9, saturatesG: 21.7, sugarsG: 0.1, saltG: 1.8 },
  });
  assert.equal(built.kcal, 1664);
  assert.equal(built.saturatesG, 86.8);
  assert.equal(built.saltG, 7.2);
  assert.equal(built.basis, 'label');
});

test('a pack whose size is unknown contributes nothing rather than a guess', () => {
  const built = entryFromProduct({ id: 'x', name: 'Loose mushrooms', grams: null, kcalPer100g: 22 });
  assert.equal(built.kcal, null);
  assert.equal(built.grams, null);
});

test("a week's shop is not read as one day's eating", () => {
  // Five products, scanned in one trip: about three days of food. Dividing
  // by the single day they were scanned on would say 25g of salt a day,
  // and that figure is what a health warning would then be built from.
  const shop: FoodLogEntry[] = [
    entry({ at: daysAgo(0), name: 'Cheddar', kcal: 1664, saltG: 7.2, saturatesG: 86.8 }),
    entry({ at: daysAgo(0), name: 'Bacon', kcal: 960, saltG: 8.7, saturatesG: 29.4 }),
    entry({ at: daysAgo(0), name: 'Bread', kcal: 1880, saltG: 7.8, saturatesG: 2.4 }),
    entry({ at: daysAgo(0), name: 'Cola', kcal: 840, saltG: 0, saturatesG: 0 }),
    entry({ at: daysAgo(0), name: 'Chicken', kcal: 1060, saltG: 2, saturatesG: 3 }),
  ];
  const summary = summarise(shop, 'month', NOW);

  assert.equal(summary.daysRecorded, 1, 'it was all scanned on one day');
  assert.ok(summary.daysCovered >= 3, `and carries ${summary.daysCovered} days of food`);

  const salt = summary.totals.find((t) => t.key === 'saltG');
  assert.equal(salt?.total, 25.7);
  assert.ok(salt!.perDay > 6 && salt!.perDay < 9, `per day is ${salt?.perDay}, not 25.7`);
});

test('a fortnight of scanning inside a year is a fortnight of evidence', () => {
  // The opposite failure: spreading real records across the whole window
  // would make everybody look angelic.
  const meals: FoodLogEntry[] = Array.from({ length: 14 }, (_, i) =>
    entry({ at: daysAgo(i), kind: 'photo', basis: 'estimate', name: 'Dinner', kcal: 800, saltG: 5 }),
  );
  const summary = summarise(meals, 'year', NOW);
  assert.equal(summary.daysRecorded, 14);
  const salt = summary.totals.find((t) => t.key === 'saltG');
  assert.equal(salt?.perDay, 5, 'five a day, not five times fourteen over 365');
});

test('entries outside the window are not counted', () => {
  const rows = [
    entry({ at: daysAgo(2), kcal: 500, saltG: 1 }),
    entry({ at: daysAgo(20), kcal: 500, saltG: 1 }),
  ];
  assert.equal(summarise(rows, 'week', NOW).entries, 1);
  assert.equal(summarise(rows, 'month', NOW).entries, 2);
});

test('the ledger says what carries each nutrient, largest first', () => {
  const summary = summarise(
    [
      entry({ at: daysAgo(1), name: 'Bacon', kcal: 960, saltG: 8.7 }),
      entry({ at: daysAgo(1), name: 'Bread', kcal: 1880, saltG: 7.8 }),
      entry({ at: daysAgo(1), name: 'Chicken', kcal: 1060, saltG: 2 }),
    ],
    'month',
    NOW,
  );
  const salt = summary.totals.find((t) => t.key === 'saltG');
  assert.deepEqual(
    salt?.topContributors.map((c) => c.name),
    ['Bacon', 'Bread', 'Chicken'],
  );
});

test('how much came from a label rather than a photograph is reported', () => {
  const summary = summarise(
    [
      entry({ at: daysAgo(1), name: 'Packet', kcal: 500, saltG: 3, basis: 'label' }),
      entry({ at: daysAgo(1), name: 'Plate', kcal: 500, saltG: 1, basis: 'estimate' }),
    ],
    'month',
    NOW,
  );
  const salt = summary.totals.find((t) => t.key === 'saltG');
  assert.equal(salt?.fromLabelPct, 75);
});

test('an empty ledger says so rather than showing zeros as facts', () => {
  const summary = summarise([], 'month', NOW);
  assert.equal(summary.entries, 0);
  assert.deepEqual(summary.totals, []);
  assert.match(summary.coverage, /Nothing scanned/);
});

test('a year is bucketed by month; a month is bucketed by day', () => {
  const rows = [
    entry({ at: '2026-02-11T10:00:00.000Z', kcal: 500 }),
    entry({ at: '2026-03-11T10:00:00.000Z', kcal: 500 }),
    entry({ at: daysAgo(1), kcal: 500 }),
  ];
  const year = summarise(rows, 'year', NOW);
  assert.ok(year.buckets.every((b) => b.label.length === 7), 'YYYY-MM');

  const month = summarise(rows, 'month', NOW);
  assert.ok(month.buckets.every((b) => b.label.length === 10), 'YYYY-MM-DD');
});

test('the windows and the retention period are the published ones', () => {
  assert.deepEqual(WINDOW_DAYS, { week: 7, month: 30, year: 365, all: 1095 });
  assert.equal(RETENTION_DAYS, 1095, 'three years');
});

/* ── macros in the ledger ──────────────────────────────────────────── */

/*
 * FoodLens estimated protein, carbohydrate and fat for every plate it read
 * and then threw the grams away, because the ledger only held the UK
 * front-of-pack five. Which meant the platform could tell somebody on
 * appetite-suppressing medication to put protein first at every meal and
 * had no way to tell them whether they had.
 *
 * The failure mode these tests exist for is not a missing number. It is a
 * present one that is wrong in the dangerous direction: a protein total
 * summed across scans that carried a figure, divided by every day in the
 * window, reads far lower than the truth — and the action that follows an
 * understated protein figure is "eat more protein", which is the one thing
 * you must not say to somebody with reduced kidney function.
 */

const macroEntry = (over: Partial<FoodLogEntry>): FoodLogEntry => ({
  id: `m_${Math.random().toString(36).slice(2, 8)}`,
  at: new Date().toISOString(),
  kind: 'photo',
  name: 'Meal',
  grams: 400,
  kcal: 600,
  basis: 'estimate',
  ...over,
});

test('a missing protein figure is never counted as a zero', () => {
  const measured = summarise(
    [
      macroEntry({ proteinG: 30 }),
      macroEntry({ proteinG: 30 }),
      macroEntry({ proteinG: 30 }),
    ],
    'week',
  );
  const withGaps = summarise(
    [
      macroEntry({ proteinG: 30 }),
      macroEntry({ proteinG: 30 }),
      macroEntry({ proteinG: 30 }),
      macroEntry({ proteinG: null }),
      macroEntry({ proteinG: null }),
    ],
    'week',
  );

  const protein = (s: ReturnType<typeof summarise>) => s.totals.find((t) => t.key === 'proteinG')!;
  assert.equal(protein(measured).total, 90);
  assert.equal(protein(withGaps).total, 90, 'the unmeasured scans changed the total');
  assert.equal(protein(withGaps).measuredIn, 3);
  assert.equal(protein(withGaps).ofEntries, 5);
});

test('a daily average is withheld when too little of the window carried a figure', () => {
  const thin = summarise(
    [
      macroEntry({ proteinG: 30 }),
      macroEntry({ proteinG: null }),
      macroEntry({ proteinG: null }),
      macroEntry({ proteinG: null }),
    ],
    'week',
  );
  const protein = thin.totals.find((t) => t.key === 'proteinG')!;
  assert.equal(protein.total, 30, 'the total is real and is still shown');
  assert.equal(
    protein.dailyIsMeaningful,
    false,
    'one scan in four produced a daily protein figure, which is our missing data wearing a member’s habits',
  );

  // Salt, measured on all four, is fine.
  const salty = summarise(
    [
      macroEntry({ saltG: 1 }),
      macroEntry({ saltG: 1 }),
      macroEntry({ saltG: 1 }),
      macroEntry({ saltG: 1 }),
    ],
    'week',
  );
  assert.equal(salty.totals.find((t) => t.key === 'saltG')!.dailyIsMeaningful, true);
});

test('a label’s protein figure is scaled to the pack, and an absent one stays absent', () => {
  const withProtein = entryFromProduct({
    id: 'x',
    name: 'Greek yoghurt',
    grams: 500,
    kcalPer100g: 97,
    per100g: { fatG: 5, saturatesG: 3, sugarsG: 4, saltG: 0.1, proteinG: 9, fibreG: 0 },
  });
  assert.equal(withProtein.proteinG, 45, '9g per 100g across a 500g pot');
  assert.equal(withProtein.fibreG, 0, 'a real zero on the label is a zero');

  const withoutProtein = entryFromProduct({
    id: 'y',
    name: 'Own-brand something',
    grams: 500,
    kcalPer100g: 97,
    per100g: { fatG: 5, saturatesG: 3, sugarsG: 4, saltG: 0.1 },
  });
  assert.equal(withoutProtein.proteinG, null, 'a label with no protein figure produced one');
  assert.equal(withoutProtein.fibreG, null);
});

test('a scan carrying only macros is still ledger material', () => {
  // The gate used to look at the front-of-pack five alone, so a plate the
  // model read protein off and nothing else was dropped on the floor.
  const summary = summarise([macroEntry({ kcal: null, proteinG: 28 })], 'week');
  assert.equal(summary.entries, 1);
  assert.ok(summary.totals.some((t) => t.key === 'proteinG'));
});

test('a ledger write never hand-copies the fields it stores', () => {
  /*
   * How protein first shipped broken. The controller listed every column
   * by name at three write sites; adding a field updated one of them, the
   * other two silently kept writing the old five, and nothing failed —
   * rows just went in with a null protein figure and the ledger quietly
   * had no protein in it.
   *
   * The fix is structural rather than a fourth careful edit: the entry is
   * spread, so a field added to it cannot be dropped on the way to the
   * database.
   */
  const controller = readFileSync(
    new URL('../src/foodlens/foodlens.controller.ts', import.meta.url),
    'utf8',
  );
  const barcodeWrites = [...controller.matchAll(/foodLog\.record\(uid, \{\s*\n\s*kind: 'barcode'/g)];
  assert.deepEqual(
    barcodeWrites,
    [],
    'a barcode ledger write lists its fields by hand, which is how a column gets silently dropped',
  );
  assert.equal(
    (controller.match(/const \{ id: _id, at: _at, \.\.\.fields \} = entry;/g) ?? []).length,
    2,
    'both barcode write sites should spread the entry',
  );
});
