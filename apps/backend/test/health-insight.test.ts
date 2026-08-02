import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEALTHY_BMI,
  bandFor,
  bmiFrom,
  bmiPathFor,
  insightFor,
  risksFor,
  type InsightInput,
} from '../src/health/risk.logic.ts';

const adult = (over: Partial<InsightInput> = {}): InsightInput => ({ age: 41, ...over });

const foodOf = (perDay: Record<string, number>, daysCovered = 5) => ({
  daysRecorded: 3,
  daysCovered,
  perDay,
  topSalt: 'Streaky Bacon',
  topSaturates: 'Mature Cheddar',
  topSugars: 'Cola',
});

test('nothing at all is shown to anyone under 18', () => {
  for (const age of [10, 13, 15, 17]) {
    const insight = insightFor({
      age,
      heightCm: 165,
      weightKg: 80,
      food: foodOf({ saltG: 12, saturatesG: 40, sugarsG: 200 }),
      activity: { daysMoved: 0, windowDays: 14 },
    });
    assert.equal(insight.available, false, `age ${age}`);
    assert.deepEqual(insight.risks, [], `age ${age} sees no conditions`);
    assert.equal(insight.bmi.bmi, null, `age ${age} sees no BMI`);
    assert.match(insight.why ?? '', /Under 18/);
  }
});

test('nothing is said about a diet until there is enough food to say it about', () => {
  const thin = risksFor(adult({ food: foodOf({ saltG: 20, saturatesG: 60 }, 1.4) }));
  assert.deepEqual(thin, [], 'one and a half days of food is not a pattern');

  const enough = risksFor(adult({ food: foodOf({ saltG: 20, saturatesG: 60 }, 4) }));
  assert.ok(enough.some((r) => r.factor === 'Salt'));
});

test('every warning names conditions, shows its figure, and ends with the lever', () => {
  const risks = risksFor(
    adult({
      heightCm: 178,
      weightKg: 96,
      food: foodOf({ saltG: 9, saturatesG: 35, sugarsG: 120 }),
      activity: { daysMoved: 1, windowDays: 14 },
    }),
  );
  assert.ok(risks.length >= 4);
  for (const risk of risks) {
    assert.ok(risk.associatedWith.length > 0, `${risk.factor} names what it is associated with`);
    assert.ok(risk.evidence.length > 10, `${risk.factor} shows its figure`);
    assert.ok(risk.action.length > 10, `${risk.factor} ends with an action`);
    assert.ok(['foodlens', 'bodycommand', 'activity'].includes(risk.from));
  }
});

test('a warning names the item carrying the most of it', () => {
  const risks = risksFor(adult({ food: foodOf({ saltG: 9 }) }));
  const salt = risks.find((r) => r.factor === 'Salt');
  assert.match(salt?.action ?? '', /Streaky Bacon/);
});

test('nothing is phrased as a diagnosis', () => {
  const blob = JSON.stringify(
    insightFor(
      adult({
        heightCm: 178,
        weightKg: 110,
        food: foodOf({ saltG: 15, saturatesG: 60, sugarsG: 250 }),
        activity: { daysMoved: 0, windowDays: 14 },
        trend: { kgPerWeek: -1.6, direction: 'down' },
      }),
    ),
  ).toLowerCase();

  for (const claim of [
    /you have (a|an|high|raised|type)/,
    /you (will|are going to) (get|develop)/,
    /you are at risk of/,
  ]) {
    assert.ok(!claim.test(blob), `must not say: ${claim}`);
  }
  assert.match(blob, /associated with|association/);
});

test('BMI bands are the published ones', () => {
  assert.equal(bmiFrom(178, 96), 30.3);
  assert.equal(bandFor(17), 'under');
  assert.equal(bandFor(HEALTHY_BMI.min), 'healthy');
  assert.equal(bandFor(HEALTHY_BMI.max), 'healthy');
  assert.equal(bandFor(27), 'over');
  assert.equal(bandFor(30), 'well_over');
});

test('the route to a green BMI is a weight, a rate and a number of weeks', () => {
  const path = bmiPathFor(adult({ heightCm: 178, weightKg: 96 }));
  assert.equal(path.band, 'well_over');
  assert.deepEqual(path.healthyRangeKg, { min: 58.6, max: 78.9 });
  assert.equal(path.gapKg, 17.1);
  assert.equal(path.safeRateKgPerWeek, 0.5, 'never faster than half a kilo a week');
  assert.equal(path.weeksAtSafeRate, 35);
  assert.ok(path.steps.length >= 3);
});

test('a healthy BMI is given a range to stay inside, not a target to chase', () => {
  const path = bmiPathFor(adult({ heightCm: 178, weightKg: 72 }));
  assert.equal(path.band, 'healthy');
  assert.equal(path.gapKg, null);
  assert.match(path.says, /inside the healthy range/);
  assert.deepEqual(
    risksFor(adult({ heightCm: 178, weightKg: 72 })).filter((r) => r.factor === 'Weight'),
    [],
  );
});

test('below the healthy range, the answer is a clinician and not a diet', () => {
  const path = bmiPathFor(adult({ heightCm: 178, weightKg: 55 }));
  assert.equal(path.band, 'under');
  assert.match(path.says, /will not run a reduction plan/);
  assert.match(path.steps.join(' '), /GP|dietitian/);
});

test('losing too fast is itself a warning', () => {
  const risks = risksFor(adult({ trend: { kgPerWeek: -1.6, direction: 'down' } }));
  const rate = risks.find((r) => r.factor === 'Rate of loss');
  assert.ok(rate, 'a fast loss is flagged');
  assert.match(rate?.action ?? '', /Half a kilo a week/);
});

test('a small rate of loss is not warned about', () => {
  assert.deepEqual(
    risksFor(adult({ trend: { kgPerWeek: -0.4, direction: 'down' } })),
    [],
  );
});

test('high risks are listed before things merely worth watching', () => {
  const risks = risksFor(
    adult({
      heightCm: 178,
      weightKg: 110,
      food: foodOf({ saltG: 12 }),
      activity: { daysMoved: 4, windowDays: 14 },
    }),
  );
  const levels = risks.map((r) => r.level);
  assert.deepEqual([...levels].sort((a, b) => ({ high: 0, raised: 1, watch: 2 })[a] - ({ high: 0, raised: 1, watch: 2 })[b]), levels);
});

test('with no height and weight, the BMI path asks for them rather than inventing one', () => {
  const path = bmiPathFor(adult({}));
  assert.equal(path.bmi, null);
  assert.match(path.says, /Give a height and a weight/);
});

test('the picture always states its own limits and when to see somebody', () => {
  const insight = insightFor(adult({ heightCm: 178, weightKg: 96 }));
  assert.ok(insight.limits.some((l) => /none of this is a diagnosis/i.test(l)));
  assert.ok(insight.limits.some((l) => /muscle from fat/i.test(l)));
  assert.ok(insight.limits.some((l) => /medication|pregnancy/i.test(l)));
  assert.ok(insight.seeSomeone.length >= 2);
});
