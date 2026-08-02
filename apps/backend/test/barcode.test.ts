import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toLabelFacts } from '../src/foodlens/barcode.logic.ts';

/**
 * The mapping from an open-database product record to the facts the
 * platform will show. Tested without a network, because the interesting
 * failures are all in the translation.
 */

test('a full product record becomes a usable label', () => {
  const facts = toLabelFacts('3017620422003', {
    product_name: 'Nutella',
    brands: 'Ferrero, Nutella',
    quantity: '400 g',
    nutriments: {
      'energy-kcal_100g': 539,
      fat_100g: 30.9,
      'saturated-fat_100g': 10.6,
      sugars_100g: 56.3,
      salt_100g: 0.107,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
    },
    allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans'],
    ingredients_text: 'Sugar, palm oil, hazelnuts, skimmed milk powder',
  });

  assert.equal(facts.name, 'Nutella');
  assert.equal(facts.brand, 'Ferrero', 'the first brand only');
  assert.equal(facts.per100g.sugarsG, 56.3);
  assert.equal(facts.kcalPer100g, 539);
  assert.deepEqual(facts.allergensPresent.sort(), ['milk', 'soybeans', 'tree nuts']);
  assert.equal(facts.declaresFullList, true, 'a tagged list is what permits "absent"');
});

test('a sparse record keeps only what the label actually carries', () => {
  const facts = toLabelFacts('5000000000000', {
    product_name: '  ',
    nutriments: { salt_100g: 1.2 },
    allergens_tags: [],
  });

  assert.equal(facts.name, 'Unnamed product');
  assert.equal(facts.brand, null);
  assert.deepEqual(facts.per100g, { saltG: 1.2 }, 'no invented nutrients');
  assert.equal(facts.kcalPer100g, null);
  assert.equal(
    facts.declaresFullList,
    false,
    'no allergen tags means nothing may ever be called absent',
  );
});

test('allergen tags are mapped to the UK fourteen and deduplicated', () => {
  const facts = toLabelFacts('1', {
    nutriments: {},
    allergens_tags: ['en:gluten', 'fr:gluten', 'en:sesame-seeds', 'en:unknown-thing'],
  });
  assert.deepEqual(facts.allergensPresent.sort(), ['cereals containing gluten', 'sesame']);
});

test('a nutriment that is not a number is not a measurement', () => {
  const facts = toLabelFacts('2', {
    nutriments: { fat_100g: 'lots', sugars_100g: null, salt_100g: 0.4 },
    allergens_tags: [],
  });
  assert.deepEqual(facts.per100g, { saltG: 0.4 });
});

test('a label figure carries one decimal, not fifteen', () => {
  // Open Food Facts stores some figures as a division that never
  // terminates. 11.6883116883117g of fat is arithmetic leaking through a
  // nutrition panel — a real Twinkies record, exactly as returned.
  const facts = toLabelFacts('2500002344567', {
    product_name: 'sponge cake with creamy filling',
    brands: 'Hostess Twinkies',
    quantity: '385g',
    nutriments: {
      'energy-kcal_100g': 363.636363636364,
      fat_100g: 11.6883116883117,
      'saturated-fat_100g': 4.54545454545455,
      sugars_100g: 40.2597402597403,
      salt_100g: 1.16883116883117,
    },
    allergens_tags: ['en:eggs', 'en:gluten', 'en:milk', 'en:soybeans'],
  });

  assert.equal(facts.per100g.fatG, 11.7);
  assert.equal(facts.per100g.saturatesG, 4.5);
  assert.equal(facts.per100g.sugarsG, 40.3);
  assert.equal(facts.per100g.saltG, 1.2);
  assert.equal(facts.kcalPer100g, 364, 'energy is a whole number');
});
