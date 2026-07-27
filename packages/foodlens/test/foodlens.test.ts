import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BANNED_FRAMINGS,
  DATA_PRIORITY,
  MOVEMENT_PAIRING_COPY,
  NEVER_CLAIM,
  PERMITTED_FRAMINGS,
  SWAP_LEVELS,
  WHEEL_DIMENSIONS,
  confidenceFor,
  estimate,
  evidenced,
  isExact,
  preferSource,
  trafficLightsPer100g,
} from '../dist/index.js';

test('a verified source may be exact; an AI estimate may not', () => {
  const label = estimate(240, 'verified_manufacturer_label');
  assert.equal(isExact(label), true, 'a read label is exact');

  const guess = estimate(690, 'ai_visual_estimate');
  assert.equal(isExact(guess), false, 'a photograph is never exact');
  assert.ok(guess.min < guess.likely && guess.likely < guess.max);
});

test('lower-confidence sources produce wider cones', () => {
  const db = estimate(500, 'trusted_composition_database');
  const ai = estimate(500, 'ai_visual_estimate');
  const dbSpread = db.max - db.min;
  const aiSpread = ai.max - ai.min;
  assert.ok(aiSpread > dbSpread, 'a visual estimate is less certain than a database lookup');
});

test('data priority resolves to the better source', () => {
  assert.equal(
    preferSource('ai_visual_estimate', 'barcode_verified_product'),
    'barcode_verified_product',
  );
  assert.equal(
    preferSource('user_confirmed_quantity', 'verified_manufacturer_label'),
    'user_confirmed_quantity',
    'a user correction outranks everything',
  );
  assert.equal(DATA_PRIORITY[0], 'user_confirmed_quantity');
  assert.equal(DATA_PRIORITY[DATA_PRIORITY.length - 1], 'general_recipe_probability');
});

test('confidence levels map to sources as specified', () => {
  assert.equal(confidenceFor('barcode_verified_product'), 'verified');
  assert.equal(confidenceFor('restaurant_supplied_recipe'), 'high');
  assert.equal(confidenceFor('trusted_composition_database'), 'medium');
  assert.equal(confidenceFor('ai_visual_estimate'), 'low');
  assert.equal(confidenceFor('general_recipe_probability'), 'unknown');
});

test('an evidenced value carries its own provenance and uncertainty', () => {
  const v = evidenced(690, 'ai_visual_estimate', 'quantity of oil and sauce');
  assert.equal(v.confidence, 'low');
  assert.equal(v.mainUncertainty, 'quantity of oil and sauce');
  assert.equal(isExact(v.range), false);
});

test('UK traffic lights band correctly at the published thresholds', () => {
  const low = trafficLightsPer100g({ fatG: 2.0, saturatesG: 1.0, sugarsG: 4.0, saltG: 0.2 });
  assert.deepEqual(low, { fat: 'green', saturates: 'green', sugars: 'green', salt: 'green' });

  const high = trafficLightsPer100g({ fatG: 20, saturatesG: 6, sugarsG: 25, saltG: 2 });
  assert.deepEqual(high, { fat: 'red', saturates: 'red', sugars: 'red', salt: 'red' });

  const mid = trafficLightsPer100g({ fatG: 10, saturatesG: 3, sugarsG: 12, saltG: 0.9 });
  assert.deepEqual(mid, { fat: 'amber', saturates: 'amber', sugars: 'amber', salt: 'amber' });

  // Boundaries: at the green threshold it is green; just above red it is red.
  assert.equal(trafficLightsPer100g({ fatG: 3.0, saturatesG: 0, sugarsG: 0, saltG: 0 }).fat, 'green');
  assert.equal(trafficLightsPer100g({ fatG: 17.6, saturatesG: 0, sugarsG: 0, saltG: 0 }).fat, 'red');
});

test('the wheel has twelve dimensions and no single "healthy" score', () => {
  assert.equal(WHEEL_DIMENSIONS.length, 12);
  assert.ok(!WHEEL_DIMENSIONS.includes('healthScore' as never));
  assert.ok(WHEEL_DIMENSIONS.includes('mealConfidence'), 'confidence is itself a dimension');
});

test('framings are permitted by list; judgemental words are not among them', () => {
  for (const banned of BANNED_FRAMINGS) {
    assert.ok(
      !(PERMITTED_FRAMINGS as readonly string[]).includes(banned),
      `"${banned}" must not be a permitted framing`,
    );
  }
  assert.ok(PERMITTED_FRAMINGS.includes('better_alternatives_available'));
});

test('the swap ladder starts with the smallest change', () => {
  assert.equal(SWAP_LEVELS[0].level, 1);
  assert.match(SWAP_LEVELS[0].name, /reduce one element/);
  assert.equal(SWAP_LEVELS[SWAP_LEVELS.length - 1].level, 5);
  assert.match(SWAP_LEVELS[4].name, /different meal/);
});

test('movement is never framed as cancelling out food', () => {
  assert.match(MOVEMENT_PAIRING_COPY.correct, /may support your movement target/);
  assert.match(MOVEMENT_PAIRING_COPY.forbidden, /burn off/);
  assert.ok(!MOVEMENT_PAIRING_COPY.correct.includes('burn'));
});

test('the forbidden claims are enumerated so they cannot drift', () => {
  for (const claim of [
    'allergen_absence_from_appearance',
    'microbial_safety_from_image',
    'disease_diagnosis',
    'exact_calorie_count_from_photo',
    'that_movement_cancels_out_food',
  ] as const) {
    assert.ok(NEVER_CLAIM.includes(claim), `${claim} must be forbidden`);
  }
});

/* ---------------- FoodLens 360° analysis engine ---------------- */

test('Meal Intelligence scores the analysis, never the food', async () => {
  const {
    MEAL_INTELLIGENCE_CAPTION, intelligenceBand, mealIntelligence,
  } = await import('../dist/index.js');

  // A takeaway with a scanned barcode and a confirmed portion is *well known*,
  // even though nobody would call it a virtuous meal.
  const takeaway = mealIntelligence({
    bestSource: 'barcode_verified_product',
    itemCoverage: 1,
    portionCertainty: 1,
    preparationCertainty: 1,
  });

  // A home-cooked salad photographed badly is *poorly known*, however good it is.
  const salad = mealIntelligence({
    bestSource: 'general_recipe_probability',
    itemCoverage: 0.5,
    portionCertainty: 0.3,
    preparationCertainty: 0.4,
  });

  assert.ok(takeaway > salad, 'the score follows evidence, not virtue');
  assert.equal(takeaway, 100);
  assert.equal(intelligenceBand(takeaway).band, 'strong');
  assert.equal(intelligenceBand(salad).band, 'thin');
  assert.match(MEAL_INTELLIGENCE_CAPTION, /not a rating of the food/);
});

test('Meal Intelligence rejects inputs outside 0–1', async () => {
  const { mealIntelligence } = await import('../dist/index.js');
  assert.throws(
    () => mealIntelligence({
      bestSource: 'ai_visual_estimate',
      itemCoverage: 1.4,
      portionCertainty: 0.5,
      preparationCertainty: 0.5,
    }),
    RangeError,
  );
});

test('a reference object and a second angle tighten the estimate', async () => {
  const { CAPTURE_CHECKS, spreadForCapture } = await import('../dist/index.js');
  const bare = CAPTURE_CHECKS.map((check) => ({ check, score: 0.7, hint: '' }))
    .map((s) => (s.check === 'portion_reference_visible' || s.check === 'second_angle_guidance'
      ? { ...s, score: 0 } : s));
  const helped = CAPTURE_CHECKS.map((check) => ({ check, score: 0.9, hint: '' }));

  assert.ok(spreadForCapture(helped) < spreadForCapture(bare),
    'more evidence must narrow the cone, never widen it');

  const dark = CAPTURE_CHECKS.map((check) => ({
    check, score: check === 'lighting_quality' ? 0.2 : 0.9, hint: '',
  }));
  assert.ok(spreadForCapture(dark) > spreadForCapture(helped), 'bad light widens it');
});

test('allergen absence is never inferred from a photograph', async () => {
  const { ALLERGEN_UNKNOWN_COPY, allergenStatus } = await import('../dist/index.js');

  // A photo, however confident the model feels, cannot clear an allergen.
  assert.equal(
    allergenStatus('peanuts', { source: 'ai_visual_estimate', declaresFullList: true }),
    'unknown',
    'a visual estimate may never declare an allergen absent',
  );

  // Only a complete declaration from a verifiable source may say absent.
  assert.equal(
    allergenStatus('peanuts', { source: 'verified_manufacturer_label', declaresFullList: true }),
    'declared_absent',
  );

  // Present always wins, from any source.
  assert.equal(
    allergenStatus('milk', { source: 'ai_visual_estimate', declaresPresent: ['milk'] }),
    'declared_present',
  );

  assert.match(ALLERGEN_UNKNOWN_COPY, /cannot tell from a photograph/);
});

test('macros are checked against the stated energy rather than trusted', async () => {
  const { energyAgreement, macroSplit } = await import('../dist/index.js');

  const g = { proteinG: 40, carbohydrateG: 70, fatG: 26 };
  const split = macroSplit(g);
  const total = split.proteinPct + split.carbohydratePct + split.fatPct;
  assert.ok(Math.abs(total - 100) < 0.5, 'the split accounts for all the energy');

  // 40*4 + 70*4 + 26*9 = 674
  assert.equal(energyAgreement(674, g).impliedKcal, 674);
  assert.equal(energyAgreement(674, g).agrees, true);
  assert.equal(energyAgreement(420, g).agrees, false, 'a large gap must be flagged');
});

test('the plate normalises to a hundred per cent', async () => {
  const { normalisePlate } = await import('../dist/index.js');
  const p = normalisePlate({ vegetables_and_salad: 3, protein: 2, starchy_carbohydrate: 5 });
  const total = Object.values(p).reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(total - 100) < 0.5);
  assert.throws(() => normalisePlate({}), RangeError);
});

test('plant points count distinct plants and name what is new', async () => {
  const { plantPoints } = await import('../dist/index.js');
  const result = plantPoints(
    [
      { name: 'Spinach', group: 'vegetables' },
      { name: 'spinach', group: 'vegetables' }, // same plant, different case
      { name: 'Lentils', group: 'legumes' },
      { name: 'Walnuts', group: 'nuts_and_seeds' },
    ],
    ['spinach'],
  );
  assert.equal(result.distinctPlants, 3, 'the same plant twice is one plant');
  assert.deepEqual(result.newThisWeek, ['lentils', 'walnuts']);
  assert.equal(result.byGroup.vegetables, 1);
});

test('a simulated swap is less certain than the meal actually photographed', async () => {
  const { simulateSwap } = await import('../dist/index.js');
  const before = { energyKcal: 690, saturatesG: 9.4, saltG: 3.1, fibreG: 4, proteinG: 32 };
  const { after, extraUncertainty } = simulateSwap(before, {
    level: 2,
    action: 'Grill instead of deep-frying',
    deltas: { energy: -22, saturates: -40, fibre: 5 },
    keeps: 'the same dish',
  });
  assert.ok(after.energyKcal < before.energyKcal);
  assert.ok(after.saturatesG < before.saturatesG);
  assert.equal(after.saltG, before.saltG, 'an unstated nutrient does not move');
  assert.ok(extraUncertainty > 0, 'a meal not yet eaten cannot be known as well');
});

test('pattern comparison is against your own history and nobody else’s', async () => {
  const { personalDelta } = await import('../dist/index.js');
  const history = [
    { day: 'Mon', value: 600 }, { day: 'Tue', value: 640 },
    { day: 'Wed', value: 580 }, { day: 'Thu', value: 700 },
    { day: 'Fri', value: 620 },
  ];
  assert.equal(personalDelta(620, history).direction, 'typical');
  assert.equal(personalDelta(900, history).direction, 'above');
  assert.equal(personalDelta(300, history).direction, 'below');
  assert.throws(() => personalDelta(620, []), RangeError);
});

test('a composite health score and a person-to-person comparison are forbidden', async () => {
  const { NEVER_CLAIM } = await import('../dist/index.js');
  assert.ok(NEVER_CLAIM.includes('a_single_composite_health_score'));
  assert.ok(NEVER_CLAIM.includes('a_comparison_against_another_named_person'));
});

test('the processing sequence is the published order', async () => {
  const { PROCESSING_STAGES } = await import('../dist/index.js');
  assert.deepEqual(
    PROCESSING_STAGES.map((s) => s.key),
    ['finding', 'portions', 'preparation', 'nutrition', 'pattern', 'alternatives'],
  );
});
