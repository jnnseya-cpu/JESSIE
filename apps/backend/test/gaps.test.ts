import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ASSURANCE_CONTROLS,
  CHECK_IDS,
  CONDITIONS,
  CONDITION_IDS,
  CONCERN_THRESHOLDS,
  FUNCTIONAL_CHECKS,
  MEDICATION_CONTEXTS,
  MEDICATION_NOT_ADVICE,
  NOT_A_RISK_SCORE,
  RECHECK_WEEKS,
  assuranceByArea,
  assuranceGaps,
  isMedicationContext,
  progressBetween,
  startingPoint,
} from '@jessmove/shared';
import {
  conditionFindings,
  effectsFor,
  gapPlanFor,
  insightFor,
  risksFor,
  suppressionsFor,
  type InsightInput,
} from '../src/health/risk.logic.ts';

/**
 * The gaps the market analysis found, closed.
 *
 * Three of the four are the same shape: the platform already had the hard
 * part and was missing the thing that makes it reach anybody. The fourth —
 * appetite-suppressing medication — is the one where the platform's own
 * instincts were wrong for the person in front of it, and getting that
 * right is what most of this file is about.
 */

const adult = (over: Partial<InsightInput> = {}): InsightInput => ({ age: 41, ...over });

const foodOf = (perDay: Record<string, number>, daysCovered = 7) => ({
  daysRecorded: 5,
  daysCovered,
  perDay,
  topSalt: 'Bacon',
  topSaturates: 'Cheddar',
  topSugars: 'Cola',
  topEnergy: [{ name: 'Cola', amount: 400 }],
  topSugarItems: [{ name: 'Cola', amount: 90 }],
});

/* ── the medication context ────────────────────────────────────────── */

test('a medication is in the catalogue but is not called a condition', () => {
  assert.ok(CONDITION_IDS.includes('appetite_suppressing_medication'));
  assert.deepEqual(MEDICATION_CONTEXTS, ['appetite_suppressing_medication']);
  assert.equal(isMedicationContext('appetite_suppressing_medication'), true);
  assert.equal(isMedicationContext('coeliac'), false);
  assert.equal(CONDITIONS.appetite_suppressing_medication.group, 'medication');
});

test('the card says nothing whatever about the medication itself', () => {
  /*
   * The competitive difference and the safety line in one. Every dedicated
   * tracker in this category treats dose, timing, injection site and
   * escalation as first-class features. All four are a prescriber's, and
   * a card that drifts into them turns dietary guidance into something
   * that needs a licence.
   */
  const card = CONDITIONS.appetite_suppressing_medication;
  const forbidden =
    /\b(inject|injection site|your dose|increase the dose|titrat|skip a dose|missed dose|\d+\s?mg)\b/i;
  for (const line of [...card.helps, ...card.careful, ...card.watches, card.inShort]) {
    assert.ok(!forbidden.test(line), `the card advises on the medication: "${line}"`);
  }
  // And it hands all of it over explicitly.
  assert.ok(
    card.clinicianOnly.some((l) => /dose, the timing, the escalation/i.test(l)),
    JSON.stringify(card.clinicianOnly),
  );
});

test('it never congratulates a falling weight', () => {
  const card = CONDITIONS.appetite_suppressing_command ?? CONDITIONS.appetite_suppressing_medication;
  const text = [...card.helps, ...card.watches, card.inShort].join(' ');
  assert.ok(!/well done|great|congratul|on track|keep it up/i.test(text), text.slice(0, 120));
  // The number going down needs no encouragement; what needs saying is
  // what to protect while it does.
  assert.ok(/muscle/i.test(text), 'muscle is the thing this card exists to protect');
});

test('the reading inverts: too little is the risk, not too much', () => {
  const barely = foodOf({ energyKcal: 850, saltG: 2, sugarsG: 10 });

  const general = risksFor(adult({ food: barely }));
  assert.ok(
    !general.some((r) => r.factor === 'How little is going in'),
    'a general adult is not warned about a low figure from an incomplete ledger',
  );

  const onMed = risksFor(
    adult({ food: barely, conditions: ['appetite_suppressing_medication'] }),
  );
  const found = onMed.find((r) => r.factor === 'How little is going in');
  assert.ok(found, JSON.stringify(onMed.map((r) => r.factor)));
  assert.equal(found.level, 'high');
  assert.match(found.action, /protein first/i);
});

test('losing it too fast is raised, and the lever is resistance work', () => {
  const fast = risksFor(
    adult({
      weightKg: 95,
      trend: { kgPerWeek: -1.4, direction: 'down' },
      conditions: ['appetite_suppressing_medication'],
    }),
  );
  const found = fast.find((r) => r.factor === 'How fast it is coming down');
  assert.ok(found, JSON.stringify(fast.map((r) => r.factor)));
  assert.match(found.action, /resistance work/i);
  assert.match(found.action, /prescriber/i, 'and the rate itself is not ours to change');

  // Under a percent of body weight a week is not flagged.
  const steady = risksFor(
    adult({
      weightKg: 95,
      trend: { kgPerWeek: -0.7, direction: 'down' },
      conditions: ['appetite_suppressing_medication'],
    }),
  );
  assert.ok(!steady.some((r) => r.factor === 'How fast it is coming down'));

  /*
   * And the general card does not run alongside it. This fired in the
   * first live run: "How fast it is coming down" and "Rate of loss" both
   * appeared, one saying protect your muscle and take the rate to your
   * prescriber, the other saying eat a little more. Two answers to one
   * question on one screen is precisely what this design exists to stop.
   */
  assert.ok(
    !fast.some((r) => r.factor === 'Rate of loss'),
    `the general card duplicated the specific one: ${JSON.stringify(fast.map((r) => r.factor))}`,
  );
  // It still runs for somebody with no medication declared.
  const general = risksFor(adult({ weightKg: 95, trend: { kgPerWeek: -1.4, direction: 'down' } }));
  assert.ok(general.some((r) => r.factor === 'Rate of loss'));
});

test('no movement recorded is a muscle warning, not a nagging one', () => {
  const still = risksFor(
    adult({
      activity: { daysMoved: 1, windowDays: 14 },
      conditions: ['appetite_suppressing_medication'],
    }),
  );
  const found = still.find((r) => r.factor === 'Muscle, while this is happening');
  assert.ok(found, JSON.stringify(still.map((r) => r.factor)));
  assert.match(found.action, /two sessions a week/i);
});

test('a reduction plan is still not run on top of a suppressed appetite', () => {
  const plan = gapPlanFor(
    adult({
      heightCm: 170,
      weightKg: 95,
      conditions: ['appetite_suppressing_medication'],
    }),
  );
  assert.equal(plan.planned, false, 'planning a deficit on top of the medication is not ours to do');
  assert.match(plan.why ?? '', /clinician/i);
});

test('the genuine clinical conflict is stated rather than resolved silently', () => {
  // Appetite-suppressing medication says protein matters more. Reduced
  // kidney function says do not push it. Both are true.
  const both = effectsFor(
    adult({ conditions: ['appetite_suppressing_medication', 'chronic_kidney_disease'] }),
  );
  assert.equal(both.proteinMattersMore, true);
  assert.equal(both.doNotPushProtein, true);

  const said = suppressionsFor(
    adult({ conditions: ['appetite_suppressing_medication', 'chronic_kidney_disease'] }),
  );
  const conflict = said.find((line) => /disagree/i.test(line));
  assert.ok(conflict, JSON.stringify(said));
  assert.match(conflict, /taken the cautious side/i, 'the safe answer wins');
  assert.match(conflict, /renal dietitian/i, 'and the person who settles it is named');
});

test('the medication carries its own not-advice sentence', () => {
  const insight = insightFor(
    adult({ heightCm: 170, weightKg: 95, conditions: ['appetite_suppressing_medication'] }),
  );
  assert.equal(insight.medicationNote, MEDICATION_NOT_ADVICE);
  assert.match(MEDICATION_NOT_ADVICE, /says nothing about your medication/i);
  assert.match(MEDICATION_NOT_ADVICE, /prescriber/i);

  // A diagnosis alone does not produce it.
  const other = insightFor(adult({ heightCm: 170, weightKg: 95, conditions: ['coeliac'] }));
  assert.equal(other.medicationNote, undefined);
});

test('under 18 the medication context does not exist either', () => {
  const child = insightFor({
    age: 15,
    heightCm: 165,
    weightKg: 80,
    conditions: ['appetite_suppressing_medication'],
  });
  assert.equal(child.available, false);
  assert.deepEqual(child.conditions, []);
  assert.equal(child.medicationNote, undefined);
});

test('what it noticed is read from the ledger, not asserted', () => {
  const [found] = conditionFindings(
    adult({
      food: foodOf({ energyKcal: 780 }),
      trend: { kgPerWeek: -1.1, direction: 'down' },
      conditions: ['appetite_suppressing_medication'],
    }),
  );
  assert.ok(found);
  assert.ok(found.noticed.some((n) => /780 kcal/.test(n)), JSON.stringify(found.noticed));
  assert.ok(found.noticed.some((n) => /muscle/i.test(n)));
});

/* ── strength and balance ──────────────────────────────────────────── */

test('every check is described safely enough to do alone', () => {
  assert.equal(CHECK_IDS.length, 3);
  for (const id of CHECK_IDS) {
    const check = FUNCTIONAL_CHECKS[id];
    assert.ok(check.how.length >= 3, `${id} is not explained`);
    assert.ok(check.safety.length >= 2, `${id} has no safety instructions`);
  }
  // The one that matters: something to hold on to, every time.
  assert.match(
    FUNCTIONAL_CHECKS.balance_stages.safety.join(' '),
    /within arm’s reach/i,
  );
});

test('nothing recorded starts from a chair rather than assuming capability', () => {
  const start = startingPoint({});
  assert.equal(start.level, 'seated');
  assert.match(start.says, /starting too high costs more/i);
});

test('the lowest signal decides the level, never the average', () => {
  // Strong legs, poor balance. Averaging would put somebody into standing
  // work their balance cannot hold.
  const mixed = startingPoint({ chairStandReps: 18, balanceSeconds: 8 });
  assert.equal(mixed.level, 'seated');

  const good = startingPoint({ chairStandReps: 18, balanceSeconds: 34, upAndGoSeconds: 8 });
  assert.equal(good.level, 'challenging');
});

test('a fall in the last year sends somebody to a person, not to a programme', () => {
  const start = startingPoint({ chairStandReps: 18, balanceSeconds: 34, fallenInLastYear: true });
  assert.equal(start.referFirst, true, 'even with good checks');
  assert.ok(start.seeSomeone.some((s) => /falls assessment/i.test(s)), JSON.stringify(start.seeSomeone));
  assert.ok(start.seeSomeone.some((s) => /strongest single predictor/i.test(s)));
});

test('being afraid of falling is treated as the predictor it is', () => {
  const start = startingPoint({ chairStandReps: 18, afraidOfFalling: true });
  assert.ok(start.seeSomeone.some((s) => /afraid of falling/i.test(s)));
  assert.ok(start.seeSomeone.some((s) => /not fussing/i.test(s)));
});

test('a result below the published cut-point is named without alarming', () => {
  const start = startingPoint({ chairStandReps: 7, upAndGoSeconds: 16 });
  assert.ok(start.seeSomeone.some((s) => /below the figure falls services use/i.test(s)));
  assert.ok(start.seeSomeone.some((s) => /not a reason to stop moving/i.test(s)));
  assert.equal(CONCERN_THRESHOLDS.chairStandReps, 12);
});

test('there is no risk score anywhere, and the refusal is explained', () => {
  /*
   * The one output on this feature that could contribute to a fall is a
   * reassuring number. A real assessment includes medication, blood
   * pressure lying and standing, vision, feet and the home; four of those
   * five are invisible here.
   */
  const start = startingPoint({ chairStandReps: 20, balanceSeconds: 40, upAndGoSeconds: 6 });
  assert.ok(!('risk' in start), 'a risk field exists');
  assert.ok(!('score' in start), 'a score field exists');
  assert.equal(start.notARiskScore, NOT_A_RISK_SCORE);
  assert.match(NOT_A_RISK_SCORE, /not an assessment of your risk/i);
  assert.match(NOT_A_RISK_SCORE, /A good result here does not mean you are safe/i);

  const source = readFileSync(new URL('../src/health/falls.controller.ts', import.meta.url), 'utf8');
  assert.match(source, /produce a falls risk score/i, 'the refusal must be published, not only honoured');
  assert.match(source, /a reassuring one is the output most likely to cause a fall/i);
});

test('holding steady is reported as the result it is', () => {
  const same = { chairStandReps: 13, balanceSeconds: 25 };
  const progress = progressBetween(same, same, RECHECK_WEEKS);
  assert.equal(progress.moved, 'held');
  assert.match(progress.says, /holding steady is a result/i);
  assert.match(progress.says, /untrained direction is downwards/i);
});

test('going backwards is not framed as a failure', () => {
  const progress = progressBetween(
    { chairStandReps: 16, balanceSeconds: 34 },
    { chairStandReps: 9, balanceSeconds: 12 },
    RECHECK_WEEKS,
  );
  assert.equal(progress.moved, 'down');
  assert.match(progress.says, /after an illness, a hospital stay or a change of medication/i);
  assert.match(progress.says, /not a setback/i);
});

test('the re-check is quarterly, for a stated reason', () => {
  assert.equal(RECHECK_WEEKS, 12);
  const source = readFileSync(new URL('../src/health/falls.controller.ts', import.meta.url), 'utf8');
  assert.match(source, /mostly measuring how you slept/i);
});

test('the falls programme refuses anyone under 18', () => {
  const source = readFileSync(new URL('../src/health/falls.controller.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(me\.age < 18\)/);
  assert.match(source, /measures against a clinical threshold/i);
});

/* ── the assurance summary ─────────────────────────────────────────── */

test('every assurance control carries evidence, not just a claim', () => {
  assert.ok(ASSURANCE_CONTROLS.length >= 20, `${ASSURANCE_CONTROLS.length} controls`);
  for (const control of ASSURANCE_CONTROLS) {
    assert.ok(control.claim.length > 30, `a claim is too thin: ${control.claim}`);
    assert.ok(control.evidence.length > 40, `no evidence for: ${control.claim}`);
    assert.ok(['enforced', 'implemented', 'gap'].includes(control.status));
  }
});

test('the gaps are real gaps, named rather than hidden', () => {
  const gaps = assuranceGaps();
  assert.ok(gaps.length >= 3, 'a document with no gaps is a document nobody believes');
  // The four that a buyer would find out about anyway.
  const text = gaps.map((g) => `${g.claim} ${g.evidence}`).join(' ');
  assert.match(text, /DCB0129|clinical safety officer/i, 'the NHS blocker must be admitted');
  assert.match(text, /self-declared/i, 'age assurance must be admitted');
  assert.match(text, /WCAG/i, 'the absent accessibility audit must be admitted');
  for (const gap of gaps) {
    assert.match(
      gap.evidence,
      /not done|honest gap|there is no/i,
      `a gap that does not say it is missing: ${gap.claim}`,
    );
  }
});

test('the areas are the five DTAC ones, plus the two we are judged on separately', () => {
  const areas = assuranceByArea().map((a) => a.area);
  for (const dtac of [
    'clinical_safety',
    'data_protection',
    'technical_assurance',
    'interoperability',
    'usability_accessibility',
  ]) {
    assert.ok(areas.includes(dtac as never), `${dtac} is missing`);
  }
  assert.ok(areas.includes('safeguarding'));
  assert.ok(areas.includes('ai_transparency'));
  for (const area of assuranceByArea()) {
    assert.ok(area.controls.length > 0, `${area.area} has no controls`);
  }
});

test('the safeguarding answer leads with the sentence a school needs', () => {
  const source = readFileSync(
    new URL('../src/health/assurance.controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /inOneSentence:/);
  assert.match(source, /absent from what the platform will produce for that account at all/);
  // And admits the weakness in the same breath.
  assert.match(source, /whatWeDoNotDo:/);
  assert.match(source, /self-declared at registration/i);
});

test('the assurance routes are open, because checking is the point', () => {
  const source = readFileSync(
    new URL('../src/health/assurance.controller.ts', import.meta.url),
    'utf8',
  );
  assert.ok(!/@AdminOnly/.test(source), 'an assurance summary behind a login assures nobody');
  // No session, no request, no member: it describes software, not people.
  // ("uid" as a bare substring matches "guidance", so this is word-bounded.)
  assert.ok(!/\bsession\b/i.test(source), 'the summary reads a session');
  assert.ok(!/@Req\(\)|\buid\b/.test(source), 'the summary reaches for a member');
});

/* ── the worked example ────────────────────────────────────────────── */

test('the public demonstration calls no model and spends nothing', () => {
  const example = readFileSync(
    new URL('../../frontend/app/foodlens/worked-example.ts', import.meta.url),
    'utf8',
  );
  assert.ok(!/fetch\(|apiBase|await /.test(example), 'the example must be stored, not fetched');
  assert.match(example, /noModelWasCalled/);
  assert.match(example, /stored, not generated/i);

  const page = readFileSync(
    new URL('../../frontend/app/foodlens/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(page, /EXAMPLE_MEAL/, 'the page renders it');
});

test('the example shows the thing the category gets wrong', () => {
  const example = readFileSync(
    new URL('../../frontend/app/foodlens/worked-example.ts', import.meta.url),
    'utf8',
  );
  // A range rather than a figure.
  assert.match(example, /minKcal/);
  assert.match(example, /maxKcal/);
  // A basis on every row.
  assert.match(example, /basis: 'label'/);
  assert.match(example, /basis: 'calculated'/);
  // And the row that makes the point: unmeasured, never zero.
  assert.match(example, /unmeasured:/);
  assert.match(example, /rather than as zero/i);
  // The independent finding, hedged as the researchers hedged it.
  assert.match(example, /250 to 345 calories/);
  assert.match(example, /Independent testing presented in 2026/);
});
