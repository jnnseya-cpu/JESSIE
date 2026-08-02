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
