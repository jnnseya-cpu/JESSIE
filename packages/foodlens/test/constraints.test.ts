import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CULTURE_BEARING_LEVELS,
  CULTURE_NEUTRAL_LEVELS,
  permittedSwapLevels,
  selectSwaps,
  swapPermitted,
  type MemberFoodConstraints,
} from '../src/constraints.ts';
import { SWAP_CONSTRAINTS, type Swap } from '../src/twin.ts';

const swap = (level: Swap['level'], action: string): Swap => ({
  level,
  action,
  expectedEffect: 'Directional only.',
  respects: [],
});

const none: MemberFoodConstraints = { declared: [], excludes: [] };

test('with nothing declared, a meal is modified and never replaced', () => {
  /*
   * The whole design. "Use half the sauce" is the same advice in every
   * cuisine on earth; "choose a different meal" replaces somebody's
   * dish, and doing that without knowing their food is where this goes
   * wrong. So the less the engine knows, the less it moves.
   */
  assert.deepEqual(permittedSwapLevels(none), CULTURE_NEUTRAL_LEVELS);
  for (const level of CULTURE_BEARING_LEVELS) {
    assert.equal(swapPermitted(swap(level, 'Choose a different meal.'), none), false);
  }
  for (const level of CULTURE_NEUTRAL_LEVELS) {
    assert.equal(swapPermitted(swap(level, 'Use half the sauce.'), none), true);
  }
});

test('a declared cuisine opens the levels that rebuild the plate', () => {
  const withCuisine: MemberFoodConstraints = { declared: ['culture'], excludes: [], cuisine: 'Nigerian' };
  assert.equal(permittedSwapLevels(withCuisine).length, 5);
  assert.equal(swapPermitted(swap(5, 'Choose a different meal.'), withCuisine), true);
});

test('an exclusion is absolute at every level, not merely a preference', () => {
  /*
   * Allergens and religious restriction are the same obligation to the
   * engine: never suggest it. A level 1 swap that mentions it is
   * refused exactly as hard as a level 5 one.
   */
  const halal: MemberFoodConstraints = {
    declared: ['religion', 'allergies'],
    excludes: ['pork', 'peanut'],
    cuisine: 'Turkish',
  };
  for (const level of [1, 2, 3, 4, 5] as const) {
    assert.equal(swapPermitted(swap(level, 'Swap in some pork loin.'), halal), false, `level ${level}`);
    assert.equal(swapPermitted(swap(level, 'Add a peanut sauce.'), halal), false, `level ${level}`);
  }
  assert.equal(swapPermitted(swap(2, 'Grill it instead of deep-frying.'), halal), true);
});

test('with nothing compliant to say, it says nothing rather than something near enough', () => {
  const vegan: MemberFoodConstraints = { declared: ['religion'], excludes: ['chicken', 'beef'] };
  const picked = selectSwaps(
    [swap(1, 'Use less beef.'), swap(2, 'Grill the chicken.'), swap(5, 'Have a different meal.')],
    vegan,
  );
  assert.equal(picked.offered.length, 0);
  assert.equal(picked.withheld, 3);
  assert.match(picked.says, /nothing is suggested/);
  assert.match(picked.says, /worse than none/);
});

test('the undeclared message invites the declaration rather than assuming it', () => {
  const picked = selectSwaps([swap(1, 'Use half the sauce.'), swap(5, 'Different meal.')], none);
  assert.equal(picked.offered.length, 1);
  assert.match(picked.says, /Tell us what you cook/);
  // And it never guesses. Inferring a cuisine from a shop is inferring
  // ethnicity without asking.
  assert.doesNotMatch(picked.says, /we think|looks like|based on your/i);
});

test('every constraint the page advertises is one this module can act on', () => {
  /*
   * The page renders all ten. Any that the engine cannot act on is a
   * claim without an implementation, which is the defect this closes.
   */
  const actionable = new Set<string>([
    'culture', 'religion', 'allergies', 'preferred_foods',
    'budget', 'local_availability', 'cooking_skill', 'family_size',
    'preparation_time', 'supermarket_accessibility',
  ]);
  for (const c of SWAP_CONSTRAINTS) {
    assert.ok(actionable.has(c), `${c} is advertised and unmodelled`);
  }
});
