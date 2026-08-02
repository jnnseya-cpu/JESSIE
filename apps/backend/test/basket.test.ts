import assert from 'node:assert/strict';
import { test } from 'node:test';
import { basketFrom, flagsFor, packGrams, REFERENCE_INTAKE } from '../src/foodlens/basket.logic.ts';

test('pack sizes are read the dozen ways a label writes them', () => {
  assert.equal(packGrams('385g'), 385);
  assert.equal(packGrams('385 g'), 385);
  assert.equal(packGrams('1.5 kg'), 1500);
  assert.equal(packGrams('500ml'), 500);
  assert.equal(packGrams('1,5 l'), 1500);
  assert.equal(packGrams('4 x 125 g'), 500);
  assert.equal(packGrams('6 × 330 ml'), 1980);
  // A size nobody can read is left out rather than guessed at.
  assert.equal(packGrams('family pack'), null);
  assert.equal(packGrams(null), null);
});

test('a trolley adds up to days of food, not a verdict', () => {
  const basket = basketFrom([
    {
      barcode: '1',
      name: 'Sardines in oil',
      quantity: '90g',
      kcalPer100g: 294,
      per100g: { fatG: 22.8, saturatesG: 5.9, sugarsG: 0, saltG: 1 },
    },
    {
      barcode: '2',
      name: 'Sponge cake',
      quantity: '385g',
      kcalPer100g: 364,
      per100g: { fatG: 11.7, saturatesG: 4.5, sugarsG: 40.3, saltG: 1.2 },
    },
  ]);

  assert.equal(basket.products, 2);
  assert.equal(basket.weighed, 2);

  const sugars = basket.totals.find((t) => t.key === 'sugarsG');
  // 40.3g per 100g across a 385g cake is 155g of sugar.
  assert.equal(sugars?.total, 155.2);
  assert.equal(sugars?.days, Math.round((155.2 / REFERENCE_INTAKE.sugarsG) * 10) / 10);
  assert.equal(sugars?.topContributors[0]?.name, 'Sponge cake');
});

test('an unreadable pack size is reported, never invented', () => {
  const basket = basketFrom([
    { barcode: '1', name: 'Loose apples', quantity: null, kcalPer100g: 52 },
    { barcode: '2', name: 'Bread', quantity: '800g', kcalPer100g: 250, per100g: { saltG: 0.9 } },
  ]);
  assert.equal(basket.weighed, 1);
  assert.match(basket.note, /left out rather than guessed at/);
});

test('a flag fires when one nutrient is out of step with the food itself', () => {
  // A basket carrying a fortnight of salt against a few days of food.
  const flags = flagsFor([
    { key: 'energyKcal', label: 'Energy', total: 6000, days: 3, topContributors: [] },
    {
      key: 'saltG',
      label: 'Salt',
      total: 36,
      days: 6,
      topContributors: [{ name: 'Stock cubes', amount: 22 }],
    },
    { key: 'sugarsG', label: 'Sugars', total: 270, days: 3, topContributors: [] },
  ]);

  assert.equal(flags.length, 1, 'only the nutrient that is out of step');
  assert.equal(flags[0]?.nutrient, 'salt');
  assert.match(flags[0]?.says ?? '', /6 days of salt against 3 days of food/);
  assert.match(flags[0]?.action ?? '', /Stock cubes/);
});

test('a big shop is not scolded for being big', () => {
  // Everything doubled: a family shop, in proportion. No flags.
  const flags = flagsFor([
    { key: 'energyKcal', label: 'Energy', total: 28000, days: 14, topContributors: [] },
    { key: 'saltG', label: 'Salt', total: 84, days: 14, topContributors: [] },
    { key: 'sugarsG', label: 'Sugars', total: 1260, days: 14, topContributors: [] },
  ]);
  assert.deepEqual(flags, []);
});

test('a bag of apples is not flagged for sugar', () => {
  // The comparison only means something once there is a shop to read.
  const basket = basketFrom([
    {
      barcode: '9',
      name: 'Apples',
      quantity: '500g',
      kcalPer100g: 52,
      per100g: { fatG: 0.2, saturatesG: 0, sugarsG: 10.4, saltG: 0 },
    },
  ]);
  assert.deepEqual(basket.flags, [], 'half a kilo of fruit is not a verdict on the week');
  assert.match(basket.note, /Too little here to read as a shop yet/);
});

test('a nutrient nobody has bought much of is not named', () => {
  const flags = flagsFor([
    { key: 'energyKcal', label: 'Energy', total: 4000, days: 2, topContributors: [] },
    { key: 'saltG', label: 'Salt', total: 4.2, days: 0.7, topContributors: [] },
  ]);
  assert.deepEqual(flags, [], 'under a day of salt is not a salt problem');
});

test('a real shop still gets its flag', () => {
  const basket = basketFrom([
    {
      barcode: '1',
      name: 'Mature Cheddar',
      quantity: '400g',
      kcalPer100g: 416,
      per100g: { fatG: 34.9, saturatesG: 21.7, sugarsG: 0.1, saltG: 1.8 },
    },
    {
      barcode: '4',
      name: 'White Bread',
      quantity: '800g',
      kcalPer100g: 235,
      per100g: { fatG: 1.5, saturatesG: 0.3, sugarsG: 3.4, saltG: 0.98 },
    },
    {
      barcode: '5',
      name: 'Chicken Breast',
      quantity: '1 kg',
      kcalPer100g: 106,
      per100g: { fatG: 1.1, saturatesG: 0.3, sugarsG: 0, saltG: 0.2 },
    },
  ]);
  const saturates = basket.flags.find((f) => f.nutrient === 'saturates');
  assert.ok(saturates, 'a fortnight of saturates against a few days of food still fires');
  assert.match(saturates?.action ?? '', /Mature Cheddar/);
});
