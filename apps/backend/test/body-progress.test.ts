import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alongsideFrom,
  trendFrom,
  warningsFor,
} from '../src/body/progress.logic.ts';

test('one reading is a fact; two make a direction', () => {
  assert.equal(trendFrom([]).direction, 'unknown');
  const one = trendFrom([{ day: '2026-08-01', kg: 90 }]);
  assert.equal(one.kgPerWeek, null);
  assert.match(one.says, /One reading is a fact/);

  const two = trendFrom([
    { day: '2026-08-01', kg: 90 },
    { day: '2026-08-15', kg: 88.6 },
  ]);
  assert.equal(two.direction, 'down');
  assert.equal(two.changeKg, -1.4);
  assert.equal(two.kgPerWeek, -0.7, '1.4kg over 14 days is 0.7 a week');
});

test('losing faster than one per cent of body weight a week is cautioned', () => {
  const trend = trendFrom([
    { day: '2026-08-01', kg: 90 },
    { day: '2026-08-08', kg: 88.5 },
  ]);
  const warnings = warningsFor({ age: 40, bmi: 29, trend, latestKg: 88.5 });
  const caution = warnings.find((w) => w.level === 'caution');
  assert.ok(caution, 'a 1.7% weekly loss must be cautioned');
  assert.match(caution!.says, /sustainable/);
  assert.match(caution!.action, /Eat a little more/);

  // A steady, sustainable rate says nothing at all.
  const gentle = trendFrom([
    { day: '2026-08-01', kg: 90 },
    { day: '2026-08-15', kg: 89.3 },
  ]);
  assert.equal(
    warningsFor({ age: 40, bmi: 29, trend: gentle, latestKg: 89.3 }).some((w) => w.level === 'caution'),
    false,
  );
});

test('a BMI below the healthy range stops reduction outright', () => {
  const trend = trendFrom([
    { day: '2026-08-01', kg: 52 },
    { day: '2026-08-15', kg: 51.6 },
  ]);
  const warnings = warningsFor({ age: 30, bmi: 17.4, trend, latestKg: 51.6 });
  const stop = warnings.find((w) => w.level === 'stop');
  assert.ok(stop);
  assert.match(stop!.says, /will not run a weight-reduction plan/);
  assert.match(stop!.action, /GP or a dietitian/);
});

test('under 18 there are no weight warnings of any kind', () => {
  const trend = trendFrom([
    { day: '2026-08-01', kg: 60 },
    { day: '2026-08-08', kg: 57 },
  ]);
  // The same trend that would raise a caution for an adult.
  assert.deepEqual(warningsFor({ age: 15, bmi: 17, trend, latestKg: 57 }), []);
  assert.ok(warningsFor({ age: 18, bmi: 17, trend, latestKg: 57 }).length > 0);
});

test('every warning carries an action, because worry without one is useless', () => {
  const trend = trendFrom([{ day: '2026-08-01', kg: 90 }]);
  const warnings = warningsFor({ age: 40, bmi: 41, trend, latestKg: 90 });
  assert.ok(warnings.length > 0);
  for (const w of warnings) assert.ok(w.action.length > 10, w.says);
});

test('what you did is reported beside the trend, never as its cause', () => {
  const alongside = alongsideFrom({ daysMoved: 9, mealsChecked: 4, windowDays: 14 });
  assert.match(alongside.says, /not as its cause/);
  assert.match(alongside.says, /9 of 14/);
  assert.match(alongsideFrom({ daysMoved: 0, mealsChecked: 0, windowDays: 14 }).says, /Nothing recorded/);
});
