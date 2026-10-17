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

/* ── the day's colour ─────────────────────────────────────────────── */

const bandOf = (over: Partial<EnergyBandInput> = {}) => {
  const b = energyBand(adult(over));
  assert.equal(b.eligible, true);
  return b as Extract<typeof b, { eligible: true }>;
};

test('the colour belongs to the day, and there is no red', async () => {
  const { dayStanding } = await import('@jessmove/body-command');
  const band = bandOf();

  const states = [
    dayStanding({ band, kcalSoFar: band.floorKcal - 400, dayComplete: true }),
    dayStanding({ band, kcalSoFar: (band.floorKcal + band.ceilingKcal) / 2, dayComplete: true }),
    dayStanding({ band, kcalSoFar: band.ceilingKcal + 900, dayComplete: true }),
    dayStanding({ band, kcalSoFar: 300, dayComplete: false }),
  ];

  // No colour in this module is ever red. Red belongs to the safety
  // layer, and a red plate is a "bad food" signal by another name.
  for (const s of states) assert.notEqual(s.colour as string, 'red');

  assert.deepEqual(
    states.map((s) => s.standing),
    ['under_floor', 'in_band', 'above_band', 'early'],
  );
});

test('the loud signal points downwards, which is the opposite of the category', async () => {
  const { dayStanding } = await import('@jessmove/body-command');
  const band = bandOf();

  const under = dayStanding({ band, kcalSoFar: band.floorKcal - 500, dayComplete: true });
  const over = dayStanding({ band, kcalSoFar: band.ceilingKcal + 1200, dayComplete: true });

  assert.equal(under.emphasis, 'speak_up', 'eating under the floor must be the loud one');
  assert.equal(over.emphasis, 'note', 'eating over must never shout');

  // And being over is never framed as a debt to repay.
  assert.match(over.says, /nothing here needs working off/);
  assert.doesNotMatch(over.says, /burn|work off your|make up for/i);
});

test('an unfinished day is grey, so the floor never becomes a target to hit early', async () => {
  const { dayStanding } = await import('@jessmove/body-command');
  const band = bandOf();

  const midday = dayStanding({ band, kcalSoFar: 400, dayComplete: false });
  assert.equal(midday.standing, 'early');
  assert.equal(midday.colour, 'grey');
  assert.equal(midday.emphasis, 'none');
  assert.match(midday.says, /not finished/);

  // The same figure at the end of the day is a different answer.
  assert.equal(dayStanding({ band, kcalSoFar: 400, dayComplete: true }).standing, 'under_floor');
});

test('no sentence the day verdict produces uses a banned word', async () => {
  const { dayStanding } = await import('@jessmove/body-command');
  const { bannedTermsIn } = await import('@jessmove/shared');
  const band = bandOf();

  for (let kcal = 0; kcal <= 5000; kcal += 250) {
    for (const dayComplete of [true, false]) {
      const v = dayStanding({ band, kcalSoFar: kcal, dayComplete });
      assert.deepEqual(bannedTermsIn(v.says), [], `banned term at ${kcal}: "${v.says}"`);
    }
  }
});

/* ── the programme ────────────────────────────────────────────────── */

test('the timeframe is real and the targets are never a weight', async () => {
  const { programmeFor, WEEKLY_TARGETS } = await import('@jessmove/body-command');
  const p = programmeFor(bandOf(), 12);

  assert.equal(p.weeks, 12);
  assert.equal(p.total.daysScanned, WEEKLY_TARGETS.daysScanned * 12);

  // Every target is a count of days. Nothing in the structure is a kg.
  const targetKeys = Object.keys(p.weekly).concat(Object.keys(p.total));
  for (const k of targetKeys) assert.match(k, /^days/, `${k} is not a behaviour`);

  // The weight outcome exists but as a consequence, with no date on it.
  assert.ok(p.impliedChangeKg.fast > p.impliedChangeKg.slow);
  assert.match(p.says, /consequence of the days, not a target/);
  assert.match(p.says, /no date by which it has to be true/);
});

test('no weekly target is seven of seven', async () => {
  const { WEEKLY_TARGETS } = await import('@jessmove/body-command');
  /*
   * A seven-of-seven target has one failure mode and it arrives on the
   * first bad day. The next three months contain a weekend, an illness
   * and a holiday.
   */
  for (const [k, v] of Object.entries(WEEKLY_TARGETS)) {
    assert.ok(v < 7, `${k} demands a perfect week`);
    assert.ok(v >= 4, `${k} is too slack to mean anything`);
  }
});

test('a missed day never takes away progress already earned', async () => {
  const { programmeFor, programmeProgress } = await import('@jessmove/body-command');
  const p = programmeFor(bandOf(), 12);

  const atWeek4 = programmeProgress(p, {
    daysScanned: 20, daysMoved: 20, daysInBand: 16, weeksElapsed: 4,
  });
  // A fortnight with nothing recorded: the counts stand still, they do
  // not fall. `punishment_for_missed_days` is on the prohibited list.
  const atWeek6 = programmeProgress(p, {
    daysScanned: 20, daysMoved: 20, daysInBand: 16, weeksElapsed: 6,
  });

  assert.equal(atWeek6.scanned, atWeek4.scanned, 'progress went backwards');
  assert.equal(atWeek6.moved, atWeek4.moved);
  assert.equal(atWeek6.inBand, atWeek4.inBand);

  // And the message about slipping names the strand without blame.
  assert.equal(atWeek6.onTrack, false);
  assert.match(atWeek6.says, /Days already counted stay counted/);
});

test('overall is the weakest strand, not an average that hides one', async () => {
  const { programmeFor, programmeProgress } = await import('@jessmove/body-command');
  const p = programmeFor(bandOf(), 8);

  // Perfect on two strands, nothing on the third.
  const lopsided = programmeProgress(p, {
    daysScanned: p.total.daysScanned, daysMoved: p.total.daysMoved, daysInBand: 0, weeksElapsed: 8,
  });
  assert.equal(lopsided.overall, 0, 'an average would have reported this as two-thirds done');
  assert.match(lopsided.says, /days inside the band/);
});

test('nothing the programme says uses a banned word', async () => {
  const { programmeFor, programmeProgress, PROGRAMME_WEEKS } = await import('@jessmove/body-command');
  const { bannedTermsIn } = await import('@jessmove/shared');

  for (const weeks of PROGRAMME_WEEKS) {
    const p = programmeFor(bandOf(), weeks);
    assert.deepEqual(bannedTermsIn(p.says), [], p.says);
    for (let w = 0; w <= weeks; w++) {
      for (const done of [0, 0.5, 1]) {
        const prog = programmeProgress(p, {
          daysScanned: Math.round(p.total.daysScanned * done),
          daysMoved: Math.round(p.total.daysMoved * done),
          daysInBand: Math.round(p.total.daysInBand * done),
          weeksElapsed: w,
        });
        assert.deepEqual(bannedTermsIn(prog.says), [], prog.says);
      }
    }
  }
});
