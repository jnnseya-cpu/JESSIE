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
