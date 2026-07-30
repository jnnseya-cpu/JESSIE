import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEVER_CLAIM, UK_ALLERGENS } from '@jessmove/foodlens';
import { analyse } from '../src/foodlens/foodlens.logic.ts';

const BASE = {
  items: [
    { name: 'breaded chicken', confidencePct: 94 },
    { name: 'rice', confidencePct: 97 },
  ],
  likelyKcal: 690,
  portionCertainty: 0.5,
  preparationCertainty: 0.3,
} as const;

test('an AI visual estimate is a range, never a single figure', () => {
  const result = analyse({ ...BASE, age: 34, source: 'ai_visual_estimate' });
  const energy = result.energy as { min: number; likely: number; max: number; confidence: string };
  assert.ok(energy.min < energy.likely && energy.likely < energy.max, 'the range must not collapse');
  assert.equal(energy.confidence, 'low');
});

test('a user-confirmed quantity is allowed to be exact', () => {
  const result = analyse({ ...BASE, age: 34, source: 'user_confirmed_quantity' });
  const energy = result.energy as { min: number; likely: number; max: number };
  assert.equal(energy.min, energy.max);
});

test('under 18, the energy figure is withheld — in any mode, under any setting', () => {
  const result = analyse({ ...BASE, age: 15, source: 'user_confirmed_quantity' });
  const energy = result.energy as { withheld: boolean };
  assert.equal(energy.withheld, true);
  assert.equal(result.macros, null, 'macro figures are calorie framing too');
  assert.equal(result.underEighteen, true);
});

test('allergen absence is never inferred without a full verified declaration', () => {
  const fromPhoto = analyse({ ...BASE, age: 34, source: 'ai_visual_estimate' });
  const statuses = fromPhoto.allergens as { status: string }[];
  assert.ok(statuses.every((a) => a.status === 'unknown'), 'a photo can only produce unknown');
  assert.equal(statuses.length, UK_ALLERGENS.length);

  const declared = analyse({
    ...BASE,
    age: 34,
    source: 'ai_visual_estimate',
    allergenEvidence: {
      source: 'restaurant_supplied_recipe',
      declaresPresent: ['eggs'],
      declaresFullList: true,
    },
  });
  const byName = new Map(
    (declared.allergens as { allergen: string; status: string }[]).map((a) => [a.allergen, a.status]),
  );
  assert.equal(byName.get('eggs'), 'declared_present');
  assert.equal(byName.get('peanuts'), 'declared_absent');
});

test('every result carries the full never-claim list, verbatim', () => {
  const result = analyse({ ...BASE, age: 34, source: 'ai_visual_estimate' });
  assert.deepEqual(result.neverClaimed, NEVER_CLAIM);
});

test('meal intelligence rates the analysis, and better evidence scores higher', () => {
  const photo = analyse({ ...BASE, age: 34, source: 'ai_visual_estimate' });
  const barcode = analyse({ ...BASE, age: 34, source: 'barcode_verified_product' });
  const p = (photo.intelligence as { score: number }).score;
  const b = (barcode.intelligence as { score: number }).score;
  assert.ok(b > p, 'a barcode must outrank a photograph');
});
