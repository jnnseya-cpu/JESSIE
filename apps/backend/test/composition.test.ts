import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPOSITION, compositionFor, plateComposition } from '@jessmove/foodlens';

/**
 * Why the table exists.
 *
 * The front-of-pack panel used to depend on a model returning four numbers
 * on every single request. When that round trip missed — a fenced reply, a
 * timeout, a model in a hurry — the panel had nothing, and a panel that is
 * there on Tuesday and gone on Wednesday cannot be trusted on either day.
 *
 * The table answers the common case instantly, offline, and identically
 * every time. That is what makes it stable.
 */

test('the dishes people actually photograph are in the table', () => {
  for (const dish of [
    'jollof rice',
    'fried plantain',
    'dodo',
    'pounded yam',
    'egusi soup',
    'suya',
    'moi moi',
    'fish and chips',
    'full english',
    'chicken breast',
    'white bread',
    'cheddar',
    'pizza',
    'porridge',
  ]) {
    assert.ok(compositionFor(dish), `${dish} is missing from the table`);
  }
});

test('the longest name wins, so a dish is not read as its ingredient', () => {
  assert.equal(compositionFor('fried rice')?.key, 'fried rice');
  assert.equal(compositionFor('brown rice')?.key, 'brown rice');
  assert.equal(compositionFor('boiled rice')?.key, 'rice');
  assert.equal(compositionFor('sweet potato mash')?.key, 'sweet potato');
  assert.equal(compositionFor('grilled chicken breast')?.key, 'grilled chicken');
});

test('a word inside another word is not a match', () => {
  // "ham" must not match "hamburger"; "pepper" must not match "pepper soup"
  // ahead of the longer key.
  assert.equal(compositionFor('hamburger')?.key, 'burger');
  assert.equal(compositionFor('pepper soup')?.key, 'pepper soup');
});

test('a food nobody has heard of matches nothing, rather than the nearest thing', () => {
  assert.equal(compositionFor('zorblax casserole'), null);
  assert.equal(compositionFor(''), null);
});

test('every entry is a plausible composition, not a placeholder', () => {
  for (const [name, c] of Object.entries(COMPOSITION)) {
    assert.ok(c.fatG >= 0 && c.fatG <= 100, `${name} fat`);
    assert.ok(c.saturatesG >= 0 && c.saturatesG <= c.fatG + 0.01, `${name}: saturates exceed fat`);
    assert.ok(c.sugarsG >= 0 && c.sugarsG <= 100, `${name} sugars`);
    assert.ok(c.saltG >= 0 && c.saltG <= 10, `${name} salt`);
    assert.ok(c.kcal > 0 && c.kcal <= 900, `${name} energy`);
    // Nothing in the table may be four zeros — that is the exact shape the
    // panel is not allowed to print.
    assert.ok(
      c.fatG + c.saturatesG + c.sugarsG + c.saltG > 0,
      `${name} is an empty entry, which is the bug this table exists to prevent`,
    );
  }
});

test('a plate of several foods is weighted by how sure the model was', () => {
  const plate = plateComposition([
    { name: 'jollof rice', confidencePct: 90 },
    { name: 'fried plantain', confidencePct: 80 },
  ]);
  assert.ok(plate);
  assert.deepEqual(plate?.matched.sort(), ['fried plantain', 'jollof rice']);
  // Between the two, and closer to the one it was surer of.
  assert.ok(plate!.composition.sugarsG > 1.9 && plate!.composition.sugarsG < 15.6);
  assert.ok(plate!.composition.fatG > 5.8 && plate!.composition.fatG < 8.8);
});

test('an unrecognised item does not drag the plate towards nothing', () => {
  const plate = plateComposition([
    { name: 'jollof rice', confidencePct: 90 },
    { name: 'zorblax', confidencePct: 90 },
  ]);
  assert.deepEqual(plate?.matched, ['jollof rice']);
  assert.equal(plate?.composition.saltG, 0.7, 'the recognised item alone');
});

test('a plate of nothing recognised returns nothing, not a middling guess', () => {
  assert.equal(plateComposition([{ name: 'zorblax', confidencePct: 90 }]), null);
  assert.equal(plateComposition([]), null);
});

test('an item with no stated confidence still counts, at a modest weight', () => {
  const plate = plateComposition([{ name: 'cheddar', confidencePct: null }]);
  assert.equal(plate?.composition.saturatesG, 21.7);
});
