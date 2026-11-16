/**
 * The Nutri-Score computation, against the cases that catch it out.
 *
 * Most of these are not "does the arithmetic work". They are the four
 * places an unofficial implementation reliably goes wrong: forgetting to
 * convert salt to sodium, scoring a drink on the food table, scoring an
 * oil on absolute saturates, and letting protein rescue a product the
 * rule says it must not rescue. Each costs a grade or two, and each
 * produces a number that looks entirely plausible.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADDITIVE_FACTS,
  GRADE_MEANING,
  NOVA_DEFINITIONS,
  NUTRI_GRADES,
  NUTRI_LIMITATIONS,
  SALT_TO_SODIUM_MG,
  additiveReading,
  gradeFor,
  mayCompare,
  nutriScore,
  oilFruitVegPercent,
  originReading,
  processingReading,
  reconcile,
  shelfReading,
} from '@jessmove/foodlens';
import { categoryFor, novaGroupOf } from '../src/foodlens/barcode.logic.ts';

/* ------------------------------------------------------------------ *
 * The four classic mistakes
 * ------------------------------------------------------------------ */

test('salt is converted to sodium, and getting it wrong costs grades', () => {
  /*
   * The table is in milligrams of sodium; labels print grams of salt.
   * A gram of salt is 400 mg of sodium, so a product with 1.2 g of salt
   * sits at 480 mg and earns 5 points. Reading 1.2 straight into the
   * sodium table earns 0, which is the whole of the difference between
   * a C and an A on a salty product.
   */
  assert.equal(SALT_TO_SODIUM_MG, 400);

  const salty = nutriScore({
    category: 'food',
    energyKcal: 100,
    sugarsG: 1,
    saturatesG: 0.5,
    saltG: 1.2,
    proteinG: 2,
    fibreG: 1,
  })!;
  const sodium = salty.negatives.find((n) => n.key === 'sodium')!;
  assert.equal(sodium.points, 5, `1.2 g salt is 480 mg sodium and should score 5, got ${sodium.points}`);

  // The same product with a tenth of the salt scores nothing on that line.
  const unsalted = nutriScore({
    category: 'food',
    energyKcal: 100,
    sugarsG: 1,
    saturatesG: 0.5,
    saltG: 0.12,
    proteinG: 2,
    fibreG: 1,
  })!;
  assert.equal(unsalted.negatives.find((n) => n.key === 'sodium')!.points, 0);
  assert.ok(unsalted.score < salty.score, 'less salt must score better');
});

test('a drink is scored on the drinks table, not the food one', () => {
  /*
   * A cola has about 10.6 g of sugar per 100 ml. On the food table that
   * is 2 points and the drink looks fine. On the drinks table it is 7,
   * and the product is an E. Scoring drinks on the food scale is why a
   * naive implementation calls a sugary drink a C.
   */
  const asFood = nutriScore({
    category: 'food',
    energyKcal: 42,
    sugarsG: 10.6,
    saturatesG: 0,
    saltG: 0.01,
  })!;
  const asDrink = nutriScore({
    category: 'beverage',
    energyKcal: 42,
    sugarsG: 10.6,
    saturatesG: 0,
    saltG: 0.01,
  })!;

  assert.ok(
    asDrink.negativePoints > asFood.negativePoints,
    `drinks table must be harsher: food ${asFood.negativePoints}, drink ${asDrink.negativePoints}`,
  );
  assert.equal(asDrink.grade, 'E');
  assert.notEqual(asFood.grade, asDrink.grade, 'the two tables must not agree here');
});

test('A is unreachable for a drink that is not water', () => {
  /*
   * Surprising, and deliberate. On the drinks scale only water grades A.
   * An unsweetened drink with nothing in it still starts at B, and an
   * implementation that reuses the food cut-offs hands out As to diet
   * drinks.
   */
  const plainish = nutriScore({
    category: 'beverage',
    energyKcal: 0,
    sugarsG: 0,
    saturatesG: 0,
    saltG: 0,
  })!;
  assert.equal(plainish.grade, 'B');

  const water = nutriScore({ category: 'water' })!;
  assert.equal(water.grade, 'A');
  assert.match(water.says, /by definition/);

  // No drink score, however good, may reach A.
  for (let score = -20; score <= 20; score += 1) {
    assert.notEqual(gradeFor(score, 'beverage'), 'A', `score ${score} reached A on the drinks scale`);
  }
});

test('an oil is scored on its saturated share, not its absolute saturates', () => {
  /*
   * Olive oil carries about 14 g of saturated fat per 100 g, which is
   * the top of the absolute table — 10 points, every time, for every
   * oil. The added-fats rule scores the proportion instead, so olive oil
   * at roughly 15% saturated separates from butter at roughly 63%.
   */
  const olive = nutriScore({
    category: 'fat',
    energyKcal: 824,
    sugarsG: 0,
    saturatesG: 14,
    fatG: 92,
    saltG: 0,
  })!;
  const butter = nutriScore({
    category: 'fat',
    energyKcal: 744,
    sugarsG: 0.6,
    saturatesG: 52,
    fatG: 82,
    saltG: 0.9,
  })!;

  const oliveSat = olive.negatives.find((n) => n.key === 'saturates')!;
  assert.equal(oliveSat.unit, '% of total fat');
  assert.ok(oliveSat.points <= 2, `olive oil scored ${oliveSat.points} on saturates share`);
  assert.ok(
    butter.negatives.find((n) => n.key === 'saturates')!.points >= 9,
    'butter should be at the top of the saturated-share table',
  );
  assert.ok(olive.score < butter.score, 'olive oil must score better than butter');
});

test('protein cannot rescue a product above eleven negative points', () => {
  /*
   * The rule that stops processed meat climbing back up the scale on its
   * protein. Without it, something salty and fatty enough to score 15
   * negatives claws back 5 and lands two grades higher than it should.
   */
  const processedMeat = nutriScore({
    category: 'food',
    energyKcal: 330,
    sugarsG: 1,
    saturatesG: 12,
    saltG: 4,
    proteinG: 20,
    fibreG: 0,
  })!;
  assert.ok(processedMeat.negativePoints >= 11, 'fixture must exceed the threshold to be meaningful');
  assert.equal(processedMeat.proteinExcluded, true);
  assert.equal(processedMeat.positives.find((p) => p.key === 'protein')!.points, 0);
  assert.match(
    processedMeat.positives.find((p) => p.key === 'protein')!.says,
    /do not count/,
    'the exclusion must be explained where it happened, not silently applied',
  );
  assert.equal(processedMeat.grade, 'E');
});

test('cheese keeps its protein points, which is the one exception', () => {
  const asFood = nutriScore({
    category: 'food',
    energyKcal: 402,
    sugarsG: 0.1,
    saturatesG: 21,
    saltG: 1.8,
    proteinG: 25,
  })!;
  const asCheese = nutriScore({
    category: 'cheese',
    energyKcal: 402,
    sugarsG: 0.1,
    saturatesG: 21,
    saltG: 1.8,
    proteinG: 25,
  })!;

  assert.ok(asFood.negativePoints >= 11, 'the fixture must be above the threshold');
  assert.equal(asFood.proteinExcluded, true);
  assert.equal(asCheese.proteinExcluded, false);
  assert.ok(
    asCheese.score < asFood.score,
    'cheese must score better than the same figures scored as a general food',
  );
});

test('full fruit and vegetable marks also restore the protein points', () => {
  const heavyButWholesome = nutriScore({
    category: 'food',
    energyKcal: 350,
    sugarsG: 20,
    saturatesG: 6,
    saltG: 1.5,
    proteinG: 10,
    fibreG: 5,
    fruitVegPercent: 85,
  })!;
  assert.ok(heavyButWholesome.negativePoints >= 11);
  assert.equal(heavyButWholesome.proteinExcluded, false);
});

/* ------------------------------------------------------------------ *
 * Refusals and honesty
 * ------------------------------------------------------------------ */

test('an incomplete panel produces no grade rather than a flattering one', () => {
  /*
   * The important direction. Scoring a product on two of its four
   * negatives does not produce a cautious grade, it produces a much
   * better one — and the products missing figures are not a random
   * sample.
   */
  assert.equal(nutriScore({ category: 'food', energyKcal: 200, sugarsG: 5 }), null);
  assert.equal(
    nutriScore({ category: 'food', energyKcal: 200, sugarsG: 5, saturatesG: 2 }),
    null,
    'three of four negatives is still not enough',
  );
  assert.ok(
    nutriScore({ category: 'food', energyKcal: 200, sugarsG: 5, saturatesG: 2, saltG: 0.5 }),
    'all four negatives present must produce a grade',
  );
});

test('missing positives are named, scored at zero, and never assumed', () => {
  const result = nutriScore({
    category: 'food',
    energyKcal: 200,
    sugarsG: 5,
    saturatesG: 2,
    saltG: 0.5,
  })!;
  for (const expected of ['fibre', 'protein', 'fruit and vegetable content']) {
    assert.ok(
      result.missing.includes(expected),
      `${expected} was absent and should be named in missing, got ${result.missing.join(', ')}`,
    );
  }
  assert.equal(result.positivePoints, 0, 'an undeclared positive earns nothing');
});

test('every grade carries a meaning, and the worst nutrient is named', () => {
  for (const grade of NUTRI_GRADES) {
    assert.ok(GRADE_MEANING[grade].length > 20, `${grade} has no meaning text`);
  }
  const sugary = nutriScore({
    category: 'food',
    energyKcal: 480,
    sugarsG: 60,
    saturatesG: 2,
    saltG: 0.1,
  })!;
  assert.match(
    sugary.says,
    /sugars/i,
    'a D or E must name the nutrient carrying the penalty, or it changes nothing',
  );
});

test('cross-category comparison is refused, not discouraged', () => {
  const same = mayCompare('food', 'food');
  assert.equal(same.allowed, true);

  const across = mayCompare('fat', 'food');
  assert.equal(across.allowed, false);
  assert.match(across.why, /different tables/);

  const drinkVsFood = mayCompare('beverage', 'cheese');
  assert.equal(drinkVsFood.allowed, false);
});

test('the limitations travel with the score', () => {
  assert.ok(NUTRI_LIMITATIONS.length >= 5, 'the limitation list has been trimmed');
  const joined = NUTRI_LIMITATIONS.join(' ').toLowerCase();
  // The four the published description is explicit about.
  assert.match(joined, /like with like|against others of its kind/);
  assert.match(joined, /additive/);
  assert.match(joined, /vitamin/);
  assert.match(joined, /100 g|100 ml/);
  assert.match(joined, /voluntary/);
});

test('the algorithm version is stated on every result, never implied', () => {
  const result = nutriScore({
    category: 'food',
    energyKcal: 200,
    sugarsG: 5,
    saturatesG: 2,
    saltG: 0.5,
  })!;
  assert.equal(result.algorithmVersion, '2017');
});

/* ------------------------------------------------------------------ *
 * Reconciliation
 * ------------------------------------------------------------------ */

test('a disagreement with the published grade is reported, not smoothed over', () => {
  const agree = reconcile('C', 'c');
  assert.equal(agree.agree, true);

  const disagree = reconcile('D', 'B');
  assert.equal(disagree.agree, false);
  assert.match(disagree.says, /disagree/);
  assert.match(disagree.says, /packet in your hand/, 'must say which one to trust');

  const noPublished = reconcile('C', null);
  assert.equal(noPublished.agree, null);
  assert.match(noPublished.says, /publishes no grade/);

  const neither = reconcile(null, null);
  assert.equal(neither.agree, null);
  assert.match(neither.says, /No Nutri-Score/);

  // A junk published value is not a grade.
  assert.equal(reconcile('C', 'unknown').published, null);
  assert.equal(reconcile('C', 'not-applicable').published, null);
});

/* ------------------------------------------------------------------ *
 * The other three axes
 * ------------------------------------------------------------------ */

test('an unclassified product is unknown, never unprocessed', () => {
  const none = processingReading(null);
  assert.equal(none.group, null);
  assert.match(none.says, /not the same as unprocessed/);
  assert.equal(none.source, 'not_declared');

  const ultra = processingReading(4);
  assert.equal(ultra.group, 4);
  assert.match(ultra.says, /not a verdict/, 'group 4 must not read as a condemnation');
  assert.ok(NOVA_DEFINITIONS[4].examples.length > 10);
});

test('additives are named in English, and unrecognised codes are admitted', () => {
  const reading = additiveReading(['en:e471', 'en:e330', 'en:e999999']);
  assert.equal(reading.count, 3);
  assert.equal(reading.known.length, 2);
  assert.deepEqual([...reading.unrecognised], ['E999999']);
  assert.ok(
    reading.known.every((a) => a.role.length > 5),
    'every known additive must say what it does',
  );
  assert.match(reading.says, /safety ranking/);
});

test('an empty additive list over no ingredients is not declared, never none', () => {
  /*
   * Found on a phone, in a shop. A Nando's sauce came back with no
   * processing group, no allergen list and no origin — three signs that
   * nobody had entered its ingredients — and an additives axis reading
   * "None declared". Open Food Facts derives `additives_tags` by
   * parsing the ingredients text, so a record with no ingredients
   * yields an empty array rather than a missing field, and reading that
   * array on its own turns an absence of data into a statement about
   * the product. It is the one reading somebody avoiding an additive
   * would act on.
   */
  const unentered = additiveReading([], false);
  assert.equal(unentered.source, 'not_declared');
  assert.match(unentered.says, /no ingredients list/);
  assert.match(unentered.says, /rather than none/);

  // And the honest version of the same shape: a list that was read and
  // was genuinely empty still counts as read.
  const read = additiveReading([], true);
  assert.equal(read.source, 'open_food_facts');
  assert.match(read.says, /No additives declared/);

  /*
   * The axis count must follow, because "3 of 3 declared" over a record
   * nobody has filled in is the same false confidence one level up.
   */
  const sparse = shelfReading({ novaGroup: null, additiveTags: [], ingredientsText: null });
  assert.equal(sparse.additives.source, 'not_declared');
  assert.equal(sparse.axesRead, 0, 'an unread additive list is not an axis that was read');

  const entered = shelfReading({
    novaGroup: null,
    additiveTags: [],
    ingredientsText: 'Water, tomatoes, salt.',
  });
  assert.equal(entered.axesRead, 1);

  // Defaulting must not reintroduce it quietly: a caller that passes no
  // ingredients argument at all is trusted, which is why the backend
  // passes one explicitly.
  assert.equal(additiveReading(null).source, 'not_declared');
});

test('where a product is sold is not where it came from, and does not count as read', () => {
  /*
   * Same error, one axis over, found on the same screenshot. `source`
   * was set to open_food_facts whenever `countries` was filled in, so a
   * record carrying nothing but "sold in France" counted as an origin
   * that had been read — while the sentence directly above it said "No
   * origin declared". The axis tally contradicted its own detail, in the
   * direction that flatters the record.
   */
  const soldOnly = originReading({ countries: 'France' });
  assert.equal(soldOnly.source, 'not_declared');
  assert.deepEqual([...soldOnly.soldIn], ['France'], 'the sold-in country is still kept');
  assert.match(soldOnly.says, /not the same thing/);

  // A real origin still reads as one, and so does a place of manufacture.
  assert.equal(originReading({ origins: 'Italy' }).source, 'open_food_facts');
  assert.equal(originReading({ manufacturingPlaces: 'Wales' }).source, 'open_food_facts');

  /*
   * The record from the phone, end to end: a nutrition panel and
   * nothing else. Nought of three, not two.
   */
  const bare = shelfReading({
    novaGroup: null,
    additiveTags: [],
    ingredientsText: null,
    countries: 'France',
  });
  assert.equal(bare.axesRead, 0);
  assert.match(bare.says, /nutrition panel and nothing else/);
});

test('the colours needing a legal warning carry the regulator\'s own words', () => {
  const reading = additiveReading(['en:e102', 'en:e110']);
  assert.equal(reading.withRegulatoryNote.length, 2);
  for (const additive of reading.withRegulatoryNote) {
    assert.match(
      additive.regulatoryNote!,
      /activity and attention in children/,
      `${additive.code} does not quote the required warning`,
    );
  }
  assert.match(reading.says, /legally required/);

  // All six Southampton colours must be present, or the check is partial.
  for (const code of ['e102', 'e104', 'e110', 'e122', 'e124', 'e129']) {
    assert.ok(ADDITIVE_FACTS[code]?.regulatoryNote, `${code} is missing its warning`);
  }
});

test('sweeteners are picked out, because Nutri-Score 2017 cannot see them', () => {
  const reading = additiveReading(['en:e951', 'en:e955', 'en:e330']);
  assert.equal(reading.sweeteners.length, 2);
  assert.ok(
    reading.known.find((a) => a.code === 'E951')!.regulatoryNote!.includes('phenylalanine'),
    'aspartame must carry its PKU note',
  );
});

test('a list of markets is not a provenance, and is not presented as one', () => {
  const soldOnly = originReading({ countries: 'en:united-kingdom,en:ireland' });
  assert.equal(soldOnly.ingredientOrigins.length, 0);
  assert.match(soldOnly.says, /not the same thing/);

  const made = originReading({
    manufacturingPlaces: 'Italy',
    countries: 'en:united-kingdom',
  });
  assert.match(made.says, /Made or packed in Italy/);
  assert.match(
    made.says,
    /made in is not grown in/,
    'a manufacturing place without an ingredient origin must say so',
  );

  const full = originReading({ origins: 'Italy', manufacturingPlaces: 'Italy' });
  assert.match(full.says, /Ingredients declared from Italy/);
  assert.doesNotMatch(full.says, /not grown in/);

  const nothing = originReading({});
  assert.equal(nothing.source, 'not_declared');
});

test('the four readings are reported apart and never blended', () => {
  const reading = shelfReading({
    novaGroup: 4,
    additiveTags: ['en:e471'],
    origins: 'Italy',
  });
  assert.equal(reading.axesRead, 3);

  /*
   * The load-bearing assertion in this file. `NEVER_CLAIM` forbids a
   * single composite health score, and the way that rule gets broken is
   * not by somebody arguing for it — it is by a helpful addition that
   * averages four readings into one tidy figure. There is no numeric
   * summary on this object, and there must not be one.
   */
  const keys = Object.keys(reading);
  assert.deepEqual(
    keys.sort(),
    ['additives', 'axesRead', 'origin', 'processing', 'says'].sort(),
    'a field was added to the shelf reading — if it is a combined score, it is forbidden',
  );

  const bare = shelfReading({});
  assert.equal(bare.axesRead, 0);
  assert.match(bare.says, /nutrition panel and nothing else/);
});

/* ------------------------------------------------------------------ *
 * Two bugs this feature found in itself
 * ------------------------------------------------------------------ */

test('a packing medium in a product name is not the product', () => {
  /*
   * The worst bug in this feature's short history. `water` is the one
   * category that short-circuits the whole algorithm — it returns A by
   * definition — and the first version matched the product name, so
   * "Chickpeas in water" was graded A on no evidence at all. "Tuna in
   * spring water" and "Peaches in syrup and water" would have gone the
   * same way: real products, flattering letters, no error anywhere.
   *
   * Water is now read from the category tags alone, and the exact tag is
   * required rather than the word.
   */
  assert.equal(categoryFor(['en:legumes', 'en:canned-foods'], 'Chickpeas in water'), 'food');
  assert.equal(categoryFor(['en:fishes', 'en:canned-fishes'], 'Tuna in spring water'), 'food');
  assert.equal(categoryFor(['en:waters'], 'Still water'), 'water');
  assert.equal(categoryFor(['en:natural-mineral-waters'], 'Mineral water'), 'water');

  // A flavoured water is a drink, not water.
  assert.equal(categoryFor(['en:waters'], 'Flavoured water, strawberry'), 'beverage');
});

test('the scoring table is chosen before anything else can go wrong', () => {
  assert.equal(categoryFor(['en:beverages', 'en:sodas'], 'Cola'), 'beverage');
  assert.equal(categoryFor(['en:cheeses'], 'Mature cheddar'), 'cheese');
  assert.equal(categoryFor(['en:olive-oils'], 'Extra virgin olive oil'), 'fat');
  assert.equal(categoryFor([], 'Something nobody has categorised'), 'food');
});

test('olive, rapeseed and walnut oils are credited on the fruit line', () => {
  /*
   * Found by the reconciliation rather than by review: olive oil
   * computed D where the database published C, and the database was
   * right. The official algorithm counts these three oils at their full
   * content in the fruit, vegetable, pulse and nut component. Without
   * it, every oil is an E on energy alone and olive oil is
   * indistinguishable from palm oil — which is the single comparison
   * that component exists to make.
   */
  assert.equal(oilFruitVegPercent('Extra virgin olive oil', null), 100);
  assert.equal(oilFruitVegPercent('Cold pressed rapeseed oil', null), 100);
  assert.equal(oilFruitVegPercent('Walnut oil', null), 100);
  assert.equal(oilFruitVegPercent('Palm oil', null), null);
  assert.equal(oilFruitVegPercent('Sunflower oil', null), null);

  // A declared figure always wins over the allowance.
  assert.equal(oilFruitVegPercent('Olive oil blend', 40), 40);

  const olive = nutriScore({
    category: 'fat',
    energyKcal: 824,
    sugarsG: 0,
    saturatesG: 14,
    fatG: 92,
    saltG: 0,
    fruitVegPercent: oilFruitVegPercent('Extra virgin olive oil', null),
  })!;
  const palm = nutriScore({
    category: 'fat',
    energyKcal: 884,
    sugarsG: 0,
    saturatesG: 49,
    fatG: 100,
    saltG: 0,
    fruitVegPercent: oilFruitVegPercent('Palm oil', null),
  })!;
  assert.equal(olive.grade, 'C');
  assert.ok(
    palm.score > olive.score,
    `palm oil (${palm.score}) must score worse than olive (${olive.score})`,
  );
});

test('a processing group is read whatever shape the record stores it in', () => {
  /*
   * Open Food Facts is community-entered and its values are not
   * uniformly typed: a NOVA group can arrive as the number 4 or as the
   * string "4". A strict number check reads the string as absent, and
   * absent means "not classified" — so an ultra-processed product would
   * present as unclassified, with no error anywhere and nothing to
   * notice.
   *
   * Permissive about shape, strict about value.
   */
  assert.equal(novaGroupOf(4), 4);
  assert.equal(novaGroupOf('4'), 4);
  assert.equal(novaGroupOf(' 3 '), 3);
  assert.equal(novaGroupOf(1), 1);

  // Only 1 to 4 are groups. Everything else is honestly unknown.
  assert.equal(novaGroupOf(0), null);
  assert.equal(novaGroupOf(5), null);
  assert.equal(novaGroupOf(2.5), null);
  assert.equal(novaGroupOf('unknown'), null);
  assert.equal(novaGroupOf(''), null);
  assert.equal(novaGroupOf(null), null);
  assert.equal(novaGroupOf(undefined), null);
  assert.equal(novaGroupOf({}), null);

  // And the reading that follows from it says the right thing.
  assert.equal(processingReading(novaGroupOf('4')).group, 4);
  assert.equal(processingReading(novaGroupOf('nonsense')).source, 'not_declared');
});

/* ------------------------------------------------------------------ *
 * Classifications: flagged, and not turned into alarm
 * ------------------------------------------------------------------ */

test('every classification names a body, a year, and what it does not mean', () => {
  /*
   * The shape of the entry is the safety control.
   *
   * `meansNot` is required because hazard is not risk, and that is the
   * most misread distinction in this field. IARC judges whether a
   * substance can cause cancer under any conditions at any dose, not
   * whether it does at the amount in a tin — Group 1 holds processed
   * meat and sunlight alongside asbestos. An entry that says "possibly
   * carcinogenic" and stops is true, useless, and frightening, and this
   * platform is read by ten-year-olds and by people with health anxiety.
   */
  const withConcern = Object.values(ADDITIVE_FACTS).filter((a) => a.concern);
  assert.ok(withConcern.length >= 6, `only ${withConcern.length} classifications`);

  for (const additive of withConcern) {
    const c = additive.concern!;
    assert.ok(
      ['IARC', 'EFSA', 'JECFA', 'FSA'].includes(c.body),
      `${additive.code} cites "${c.body}", which is not a body this module recognises`,
    );
    assert.ok(c.year >= 1960 && c.year <= 2030, `${additive.code} has year ${c.year}`);
    assert.ok(c.classification.length > 15, `${additive.code} has no real classification text`);
    assert.ok(c.means.length > 40, `${additive.code} does not say what it means`);
    assert.ok(
      c.meansNot.length > 40,
      `${additive.code} does not say what it does NOT mean, which is where this misleads`,
    );
    assert.ok(
      c.status.length > 30,
      `${additive.code} does not say where it stands with the regulator today`,
    );
  }
});

test('a scary classification always travels with its current status', () => {
  /*
   * "Classified 2B in 2023" and "authorised, with the acceptable daily
   * intake unchanged" are both true, and only the pair is honest.
   * Publishing the first without the second is how a shopper concludes
   * a diet drink is banned-in-waiting.
   */
  for (const additive of Object.values(ADDITIVE_FACTS)) {
    if (!additive.concern) continue;
    const c = additive.concern;
    const alarming = /carcinogen|cancer|tumour|genotox/i.test(
      `${c.classification} ${c.means}`,
    );
    if (!alarming) continue;
    assert.match(
      c.status,
      /authorised|banned|not authorised|permitted|withdrawn/i,
      `${additive.code} describes a cancer classification without saying where it ` +
        'stands with the regulator now',
    );
  }
});

test('aspartame carries the dose that the classification does not', () => {
  /*
   * The one people will look for, and the one most easily misreported.
   * IARC and JECFA reported in the same month and said different things:
   * a 2B classification, and an unchanged acceptable daily intake. Both
   * belong on the card.
   */
  const aspartame = ADDITIVE_FACTS.e951!;
  assert.ok(aspartame.concern, 'aspartame carries no classification');
  assert.equal(aspartame.concern!.body, 'IARC');
  assert.equal(aspartame.concern!.year, 2023);
  assert.match(aspartame.concern!.classification, /2B/);
  assert.match(aspartame.concern!.status, /JECFA/, 'the dose review must be named');
  assert.match(aspartame.concern!.status, /40 mg/, 'the acceptable daily intake must be stated');
  assert.match(
    aspartame.concern!.meansNot,
    /not a statement about how much/i,
    'the hazard-versus-risk distinction must be explicit',
  );
});

test('classifications are reported apart from legal label warnings', () => {
  /*
   * Two different things that must not share a presentation. A
   * regulatory note is the law requiring words on a packet. A
   * classification is a body's published view, often about hazard, often
   * decades old, usually alongside an unchanged authorisation. One red
   * box for both turns "same group as pickled vegetables" into a
   * warning.
   */
  const reading = additiveReading(['en:e102', 'en:e951', 'en:e330']);

  /*
   * The two are orthogonal, and aspartame proves it by being in both:
   * the label must carry a phenylalanine declaration by law, and IARC
   * separately published a classification. Tartrazine has the legal
   * warning and no classification. Citric acid has neither. A single
   * list could not express any of that.
   */
  const legal = reading.withRegulatoryNote.map((a) => a.code).sort();
  const classified = reading.withConcern.map((a) => a.code).sort();
  assert.deepEqual(legal, ['E102', 'E951'], 'both carry a legal label requirement');
  assert.deepEqual(classified, ['E951'], 'only aspartame carries a classification');
  assert.ok(
    legal.includes('E102') && !classified.includes('E102'),
    'a legal warning must not imply a classification',
  );

  // Both at once: the legal requirement leads and the classification
  // still appears, rather than being hidden behind it.
  assert.match(reading.says, /legally required/);
  assert.match(reading.says, /also been classified by IARC/);

  // With no legal warning, the classification is named flatly.
  const calm = additiveReading(['en:e250', 'en:e330']);
  assert.match(calm.says, /IARC/);
  assert.match(calm.says, /does and does not mean/);
  assert.doesNotMatch(
    calm.says,
    /danger|unsafe|avoid|harmful|toxic|risk of/i,
    'the summary line must not editorialise beyond what the body published',
  );
});

test('an unauthorised additive is never described as approved', () => {
  /*
   * The summary line asserted "all approved for use here" without ever
   * checking, and it was false on an imported loaf carrying potassium
   * bromate — flatly contradicting the entry a few lines below it. A
   * sentence that reassures and a sentence that corrects it are worse
   * together than either alone.
   */
  const imported = additiveReading(['en:e924', 'en:e471']);
  assert.doesNotMatch(imported.says, /all approved/i);
  assert.match(imported.says, /not authorised as a food additive in the UK/);
  assert.match(imported.says, /Potassium bromate/);

  // And one that is authorised still says so.
  const ordinary = additiveReading(['en:e250', 'en:e301']);
  assert.match(ordinary.says, /approved for use here/);

  for (const additive of Object.values(ADDITIVE_FACTS)) {
    if (!additive.concern) continue;
    assert.equal(
      typeof additive.concern.authorisedHere,
      'boolean',
      `${additive.code} does not say whether it is authorised here`,
    );
  }
});

test('no additive is scored, ranked or given a traffic light', () => {
  /*
   * The line this must not cross. Ranking additives by danger would be
   * this platform substituting its own judgement for a regulator's, and
   * it is the composite verdict `NEVER_CLAIM` forbids wearing a lab
   * coat. There is no severity, no score, no level.
   */
  for (const additive of Object.values(ADDITIVE_FACTS)) {
    const keys = Object.keys(additive);
    for (const forbidden of ['severity', 'score', 'rating', 'level', 'danger', 'risk']) {
      assert.ok(
        !keys.includes(forbidden),
        `${additive.code} has a "${forbidden}" field — additives are reported, not ranked`,
      );
    }
    if (!additive.concern) continue;
    assert.deepEqual(
      Object.keys(additive.concern).sort(),
      ['authorisedHere', 'body', 'classification', 'means', 'meansNot', 'status', 'year'].sort(),
      `${additive.code}'s classification has gained a field — if it scores anything, it is forbidden`,
    );
  }
});

test('titanium dioxide is reported as permitted here, because it is', () => {
  /*
   * A factual error caught by reading the output rather than by a test
   * failing. E171 is banned as a food additive in the EU and still
   * permitted in Great Britain, and this platform is UK-based — UK
   * reference intakes, the FSA, the ICO. Marking it unauthorised "here"
   * would have told a shopper that a legally sold product was
   * contraband, which is a different and worse error than saying
   * nothing.
   */
  const e171 = ADDITIVE_FACTS.e171!;
  assert.equal(e171.concern!.authorisedHere, true);
  assert.match(e171.regulatoryNote!, /Still permitted in Great Britain/);
  assert.match(e171.concern!.status, /EU/, 'the EU ban must still be stated');

  const reading = additiveReading(['en:e171', 'en:e330']);
  assert.doesNotMatch(
    reading.says,
    /not authorised as a food additive in the UK/,
    'a product permitted here must not be described as unauthorised here',
  );
});

test('an unauthorised additive outranks a label warning in the summary', () => {
  /*
   * Ordering matters when both apply. "Not authorised here" is the
   * strongest thing this module can say about an additive, and it was
   * sitting behind the legal-warning branch where a product carrying
   * both would never have surfaced it.
   */
  const both = additiveReading(['en:e924', 'en:e102']);
  assert.match(both.says, /not authorised as a food additive in the UK/);
});
