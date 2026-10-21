import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weeklyRecord } from '../src/body/progress.logic.ts';

/**
 * Mondays, so the week boundaries are unambiguous in the fixtures.
 *
 * Computed rather than formatted by hand: the first version of this built
 * the string arithmetically and produced `2026-10-33` for the fifth week,
 * which failed as an invalid date and looked briefly like a fault in the
 * code under test.
 */
const mon = (n: number): string => {
  const d = new Date('2026-10-05T00:00:00Z'); // a Monday
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
};

test('the record is one row per week, and the last reading represents it', () => {
  const { weeks } = weeklyRecord({
    age: 44,
    readings: [
      { day: mon(0), kg: 95 },
      // Three readings in one week is not three weeks of data, and the
      // last one is the one that counts.
      { day: '2026-10-07', kg: 94.6 },
      { day: '2026-10-09', kg: 94.2 },
      { day: mon(1), kg: 94 },
    ],
  });

  assert.equal(weeks.length, 2, 'four readings across two weeks make two rows');
  assert.equal(weeks[0]!.kg, 94.2, 'the week is represented by its last reading');
  assert.equal(weeks[0]!.readings, 3, 'and still says how many were given');
});

test('current and previous are the two the member compares', () => {
  const r = weeklyRecord({
    age: 44,
    readings: [
      { day: mon(0), kg: 95 },
      { day: mon(1), kg: 94.4 },
      { day: mon(2), kg: 93.9 },
    ],
  });

  assert.equal(r.previous?.kg, 94.4);
  assert.equal(r.current?.kg, 93.9);
  assert.equal(r.current?.changeKg, -0.5);
  assert.match(r.says, /94\.4kg then 93\.9kg/, 'the sentence names both numbers');
});

/**
 * The one that would be wrong if the gap were ignored, and wrong in the
 * direction that raises a false alarm.
 */
test('a skipped fortnight is not one week of loss', () => {
  const r = weeklyRecord({
    age: 44,
    readings: [
      { day: mon(0), kg: 95 },
      // Nothing for two weeks, then 3kg lighter.
      { day: mon(3), kg: 92 },
    ],
  });

  assert.equal(r.current?.changeKg, -3, 'the change really is 3kg');
  assert.equal(r.current?.weeksSincePrevious, 3, 'across three weeks');
  assert.equal(r.current?.kgPerWeek, -1, 'which is 1kg a week, not 3');
  assert.match(r.says, /3 weeks apart/, 'and the sentence says so rather than leaving it implied');

  // 1kg/week on 92kg is ~1.1% — over the threshold, so one caution is
  // correct here. The point is that it is judged on 1kg, not on 3.
  const fast = r.advice.find((a) => a.says.includes('% of your body weight'));
  assert.ok(fast, 'the rate warning still fires on the true rate');
  assert.match(fast.says, /1\.1%/, 'at 1.1%, not the 3.3% a one-week reading would have given');
});

test('advice is judged on the latest week, not the whole span', () => {
  // Four slow weeks, then a sudden 2kg drop. A span average would bury it.
  const r = weeklyRecord({
    age: 44,
    readings: [
      { day: mon(0), kg: 95 },
      { day: mon(1), kg: 94.8 },
      { day: mon(2), kg: 94.6 },
      { day: mon(3), kg: 94.4 },
      { day: mon(4), kg: 92.4 },
    ],
  });

  assert.equal(r.current?.kgPerWeek, -2, 'the week itself lost 2kg');
  assert.ok(
    r.advice.some((a) => a.level === 'caution'),
    'and that is what the member is told about, not the gentle average',
  );
});

test('a BMI below the healthy range stops the whole thing', () => {
  const r = weeklyRecord({
    age: 44,
    bmi: 17.4,
    readings: [
      { day: mon(0), kg: 52 },
      { day: mon(1), kg: 51.6 },
    ],
  });

  const stop = r.advice.find((a) => a.level === 'stop');
  assert.ok(stop, 'the reduction plan must refuse, not merely caution');
  assert.match(stop.action, /GP|dietitian/i, 'and point somewhere real');
});

test('under 18 there is no weight record at all', () => {
  const r = weeklyRecord({
    age: 14,
    readings: [
      { day: mon(0), kg: 60 },
      { day: mon(1), kg: 59 },
    ],
  });

  assert.deepEqual(r.weeks, [], 'no rows');
  assert.equal(r.current, null);
  assert.deepEqual(r.advice, [], 'and nothing to advise about');
  assert.match(r.says, /not tracked under 18/i);
});

test('one week is a fact, not a comparison', () => {
  const r = weeklyRecord({ age: 44, readings: [{ day: mon(0), kg: 95 }] });
  assert.equal(r.previous, null);
  assert.equal(r.current?.changeKg, null, 'nothing to compare against yet');
  assert.match(r.says, /Next week gives you something to compare/);
});

test('a week that holds is not reported as a failure', () => {
  const r = weeklyRecord({
    age: 44,
    readings: [
      { day: mon(0), kg: 95 },
      { day: mon(1), kg: 95 },
    ],
  });
  assert.match(r.says, /level/, 'described as level');
  assert.match(r.says, /not a week lost/, 'and explicitly not as a loss of progress');
});
