import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import {
  CONDITIONS,
  CONDITION_IDS,
  NOT_MEDICAL_ADVICE,
  effectsOf,
  isConditionId,
} from '@jessmove/shared';
import { MAX_CONDITIONS, cleanConditions } from '../src/health/conditions.logic.ts';
import {
  conditionFindings,
  effectsFor,
  bmiPathFor,
  gapPlanFor,
  insightFor,
  risksFor,
  suppressionsFor,
  type InsightInput,
} from '../src/health/risk.logic.ts';

/**
 * The case this whole feature exists for.
 *
 * Somebody with exocrine pancreatic insufficiency opens a page that reads
 * their shopping and tells them their fat is high. Their clinical team
 * told them the opposite — enzyme replacement is what makes fat
 * digestible, and the old low-fat advice is what causes the weight loss
 * and the vitamin deficiency. Then the same page congratulates them on the
 * weight that has been falling, which is the symptom.
 *
 * Every test below is a version of that: a general reading that is not
 * merely unhelpful for this person but actively the wrong way round.
 */

const adult = (over: Partial<InsightInput> = {}): InsightInput => ({ age: 41, ...over });

const foodOf = (perDay: Record<string, number>, daysCovered = 7) => ({
  daysRecorded: 4,
  daysCovered,
  perDay,
  topSalt: 'Bacon',
  topSaturates: 'Cheddar',
  topSugars: 'Cola',
  topEnergy: [{ name: 'Cola', amount: 1400 }],
  topSugarItems: [{ name: 'Cola', amount: 350 }],
});

/* ── the catalogue itself ─────────────────────────────────────────── */

test('every condition carries the parts that make it usable, and the clinician', () => {
  for (const id of CONDITION_IDS) {
    const card = CONDITIONS[id];
    assert.equal(card.id, id, 'the key and the id agree');
    assert.ok(card.label.length > 2, `${id} has a label`);
    assert.ok(card.inShort.length > 40, `${id} is explained in plain English`);
    assert.ok(card.helps.length > 0, `${id} says what helps`);
    assert.ok(card.clinicianOnly.length > 0, `${id} ends with the clinician`);
  }
});

test('nothing in the catalogue tells anybody what to do about a medicine', () => {
  // Rule two. Doses, timings and "you might need more" all belong to the
  // prescriber, and a card that drifts into them is the one that does harm.
  const forbidden =
    /\b(take|start|stop|increase|decrease|double|halve|adjust|reduce|raise)\b[^.]{0,40}\b(dose|mg|tablet|units?|insulin|statin|metformin|omeprazole|diuretic)\b/i;
  for (const id of CONDITION_IDS) {
    const card = CONDITIONS[id];
    for (const line of [...card.helps, ...card.careful, ...card.watches]) {
      assert.ok(!forbidden.test(line), `${id} advises on medication: "${line}"`);
    }
  }
});

test('an unknown identifier is not a condition', () => {
  assert.equal(isConditionId('pancreatic_insufficiency'), true);
  assert.equal(isConditionId('lupus'), false);
  assert.equal(isConditionId('__proto__'), false);
  assert.deepEqual(effectsOf(['not_a_condition' as never]), {});
});

/* ── pancreatic insufficiency: the fat, and the falling weight ─────── */

test('the fat warning does not appear for somebody whose guidance is not to restrict it', () => {
  const heavy = foodOf({ saturatesG: 48, saltG: 2, sugarsG: 20, energyKcal: 2400 });

  const general = risksFor(adult({ food: heavy }));
  assert.ok(
    general.some((r) => r.factor === 'Saturated fat'),
    'the general reading does flag it',
  );

  const epi = risksFor(adult({ food: heavy, conditions: ['pancreatic_insufficiency'] }));
  assert.ok(
    !epi.some((r) => r.factor === 'Saturated fat'),
    'and it is gone once the platform knows why that advice is out of date',
  );
});

test('the fat card is not dropped silently — the page says why it is missing', () => {
  const said = suppressionsFor(adult({ conditions: ['pancreatic_insufficiency'] }));
  const fat = said.find((line) => /fat is not flagged/i.test(line));
  assert.ok(fat, `no explanation given: ${JSON.stringify(said)}`);
  assert.match(fat, /enzyme replacement/i, 'and names the reason the old advice is wrong');
  assert.match(fat, /Exocrine pancreatic insufficiency/, 'and which condition did it');
});

test('a falling weight becomes the warning rather than the achievement', () => {
  const losing = { kgPerWeek: -0.6, direction: 'down' as const };

  const general = risksFor(adult({ trend: losing }));
  assert.equal(general.length, 0, 'under a kilo a week is nothing to say to most people');

  const epi = risksFor(adult({ trend: losing, conditions: ['pancreatic_insufficiency'] }));
  const found = epi.find((r) => r.factor === 'Weight going down');
  assert.ok(found, `no warning raised: ${JSON.stringify(epi)}`);
  assert.equal(found.level, 'high');
  assert.match(found.action, /Tell the team treating you/i);
});

test('a member with EPI who is also overweight is not handed a reduction plan', () => {
  const over = { heightCm: 170, weightKg: 95 };

  const general = gapPlanFor(adult(over));
  assert.equal(general.planned, true, 'the general plan does run');

  const epi = gapPlanFor(adult({ ...over, conditions: ['pancreatic_insufficiency'] }));
  assert.equal(epi.planned, false);
  assert.match(epi.why ?? '', /report rather than something to aim at/i);
  assert.equal(epi.dailyDeficitKcal, 0, 'and no deficit is stated anywhere in it');
  assert.equal(epi.levers.length, 0);
});

test('the BMI is still shown, but never as a target to lose towards', () => {
  const path = bmiPathFor(
    adult({ heightCm: 170, weightKg: 95, conditions: ['pancreatic_insufficiency'] }),
  );
  assert.equal(path.bmi, 32.9, 'the number somebody gave us is still their number');
  assert.equal(path.gapKg, null, 'but there is no gap to close');
  assert.equal(path.weeksAtSafeRate, null);
  assert.equal(path.safeRateKgPerWeek, null, 'and no rate to lose it at');
  assert.match(path.says, /does not turn that into a target/i);
  assert.match(path.says, /report to your team/i);
  // No kilograms to shed and no timescale to shed them over: the two
  // things that turn a number into an instruction.
  assert.ok(!/\d+(\.\d+)?kg/.test(path.says), path.says);
  assert.ok(!/week/i.test(path.says.replace(/weight/gi, '')), path.says);
  for (const step of path.steps) {
    assert.ok(!/\d+(\.\d+)?kg a week/i.test(step), `a rate crept into a step: "${step}"`);
  }
});

test('the weight risk card goes with it — no "several cancers" at somebody losing weight', () => {
  const over = adult({ heightCm: 170, weightKg: 95 });
  assert.ok(risksFor(over).some((r) => r.factor === 'Weight'));
  assert.ok(
    !risksFor({ ...over, conditions: ['pancreatic_insufficiency'] }).some(
      (r) => r.factor === 'Weight',
    ),
  );
});

/* ── kidneys: the salt substitute that is the dangerous swap ───────── */

test('a salt substitute is never suggested to somebody with kidney disease', () => {
  const salty = foodOf({ saltG: 9 });
  const ckd = risksFor(adult({ food: salty, conditions: ['chronic_kidney_disease'] }));
  const salt = ckd.find((r) => r.factor === 'Salt');
  assert.ok(salt);
  assert.match(salt.action, /Not a low-sodium salt substitute/i);
  assert.match(salt.action, /potassium chloride/i);
});

test('salt is read against a tighter line where the condition demands one', () => {
  // 5.5g is under the general 6g guideline and over the tightened one.
  const modest = foodOf({ saltG: 5.5 });
  assert.ok(!risksFor(adult({ food: modest })).some((r) => r.factor === 'Salt'));

  const raised = risksFor(adult({ food: modest, conditions: ['hypertension'] }));
  const salt = raised.find((r) => r.factor === 'Salt');
  assert.ok(salt, 'high blood pressure moves the line down to it');
  assert.match(salt.evidence, /general guideline is 6g/i, 'and the page says both figures');
});

test('nothing pushes protein at somebody whose target comes from their bloods', () => {
  const said = suppressionsFor(adult({ conditions: ['chronic_kidney_disease'] }));
  assert.ok(said.some((line) => /push protein/i.test(line)));
  assert.ok(said.some((line) => /renal dietitian/i.test(line)));
});

/* ── diabetes: the plan that changes a dose ────────────────────────── */

test('a deliberate deficit is held back where it would change an insulin dose', () => {
  const plan = gapPlanFor(
    adult({ heightCm: 170, weightKg: 95, conditions: ['type_1_diabetes'] }),
  );
  assert.equal(plan.planned, false);
  assert.match(plan.why ?? '', /clinician/i);
  assert.match(plan.why ?? '', /turned on afterwards/i, 'and it is withheld, not abolished');
});

test('holding the plan back is not the same silence as refusing it', () => {
  const held = gapPlanFor(adult({ heightCm: 170, weightKg: 95, conditions: ['type_2_diabetes'] }));
  const refused = gapPlanFor(adult({ heightCm: 170, weightKg: 95, conditions: ['ibd'] }));
  assert.notEqual(held.why, refused.why);
  assert.match(refused.why ?? '', /no reduction plan here/i);
});

/* ── the findings, read against this person's own figures ──────────── */

test('a condition card names what was actually seen in the ledger', () => {
  const [found] = conditionFindings(
    adult({ food: foodOf({ sugarsG: 120 }), conditions: ['type_2_diabetes'] }),
  );
  assert.ok(found);
  assert.equal(found.label, 'Type 2 diabetes');
  assert.ok(found.noticed.some((line) => /120g of sugars/i.test(line)), JSON.stringify(found.noticed));
  assert.ok(found.noticed.some((line) => /Cola/.test(line)), 'and names the item carrying it');
});

test('with nothing recorded a card invents no concern', () => {
  const [found] = conditionFindings(adult({ conditions: ['type_2_diabetes'] }));
  assert.ok(found);
  assert.deepEqual(found.noticed, [], 'the guidance is shown; nothing is claimed about them');
  assert.ok(found.helps.length > 0);
});

test('an intake that looks low is read as the risk it is, not as good news', () => {
  const [found] = conditionFindings(
    adult({ food: foodOf({ energyKcal: 900 }), conditions: ['pancreatic_insufficiency'] }),
  );
  assert.ok(found.noticed.some((line) => /too little is the risk here/i.test(line)));
});

/* ── the boundaries ────────────────────────────────────────────────── */

test('under 18 a declared condition unlocks nothing at all', () => {
  const child = insightFor({
    age: 15,
    heightCm: 165,
    weightKg: 80,
    conditions: ['type_1_diabetes', 'coeliac'],
  });
  assert.equal(child.available, false);
  assert.deepEqual(child.conditions, []);
  assert.deepEqual(child.suppressed, []);
  assert.equal(child.notMedicalAdvice, undefined);
  assert.deepEqual(child.risks, []);
});

test('the not-medical-advice sentence appears whenever a condition is in play', () => {
  const without = insightFor(adult({ heightCm: 170, weightKg: 95 }));
  assert.equal(without.notMedicalAdvice, undefined, 'and not otherwise, so it keeps its weight');

  const with_ = insightFor(adult({ heightCm: 170, weightKg: 95, conditions: ['coeliac'] }));
  assert.equal(with_.notMedicalAdvice, NOT_MEDICAL_ADVICE, 'verbatim, never paraphrased');
  assert.match(with_.notMedicalAdvice ?? '', /does not diagnose/i);
  assert.match(with_.notMedicalAdvice ?? '', /never changes a prescription/i);
});

test('the limits stop claiming to ignore a condition once one has been given', () => {
  const without = insightFor(adult({ heightCm: 170, weightKg: 95 }));
  assert.ok(without.limits.some((l) => /Nothing here accounts for medication/.test(l)));

  const with_ = insightFor(adult({ heightCm: 170, weightKg: 95, conditions: ['coeliac'] }));
  assert.ok(!with_.limits.some((l) => /Nothing here accounts for medication/.test(l)));
  assert.ok(with_.limits.some((l) => /taken into account above/.test(l)));
  assert.ok(
    with_.limits.some((l) => /medication.*not|not.*medication/i.test(l)),
    'and still says what it does not hold',
  );
});

test('what was declared is listed as a source, because it changed the reading', () => {
  const insight = insightFor(adult({ heightCm: 170, weightKg: 95, conditions: ['coeliac'] }));
  assert.ok(insight.builtFrom.some((s) => /because you told us/.test(s)));
});

test('two conditions combine rather than the last one winning', () => {
  const both = effectsFor(adult({ conditions: ['chronic_kidney_disease', 'pancreatic_insufficiency'] }));
  assert.equal(both.noSaltSubstitute, true);
  assert.equal(both.doNotFlagFat, true);
  assert.equal(both.weightLossIsAWarning, true);
});

test('an identifier the catalogue does not know is ignored, not trusted', () => {
  const input = adult({ conditions: ['made_up_condition' as never, 'coeliac'] });
  assert.deepEqual(
    conditionFindings(input).map((c) => c.id),
    ['coeliac'],
  );
});

/* ── the storage, which is the part that is special-category data ──── */

test('only catalogue identifiers reach the database, in a stable order', () => {
  assert.deepEqual(cleanConditions(['coeliac', 'nonsense', 'coeliac']), ['coeliac']);
  assert.deepEqual(
    cleanConditions(['gout', 'coeliac']),
    ['coeliac', 'gout'],
    'catalogue order, so the same set is always the same row',
  );
  // A field that only ever holds an identifier cannot be used to smuggle
  // a sentence about somebody's diagnosis into the row.
  assert.deepEqual(cleanConditions(['constructor', '__proto__', 'toString']), []);
  assert.deepEqual(cleanConditions(['I have stage 3 CKD and take ramipril']), []);
});

test('the table holds identifiers and nothing a medical record would hold', () => {
  const sql = readFileSync(
    new URL('../../../db/migrations/0015_member_conditions.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS member_conditions/);
  assert.match(sql, /ON DELETE CASCADE/, 'deleting the account takes it');
  // Comments explain what is deliberately absent; the columns are what
  // actually gets stored, so those are what this reads.
  const columns = sql.replace(/--[^\n]*/g, '');
  for (const column of ['severity', 'diagnosed', 'medication', 'notes', 'test_result', 'free_text']) {
    assert.ok(
      !new RegExp(`\\b${column}\\b`).test(columns),
      `${column} has no business being stored`,
    );
  }
});

test('the food ledger no longer outlives the account it belonged to', () => {
  const sql = readFileSync(
    new URL('../../../db/migrations/0015_member_conditions.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /ALTER TABLE food_log[\s\S]*ON DELETE CASCADE/);
  assert.match(sql, /DELETE FROM food_log[\s\S]*NOT IN \(SELECT user_id FROM app_users\)/,
    'and orphans are cleared first, so the migration cannot take the deployment down');
});

/* ── the doors ─────────────────────────────────────────────────────── */

test('ten can be declared, and the eleventh does not quietly become the first', () => {
  assert.equal(MAX_CONDITIONS, 10);
  const all = cleanConditions(CONDITION_IDS);
  assert.equal(all.length, 10, 'the whole catalogue is capped at ten');
  // Catalogue order, so which ten survive is deterministic rather than
  // whichever ten the client happened to send last.
  assert.deepEqual(all, CONDITION_IDS.slice(0, 10));
  assert.ok(CONDITION_IDS.length > 10, 'and there is genuinely more than ten to choose from');
});

test('ten conditions are all read, not just the first few', () => {
  const ten = CONDITION_IDS.slice(0, 10);
  const found = conditionFindings(adult({ conditions: ten }));
  assert.equal(found.length, 10);
  assert.deepEqual(
    found.map((c) => c.id),
    ten,
  );
});

test('the door refuses more than ten rather than truncating in silence', () => {
  const source = readFileSync(
    new URL('../src/health/health-insight.controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /@ArrayMaxSize\(MAX_CONDITIONS\)/);
});

/* ── the privacy of this one section ───────────────────────────────── */

test('nothing clinical can reach the ordinary draft autosave', async () => {
  // Conditions save to their own endpoint precisely because this refuses
  // them, and it must go on refusing them.
  const { checkDocument, isAllowedKey } = await import('../src/state/state.logic.ts');
  assert.equal(isAllowedKey('clinical'), false);
  assert.equal(isAllowedKey('diagnosis'), false);
  assert.equal(checkDocument('bodyCommand', { diagnosis: true }).ok, false);
});

test('the picker saves itself, and never before the load has landed', () => {
  const source = readFileSync(
    new URL('../../frontend/app/account/conditions.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(!/Save and read the page/.test(source), 'no save button to forget');
  assert.match(source, /setTimeout\(\(\) => void push\.current\(/, 'it debounces like every other draft');
  assert.match(source, /if \(!restored\.current\) return;/, 'and cannot save over what it has not loaded yet');
  assert.match(source, /saveState === 'error'/, 'a failed save is said out loud');
});

test('a tick is one save, not a loop', () => {
  // The picker asks the section above it to re-read after every save. A
  // parent passing an inline arrow hands the picker a new callback each
  // render, and with that callback in the effect's dependencies the save
  // re-fires, re-renders the parent, and saves again — for as long as the
  // page is open. Two things stop it, and both must stay.
  const picker = readFileSync(
    new URL('../../frontend/app/account/conditions.tsx', import.meta.url),
    'utf8',
  );
  assert.match(picker, /\}, \[signature\]\);/, 'only a changed list may trigger a save');
  assert.match(picker, /if \(stored\.current === signature\) return;/, 'and re-sending the same list is a no-op');

  const parent = readFileSync(
    new URL('../../frontend/app/account/insight.tsx', import.meta.url),
    'utf8',
  );
  assert.match(parent, /const reread = useCallback\(/, 'the parent hands over a stable callback');
  assert.match(parent, /<ConditionsPicker onChange=\{reread\} \/>/);
  assert.ok(!/onChange=\{\(\) =>/.test(parent), 'never an inline arrow');
});

test('re-reading the section never empties the screen somebody is using', () => {
  const parent = readFileSync(
    new URL('../../frontend/app/account/insight.tsx', import.meta.url),
    'utf8',
  );
  // Dropping back to "loading" on a refresh unmounted the picker
  // mid-tick, collapsed the section and lost the scroll position.
  assert.match(parent, /setState\(\(was\) => \(was === 'ready' \? 'ready' : 'loading'\)\)/);
  assert.match(parent, /setState\(\(was\) => \(was === 'ready' \? 'ready' : 'error'\)\)/);
});

test('a member is told where this goes before they tick anything', () => {
  const source = readFileSync(
    new URL('../src/health/health-insight.controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /const PRIVACY = \[/);
  for (const claim of [/household or organisation report/i, /insurer/i, /Nothing is inferred/i]) {
    assert.match(source, claim);
  }
  const ui = readFileSync(
    new URL('../../frontend/app/account/conditions.tsx', import.meta.url),
    'utf8',
  );
  assert.match(ui, /Who sees this/, 'and it is on the screen, not only in a policy page');
});

test('no group or organisation reporting reads the conditions table', () => {
  // The strongest form of "it is not in a household report" is that no
  // code outside this one service can name the table at all.
  const roots = ['groups', 'activity', 'state', 'ai', 'mova', 'foodlens', 'admin'];
  for (const root of roots) {
    let files: string[] = [];
    try {
      files = readdirSync(new URL(`../src/${root}/`, import.meta.url)).filter((f) =>
        f.endsWith('.ts'),
      );
    } catch {
      continue;
    }
    for (const file of files) {
      const source = readFileSync(new URL(`../src/${root}/${file}`, import.meta.url), 'utf8');
      assert.ok(
        !/member_conditions/.test(source),
        `${root}/${file} reaches the conditions table`,
      );
    }
  }
});

test('conditions are read and written from the session, never from a parameter', () => {
  const source = readFileSync(
    new URL('../src/health/health-insight.controller.ts', import.meta.url),
    'utf8',
  );
  assert.ok(!/conditions\/:/.test(source), 'no route takes somebody else’s user id');
  assert.match(source, /this\.conditions\.forUser\(this\.session\(req\)\.uid\)/);
  assert.match(source, /this\.conditions\.clear\(this\.session\(req\)\.uid\)/);
  assert.match(source, /me\.age < 18/, 'and a child cannot declare one at all');
});
