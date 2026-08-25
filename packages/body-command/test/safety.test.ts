import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACU_PER_GBP,
  BC_AGENT_CODES,
  BODY_PATHWAYS,
  COST_PROTECTION_MULTIPLE,
  MAX_DAILY_ACTIONS,
  PATHWAY_DEFINITIONS,
  PROHIBITED_MECHANICS,
  SCORE_DIMENSIONS,
  SCORE_WEIGHTS,
  TWIN_STATES,
  annualMonthlyDeposit,
  assessSafety,
  bmi,
  bodyCommandScore,
  breachesProtectionRule,
  canExecute,
  interpretAdiposity,
  monthlyAcuAllocation,
  rankRecommendation,
  requiredAcus,
  supervisors,
  waistToHeight,
  type ScoreInput,
} from '../dist/index.js';

/* ─────────────── the safety invariants ─────────────── */

test('a minor is never placed on an automated weight-reduction plan', () => {
  for (const age of [10, 12, 13, 15, 17]) {
    const verdict = assessSafety({
      age,
      signals: [],
      requestedPathway: 'REDUCE', // deliberately requesting reduction
    });
    assert.equal(verdict.reductionPermitted, false, `age ${age}`);
    assert.equal(verdict.automationPermitted, false, `age ${age}`);
    assert.equal(verdict.forcedPathway, 'CHILD_GROWTH', `age ${age}`);
    assert.ok(verdict.powersExercised.includes('activate_child_safe_mode'));
  }
});

test('adult BMI categories are never applied under 18', () => {
  const reading = interpretAdiposity({ age: 14, heightCm: 160, weightKg: 60 });
  assert.equal(reading.bmi, undefined, 'no adult BMI is produced for a minor');
  assert.equal(reading.bmiUnreliable, true);
  assert.equal(reading.confidence, 0);
  assert.match(reading.reasons.join(' '), /age- and sex-adjusted centile/);
});

test('pregnancy blocks the automated weight engine entirely', () => {
  const verdict = assessSafety({
    age: 31,
    signals: ['pregnancy'],
    requestedPathway: 'REDUCE',
  });
  assert.equal(verdict.status, 'AUTOMATION_BLOCKED');
  assert.equal(verdict.reductionPermitted, false);
  assert.equal(verdict.forcedPathway, 'PROFESSIONAL_SUPPORT');
});

test('eating-disorder signals disable targets, scores and competition', () => {
  for (const signal of [
    'suspected_eating_disorder',
    'declared_eating_disorder',
    'purging_indicators',
    'excessive_compensatory_exercise',
  ] as const) {
    const verdict = assessSafety({ age: 24, signals: [signal], requestedPathway: 'REDUCE' });
    assert.equal(verdict.status, 'AUTOMATION_BLOCKED', signal);
    assert.ok(verdict.powersExercised.includes('restrict_food_scoring'), signal);
    assert.ok(verdict.powersExercised.includes('disable_competitive_features'), signal);
    assert.ok(verdict.powersExercised.includes('suspend_calorie_targets'), signal);
  }
});

test('frailty and unplanned loss force muscle preservation, not reduction', () => {
  const verdict = assessSafety({
    age: 82,
    signals: ['frailty'],
    requestedPathway: 'REDUCE',
  });
  assert.equal(verdict.reductionPermitted, false);
  assert.equal(verdict.forcedPathway, 'OLDER_ADULT_INDEPENDENCE');
  assert.ok(verdict.powersExercised.includes('activate_frailty_protection'));
});

test('the guardian can only narrow what is permitted, never widen it', () => {
  const clear = assessSafety({ age: 35, signals: [], requestedPathway: 'MAINTAIN' });
  // MAINTAIN does not permit reduction, so a clean safety pass must not grant it.
  assert.equal(clear.reductionPermitted, false);
  assert.equal(clear.status, 'CLEARED');
});

test('an extreme-change request is answered with a slower target, not a refusal', () => {
  const verdict = assessSafety({
    age: 40,
    signals: [],
    requestedPathway: 'REDUCE',
    requestsExtremeChange: true,
  });
  assert.equal(verdict.status, 'LIMITED');
  assert.match(verdict.userMessage, /protect muscle/);
});

test('exactly one agent holds supervisory authority', () => {
  const sup = supervisors();
  assert.equal(sup.length, 1);
  assert.equal(sup[0]?.code, 'GUARDIAN');
  assert.equal(sup[0]?.number, 17);
});

/* ─────────────── structural invariants ─────────────── */

test('nineteen agents, nine pathways, eight twin states', () => {
  assert.equal(BC_AGENT_CODES.length, 19);
  assert.equal(BODY_PATHWAYS.length, 9);
  assert.equal(TWIN_STATES.length, 8);
});

test('reduction is one pathway among nine, not the default', () => {
  const permitting = BODY_PATHWAYS.filter((p) => PATHWAY_DEFINITIONS[p].reductionPermitted);
  assert.ok(permitting.length < BODY_PATHWAYS.length / 2, 'most pathways do not reduce weight');
  assert.ok(!PATHWAY_DEFINITIONS.CHILD_GROWTH.reductionPermitted);
  assert.ok(!PATHWAY_DEFINITIONS.OLDER_ADULT_INDEPENDENCE.reductionPermitted);
  assert.ok(!PATHWAY_DEFINITIONS.PROFESSIONAL_SUPPORT.automationPermitted);
});

test('score weights total exactly 100 and BMI is not a dimension', () => {
  const total = SCORE_DIMENSIONS.reduce((sum, d) => sum + SCORE_WEIGHTS[d], 0);
  assert.equal(total, 100);
  assert.ok(!SCORE_DIMENSIONS.includes('bmi' as never), 'BMI is not a score dimension');
  // 90% of the score is behaviour, not body measurement.
  assert.equal(100 - SCORE_WEIGHTS.waistOrBodyRiskTrend, 90);
});

test('the score is a weighted mean and is bounded 0-100', () => {
  const all = (v: number): ScoreInput =>
    Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d, v])) as ScoreInput;
  assert.equal(bodyCommandScore(all(0)), 0);
  assert.equal(bodyCommandScore(all(100)), 100);
  assert.equal(bodyCommandScore(all(50)), 50);
  // Out-of-range inputs are clamped, not propagated.
  assert.equal(bodyCommandScore(all(999)), 100);
});

test('prohibited mechanics include the BMI leaderboard and child contests', () => {
  assert.ok(PROHIBITED_MECHANICS.includes('lowest_bmi_leaderboard'));
  assert.ok(PROHIBITED_MECHANICS.includes('child_weight_loss_contest'));
  assert.ok(PROHIBITED_MECHANICS.includes('exercise_to_erase_food_messaging'));
  assert.ok(PROHIBITED_MECHANICS.includes('shame_based_notification'));
});

test('safety is a multiplier in ranking, so it cannot be outvoted', () => {
  const unsafe = rankRecommendation({
    healthValue: 100,
    safety: 0,
    completionProbability: 1,
    friction: 1,
  });
  assert.equal(unsafe, 0, 'a maximally valuable, effortless, certain action still ranks zero');

  const safe = rankRecommendation({
    healthValue: 10,
    safety: 1,
    completionProbability: 0.5,
    friction: 2,
  });
  assert.equal(safe, 2.5);

  assert.throws(
    () => rankRecommendation({ healthValue: 1, safety: 1, completionProbability: 1, friction: 0 }),
    RangeError,
  );
});

test('the daily plan is capped at six actions', () => {
  assert.equal(MAX_DAILY_ACTIONS, 6);
});

/* ─────────────── measurement ─────────────── */

test('BMI and waist-to-height compute correctly', () => {
  assert.equal(bmi(70, 175), 22.9);
  assert.equal(waistToHeight(80, 175), 0.457);
});

test('waist-to-height is flagged applicable below BMI 35 only', () => {
  const below = interpretAdiposity({ age: 40, heightCm: 175, weightKg: 90 }); // ~29.4
  assert.equal(below.waistToHeightApplicable, true);

  const above = interpretAdiposity({ age: 40, heightCm: 175, weightKg: 115 }); // ~37.6
  assert.equal(above.waistToHeightApplicable, false);
});

test('declared muscularity marks BMI unreliable and lowers confidence', () => {
  const plain = interpretAdiposity({ age: 30, heightCm: 180, weightKg: 95, waistCm: 85 });
  const muscular = interpretAdiposity({
    age: 30,
    heightCm: 180,
    weightKg: 95,
    waistCm: 85,
    muscularityIndicated: true,
  });
  assert.equal(muscular.bmiUnreliable, true);
  assert.ok(muscular.confidence < plain.confidence);
  assert.match(muscular.reasons.join(' '), /cannot distinguish muscle from fat/);
});

/* ─────────────── ACU economics ─────────────── */

test('the cost governor never prices below 4x direct cost', () => {
  // £0.15 direct → £0.60 customer → 60 ACUs
  assert.equal(requiredAcus({ providerCostGbp: 0.08, infrastructureCostGbp: 0.05, storageCostGbp: 0.02 }), 60);
  // £0.25 direct → £1.00 → 100 ACUs
  assert.equal(requiredAcus({ providerCostGbp: 0.25 }), 100);
  // Always rounds up.
  assert.equal(requiredAcus({ providerCostGbp: 0.0001 }), 1);
});

test('contingency raises the price and never lowers it', () => {
  const base = requiredAcus({ providerCostGbp: 0.5 });
  const buffered = requiredAcus({ providerCostGbp: 0.5, contingency: 0.2 });
  assert.ok(buffered > base);
});

test('20% of the amount paid becomes ACUs', () => {
  assert.equal(monthlyAcuAllocation(49), 980);
  assert.equal(monthlyAcuAllocation(9.99), 200);
  assert.equal(monthlyAcuAllocation(19.99), 400);
  assert.equal(monthlyAcuAllocation(1200), 24_000);
});

test('annual plans allocate from the discounted amount, in twelve deposits', () => {
  // £19.99/mo less 30% annually = £167.92 paid → 3,358 ACUs → ~280/month
  assert.equal(monthlyAcuAllocation(167.92), 3358);
  assert.equal(annualMonthlyDeposit(167.92), 279);
});

test('the profitability alert fires below 4x and not at or above it', () => {
  assert.equal(breachesProtectionRule(0.6, 0.15), false); // exactly 4x
  assert.equal(breachesProtectionRule(0.59, 0.15), true);
  assert.equal(breachesProtectionRule(10, 1), false);
  assert.equal(breachesProtectionRule(3.99, 1), true);
});

test('an unpriced action breaches, because unpriced is not free', () => {
  /*
   * This assertion used to read the other way — `breachesProtectionRule(1,
   * 0)` was false, on the reasoning that a zero cost cannot fail a ratio.
   * Arithmetically that is true, and commercially it was a hole: it made
   * "I could not work out what this costs" the cheapest possible answer.
   * Any caller that failed to compute a provider cost, or got zero from a
   * provider that reported no usage, received an unmetered model call that
   * nothing anywhere recorded.
   *
   * An action that genuinely costs nothing reaches no provider, and those
   * never arrive here — the gateway returns on a zero ceiling before a
   * wallet is even loaded. Everything that does arrive has a real cost, so
   * a zero is a measurement failure and is refused as one.
   */
  assert.equal(breachesProtectionRule(1, 0), true, 'a zero cost is unpriced, not free');
  assert.equal(breachesProtectionRule(1, -5), true, 'a negative cost cannot buy margin');
  assert.equal(breachesProtectionRule(1, Number.NaN), true, 'an unknown cost is not a pass');
  assert.equal(breachesProtectionRule(0, 1), true, 'zero revenue never clears 4x');
});

test('no caller can discount an action through the cost inputs', () => {
  const base = requiredAcus({ providerCostGbp: 0.1 });
  assert.equal(base, 40);

  // Negative components used to subtract from the provider cost.
  assert.equal(requiredAcus({ providerCostGbp: 0.1, infrastructureCostGbp: -0.09 }), base);
  assert.equal(requiredAcus({ providerCostGbp: 0.1, dataCostGbp: -1 }), base);

  // A negative contingency used to discount the whole bill.
  assert.equal(requiredAcus({ providerCostGbp: 0.1, contingency: -0.9 }), base);

  // And it cannot be inflated past the documented ceiling either.
  assert.equal(
    requiredAcus({ providerCostGbp: 0.1, contingency: 5 }),
    requiredAcus({ providerCostGbp: 0.1, contingency: 0.2 }),
  );
});

test('a zero balance stops paid AI work rather than creating debt', () => {
  assert.equal(canExecute(0, 5), false);
  assert.equal(canExecute(5, 5), true);
  assert.equal(canExecute(4, 5), false);
});

test('the commercial constants are the ones the spec mandates', () => {
  assert.equal(ACU_PER_GBP, 100);
  assert.equal(COST_PROTECTION_MULTIPLE, 4);
});
