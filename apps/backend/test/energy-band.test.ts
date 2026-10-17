import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ENERGY_FLOOR_KCAL,
  MIN_RECORDED_DAYS,
  energyBand,
  type EnergyBandInput,
} from '@jessmove/body-command';

/**
 * The energy band.
 *
 * This is the highest-risk surface in the product: a number that tells
 * somebody how much to eat. Every test here is about a way it could hurt
 * a person rather than a way it could be wrong.
 */

const adult = (over: Partial<EnergyBandInput> = {}): EnergyBandInput => ({
  age: 44,
  optedIntoBodyMetrics: true,
  pathway: 'REDUCE',
  reductionPermitted: true,
  conditionsNeedingClinician: [],
  weightKg: 96,
  bmi: 31,
  observedKcalPerDay: 2600,
  recordedDays: 21,
  logConfirmedComplete: true,
  ...over,
});

test('a band is anchored on recorded food, never on an equation', () => {
  const band = energyBand(adult());
  assert.equal(band.eligible, true);
  if (!band.eligible) return;

  assert.equal(band.observedKcalPerDay, 2600, 'the anchor is what was recorded');
  assert.ok(band.floorKcal < band.ceilingKcal, 'the floor must sit under the ceiling');
  assert.ok(band.ceilingKcal < 2600, 'a reducing band must sit under observed intake');

  // Both ends stay inside a sustainable rate.
  assert.ok(band.impliedRateKgWeek.atFloor <= 0.5 + 1e-9);
  assert.ok(band.impliedRateKgWeek.atCeiling <= band.impliedRateKgWeek.atFloor);

  // The sentence has to name the floor as a floor. Somebody reading this
  // quickly must not come away thinking the lower number is the goal.
  assert.match(band.says, /floor, not a target/);
  assert.match(band.says, /not from an equation/);
});

test('under 18 there is no band, whatever else is set', () => {
  for (const age of [10, 13, 15, 17]) {
    const out = energyBand(adult({ age, optedIntoBodyMetrics: true }));
    assert.equal(out.eligible, false, `age ${age} produced a band`);
    if (!out.eligible) assert.equal(out.reason, 'under_18');
  }
  // And the gate is first, so nothing downstream can unlock it.
  const minor = energyBand(adult({ age: 15, bmi: 31, observedKcalPerDay: 3000 }));
  assert.equal(minor.eligible, false);
});

test('the floor is never crossed, however much room the arithmetic finds', () => {
  /*
   * A light person on a large recorded intake is where a naive
   * implementation produces a number that starves somebody: the
   * percentage rate allows a big deficit, and nothing stops it.
   */
  const band = energyBand(adult({ weightKg: 52, bmi: 19.1, observedKcalPerDay: 1900 }));
  if (band.eligible) {
    assert.ok(
      band.floorKcal >= ENERGY_FLOOR_KCAL,
      `floor ${band.floorKcal} fell below ${ENERGY_FLOOR_KCAL}`,
    );
  }
  // Across a wide sweep of inputs, no band may ever name a figure under
  // the floor at either end.
  for (let kg = 45; kg <= 140; kg += 5) {
    for (let kcal = 1600; kcal <= 4000; kcal += 100) {
      const out = energyBand(adult({ weightKg: kg, observedKcalPerDay: kcal, bmi: 28 }));
      if (out.eligible) {
        assert.ok(out.floorKcal >= ENERGY_FLOOR_KCAL, `${kg}kg ${kcal}kcal -> ${out.floorKcal}`);
        assert.ok(out.ceilingKcal > out.floorKcal, `${kg}kg ${kcal}kcal inverted`);
      }
    }
  }
});

test('somebody already eating at the minimum is offered maintenance, not a smaller deficit', () => {
  /*
   * The case that matters most, and the one a "maximum only" design gets
   * wrong. Recorded intake at 1550 leaves no room above the floor. The
   * answer is that there is no deficit to offer — not a tiny one.
   */
  const out = energyBand(adult({ observedKcalPerDay: 1550, weightKg: 70, bmi: 26 }));
  assert.equal(out.eligible, false);
  if (!out.eligible) {
    assert.equal(out.reason, 'already_at_safe_minimum');
    assert.match(out.says, /Maintenance/);
    assert.doesNotMatch(out.says, /target/, 'a refusal must not read as a smaller target');
  }
});

test('a declared condition needing a clinician blocks the band until one agrees', () => {
  const blocked = energyBand(adult({ conditionsNeedingClinician: ['type_1_diabetes'] }));
  assert.equal(blocked.eligible, false);
  if (!blocked.eligible) assert.equal(blocked.reason, 'condition_needs_clinician');

  // And it is a real gate, not advice: only an explicit agreement opens it.
  assert.equal(
    energyBand(adult({ conditionsNeedingClinician: ['type_1_diabetes'], clinicianAgreed: false }))
      .eligible,
    false,
  );
  assert.equal(
    energyBand(adult({ conditionsNeedingClinician: ['type_1_diabetes'], clinicianAgreed: true }))
      .eligible,
    true,
  );
});

test('the guardian and the pathway both close it, and consent is required to open it', () => {
  assert.equal(energyBand(adult({ reductionPermitted: false })).eligible, false);
  assert.equal(energyBand(adult({ optedIntoBodyMetrics: false })).eligible, false);
  for (const pathway of ['MAINTAIN', 'GAIN', 'CHILD_GROWTH', 'PROFESSIONAL_SUPPORT'] as const) {
    assert.equal(energyBand(adult({ pathway })).eligible, false, pathway);
  }
  for (const pathway of ['REDUCE', 'WAIST', 'RECOMPOSITION'] as const) {
    assert.equal(energyBand(adult({ pathway })).eligible, true, pathway);
  }
});

test('a BMI under the healthy range refuses, matching the trend reader', () => {
  const out = energyBand(adult({ bmi: 17.4, weightKg: 52 }));
  assert.equal(out.eligible, false);
  if (!out.eligible) {
    assert.equal(out.reason, 'bmi_below_healthy_range');
    assert.match(out.says, /GP or a dietitian/);
  }
});

test('without a week of record there is no band, and it says why', () => {
  for (const days of [0, 1, 3, MIN_RECORDED_DAYS - 1]) {
    const out = energyBand(adult({ recordedDays: days }));
    assert.equal(out.eligible, false, `${days} days produced a band`);
    if (!out.eligible) assert.equal(out.reason, 'not_enough_record');
  }
  assert.equal(energyBand(adult({ observedKcalPerDay: null })).eligible, false);
  assert.equal(energyBand(adult({ recordedDays: MIN_RECORDED_DAYS })).eligible, true);
});

test('no refusal and no band ever says a word from the banned lexicon', async () => {
  const { bannedTermsIn } = await import('@jessmove/shared');
  const sentences: string[] = [];

  const cases: Partial<EnergyBandInput>[] = [
    {}, { age: 15 }, { optedIntoBodyMetrics: false }, { pathway: 'MAINTAIN' },
    { reductionPermitted: false }, { conditionsNeedingClinician: ['gout'] },
    { bmi: 17 }, { coveredDays: 2 }, { observedKcalPerDay: 1550, weightKg: 70, bmi: 26 },
  ];
  for (const over of cases) sentences.push(energyBand(adult(over)).says);

  for (const s of sentences) {
    assert.deepEqual(bannedTermsIn(s), [], `banned term in: "${s}"`);
  }
});

test('an unconfirmed food log is refused, not guessed at', () => {
  /*
   * A partial log reads as a smaller appetite than the real one, so the
   * band comes out too low — the single direction that hurts. Only the
   * member knows whether they scanned most of what they ate, so the
   * system asks rather than assumes.
   */
  const out = energyBand(adult({ logConfirmedComplete: false }));
  assert.equal(out.eligible, false);
  if (!out.eligible) {
    assert.equal(out.reason, 'record_may_be_incomplete');
    assert.match(out.says, /only you can say/);
  }
  assert.equal(energyBand(adult({ logConfirmedComplete: true })).eligible, true);
});

test('the anchor is per recorded day, not per covered day', () => {
  /*
   * The defect a live run against real Postgres caught, and the reason
   * this test exists at all.
   *
   * The ledger derives `daysCovered` as max(daysRecorded, totalKcal /
   * 2000). Divide total energy by that and the result is exactly 2000
   * for anybody eating above it — an identity, not a measurement. The
   * first version of this band used it and returned 1500-1725 for a
   * member recorded at 2600 a day, which is the band every heavier
   * eater in the product would have received.
   *
   * Two members with different intakes must get different bands.
   */
  const lighter = energyBand(adult({ observedKcalPerDay: 2100 }));
  const heavier = energyBand(adult({ observedKcalPerDay: 3200 }));
  assert.equal(lighter.eligible, true);
  assert.equal(heavier.eligible, true);
  if (!lighter.eligible || !heavier.eligible) return;

  assert.notEqual(
    lighter.ceilingKcal,
    heavier.ceilingKcal,
    'two different intakes produced the same ceiling — the anchor is pinned again',
  );
  assert.ok(heavier.ceilingKcal > lighter.ceilingKcal);
  assert.equal(heavier.observedKcalPerDay, 3200, 'the anchor is the recorded figure itself');
});
