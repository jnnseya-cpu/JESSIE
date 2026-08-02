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

/* ------------------------------------------------------------------ *
 * Vision failure advice — "unavailable" is not an instruction
 * ------------------------------------------------------------------ */

test('vision advice names the fix for each real failure mode', async () => {
  const { adviseOnVisionFailure } = await import('../src/foodlens/vision-advice.logic.ts');

  assert.match(
    adviseOnVisionFailure({ anthropic: 'No AI provider is configured.' }),
    /ANTHROPIC_API_KEY/,
  );
  assert.match(
    adviseOnVisionFailure({ anthropic: 'anthropic 404: model claude-opus-5 not found' }),
    /ANTHROPIC_MODEL/,
  );
  assert.match(
    adviseOnVisionFailure({ openai: 'openai 401: invalid api key' }),
    /Re-copy the key/,
  );
  assert.match(
    adviseOnVisionFailure({ openai: 'openai 429: rate limit exceeded' }),
    /quota or billing/,
  );
  assert.match(
    adviseOnVisionFailure({ gemini: 'unsupported image media type for this model' }),
    /vision-capable/,
  );
  assert.match(adviseOnVisionFailure({ openai: 'fetch failed' }), /network or timeout/);
  // Anything unrecognised still hands over the provider's exact words.
  assert.match(
    adviseOnVisionFailure({ gemini: 'something entirely new' }),
    /something entirely new/,
  );
});

/* ------------------------------------------------------------------ *
 * Vision JSON parsing — the packaging is not the answer
 * ------------------------------------------------------------------ */

test('a fenced JSON reply is read, not treated as an outage', async () => {
  const { parseVisionJson } = await import('../src/foodlens/vision-parse.logic.ts');
  const fenced =
    '```json\n{"items":[{"name":"roast chicken","confidencePct":91}],"likelyKcal":540,' +
    '"portionCertainty":0.4,"preparationCertainty":0.5}\n```';
  const out = parseVisionJson(fenced);
  assert.equal(out.ok, true);
  assert.equal(out.value?.items[0]?.name, 'roast chicken');
  assert.equal(out.value?.likelyKcal, 540);
});

test('prose either side of the object does not defeat the parser', async () => {
  const { parseVisionJson } = await import('../src/foodlens/vision-parse.logic.ts');
  const chatty =
    'Sure — here is the analysis:\n{"items":[{"name":"rice","confidencePct":80}],' +
    '"likelyKcal":300,"portionCertainty":0.3,"preparationCertainty":0.3}\nHope that helps.';
  assert.equal(parseVisionJson(chatty).ok, true);
});

test('a brace inside a food name cannot truncate the object', async () => {
  const { extractJsonObject } = await import('../src/foodlens/vision-parse.logic.ts');
  const tricky = 'x {"items":[{"name":"rice {special}","confidencePct":80}],"likelyKcal":1} y';
  const extracted = extractJsonObject(tricky);
  assert.ok(extracted?.endsWith('}'));
  assert.equal((JSON.parse(extracted!) as { likelyKcal: number }).likelyKcal, 1);
});

test('a model that says the photo is not food gives a reason, not a failure', async () => {
  const { parseVisionJson } = await import('../src/foodlens/vision-parse.logic.ts');
  const out = parseVisionJson(
    '{"items":[],"likelyKcal":0,"portionCertainty":0,"preparationCertainty":0,' +
      '"imageUsable":false,"imageIssue":"No food is visible in this photograph."}',
  );
  assert.equal(out.ok, true);
  assert.match(out.value?.unusable ?? '', /No food is visible/);
});

test('invented keys are ignored and out-of-range numbers are clamped', async () => {
  const { parseVisionJson } = await import('../src/foodlens/vision-parse.logic.ts');
  const out = parseVisionJson(
    '{"items":[{"name":"soup","confidencePct":900}],"likelyKcal":99999,' +
      '"portionCertainty":5,"preparationCertainty":-2,"moodOfTheChef":"cheerful"}',
  );
  assert.equal(out.value?.items[0]?.confidencePct, 100);
  assert.equal(out.value?.likelyKcal, 6000);
  assert.equal(out.value?.portionCertainty, 1);
  assert.equal(out.value?.preparationCertainty, 0);
  assert.equal((out.value as Record<string, unknown>).moodOfTheChef, undefined);
});

test('an empty answer with no reason is a parse failure that says why', async () => {
  const { parseVisionJson } = await import('../src/foodlens/vision-parse.logic.ts');
  assert.equal(parseVisionJson('I could not analyse that.').ok, false);
  assert.match(parseVisionJson('{"items":[]}').why ?? '', /no foods and gave no reason/);
});

test('the "not a meal" judgement is found however the model spells it', async () => {
  const { parseVisionJson } = await import('../src/foodlens/vision-parse.logic.ts');

  // The exact nested shape production returned on the second probe.
  const nested = parseVisionJson(
    '```json\n{"imageAssessment":{"usable":false,"reason":"The supplied image is a ' +
      'near-uniform pale pink field with no discernible food."},"items":[]}\n```',
  );
  assert.equal(nested.ok, true);
  assert.match(nested.value?.unusable ?? '', /pale pink field/);

  // And the flat spelling the prompt asks for.
  const flat = parseVisionJson('{"items":[],"imageUsable":false,"imageIssue":"Too dark to read."}');
  assert.match(flat.value?.unusable ?? '', /Too dark/);

  // A usable photo is never mistaken for an unusable one.
  const good = parseVisionJson(
    '{"items":[{"name":"toast","confidencePct":90}],"likelyKcal":200,"imageUsable":true}',
  );
  assert.equal(good.value?.unusable, undefined);
});

test('foods and energy are found even when the model nests or renames them', async () => {
  const { parseVisionJson } = await import('../src/foodlens/vision-parse.logic.ts');
  const out = parseVisionJson(
    '{"analysis":{"foods":[{"name":"lentil dahl","confidencePct":84}],"estimatedKcal":430},' +
      '"portionCertainty":0.4,"preparationCertainty":0.5}',
  );
  assert.equal(out.ok, true);
  assert.equal(out.value?.items[0]?.name, 'lentil dahl');
  assert.equal(out.value?.likelyKcal, 430);
});

test('capture quality names the specific fix for each failed check', async () => {
  const { captureQualityFrom } = await import('../src/foodlens/foodlens.logic.ts');
  const poor = captureQualityFrom({
    age: 40,
    items: [{ name: 'stew', confidencePct: 40 }],
    likelyKcal: 500,
    source: 'ai_visual_estimate',
    portionCertainty: 0.2,
    preparationCertainty: 0.2,
  });
  assert.ok(poor.passRate < 50);
  const barcode = poor.checks.find((c) => c.check === 'Verified source');
  assert.match(barcode?.detail ?? '', /scan the barcode/);
  const portion = poor.checks.find((c) => c.check === 'Portion pinned down');
  assert.match(portion?.detail ?? '', /second photo/);

  const good = captureQualityFrom({
    age: 40,
    items: [{ name: 'chicken', confidencePct: 95 }],
    likelyKcal: 500,
    source: 'barcode_verified_product',
    portionCertainty: 0.9,
    preparationCertainty: 0.9,
    allergenEvidence: { source: 'verified_manufacturer_label', declaresFullList: true },
  });
  assert.equal(good.passRate, 100);
});

test('the swap ladder starts small and ends with a different meal', async () => {
  const { swapLadderFor } = await import('../src/foodlens/foodlens.logic.ts');
  const ladder = swapLadderFor({
    age: 40,
    items: [],
    likelyKcal: 800,
    source: 'ai_visual_estimate',
    per100g: { fatG: 22, saturatesG: 6, sugarsG: 3, saltG: 1.8 },
    portionCertainty: 0.4,
    preparationCertainty: 0.3,
  });
  assert.equal(ladder[0]?.level, 1);
  assert.match(ladder[0]?.action ?? '', /half the sauce/);
  assert.match(ladder[1]?.action ?? '', /Grill or air-fry/);
  assert.equal(ladder[4]?.level, 5);
  assert.match(ladder[4]?.action ?? '', /different meal/);
});

test('a minor gets no swap ladder and no energy figures', async () => {
  const { analyse } = await import('../src/foodlens/foodlens.logic.ts');
  const result = analyse({
    age: 14,
    items: [{ name: 'pasta', confidencePct: 90 }],
    likelyKcal: 600,
    source: 'ai_visual_estimate',
    portionCertainty: 0.5,
    preparationCertainty: 0.5,
  }) as Record<string, unknown>;
  assert.deepEqual(result.swaps, []);
  assert.equal((result.energy as { withheld?: boolean }).withheld, true);
});

test('plants are counted from what was actually named', async () => {
  const { plantsFrom } = await import('../src/foodlens/foodlens.logic.ts');
  const plants = plantsFrom([
    { name: 'Fried ripe plantain slices', confidencePct: 80 },
    { name: 'Black beans', confidencePct: 70 },
    { name: 'Grilled chicken', confidencePct: 90 },
    { name: 'black beans', confidencePct: 60 },
  ]);
  assert.equal(plants.count, 2, 'chicken is not a plant and duplicates count once');
});

test('an unstated item certainty is never turned into 50%', async () => {
  const { parseVisionJson } = await import('../src/foodlens/vision-parse.logic.ts');
  const out = parseVisionJson('{"items":[{"name":"plantain"}],"likelyKcal":300}');
  assert.equal(out.value?.items[0]?.confidencePct, null);

  const stated = parseVisionJson('{"items":[{"name":"rice","confidencePct":88}],"likelyKcal":300}');
  assert.equal(stated.value?.items[0]?.confidencePct, 88);
});

test('items with no stated certainty do not inflate meal intelligence', async () => {
  const { analyse } = await import('../src/foodlens/foodlens.logic.ts');
  const facts = {
    age: 40,
    likelyKcal: 500,
    source: 'ai_visual_estimate' as const,
    portionCertainty: 0.4,
    preparationCertainty: 0.4,
  };
  const silent = analyse({ ...facts, items: [{ name: 'stew', confidencePct: null }] }) as Record<string, unknown>;
  const confident = analyse({ ...facts, items: [{ name: 'stew', confidencePct: 95 }] }) as Record<string, unknown>;

  const scoreOf = (r: Record<string, unknown>) => (r.intelligence as { score: number }).score;
  assert.ok(scoreOf(confident) > scoreOf(silent), 'stated confidence must beat silence');

  const capture = silent.capture as { checks: { check: string; passed: boolean }[] };
  const named = capture.checks.find((c) => c.check === 'Named with confidence');
  assert.equal(named?.passed, false, 'silence is not agreement');
});

test('a plant is counted by its own name, once, however the dish is described', async () => {
  const { plantsFrom } = await import('../src/foodlens/foodlens.logic.ts');
  const plants = plantsFrom([
    { name: 'Fried ripe plantain (dodo), deep-fried slices', confidencePct: 50 },
    { name: 'Absorbed frying oil (likely vegetable or palm oil)', confidencePct: 50 },
    { name: 'Black beans with rice', confidencePct: 80 },
  ]);
  assert.deepEqual(plants.distinct, ['black bean', 'plantain', 'rice']);
  // "bean" must not appear alongside "black bean", and oil is not a plant.
  assert.equal(plants.distinct.includes('bean'), false);
});
