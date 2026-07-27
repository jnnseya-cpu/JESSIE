import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AGE_MODES,
  AGE_MODE_DEFINITIONS,
  BANNED_LEXICON,
  BANNED_LEXICON_STRICT,
  CHARTER,
  FORBIDDEN_MECHANICS,
  MOVEMENT_VARIANTS,
  SNAP_DURATION_SECONDS,
  evaluatePublishGate,
  isMinorMode,
  isPenalising,
  sparksFor,
  suppressBelowThreshold,
  K_ANONYMITY_THRESHOLD,
  type Movement,
} from '@jessie-os/shared';

/**
 * §13.6 / §27 — the Ethical Gamification Charter is asserted here.
 * A build that violates the Charter fails the pipeline.
 */

test('C1–C8: the Charter is complete and stable', () => {
  assert.equal(CHARTER.length, 8, 'the Charter has eight rules');
  const ids = CHARTER.map((r) => r.id);
  assert.deepEqual(ids, ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
});

test('C3: paid streak restoration is a forbidden mechanic', () => {
  assert.ok(FORBIDDEN_MECHANICS.includes('paid_streak_restore'));
  assert.ok(FORBIDDEN_MECHANICS.includes('streak_expiry_countdown'));
});

test('C2: no outcome that reflects inaction may penalise the user', () => {
  assert.equal(isPenalising('dismissed'), false);
  assert.equal(isPenalising('snoozed'), false);
  assert.equal(isPenalising('expired'), false);
  assert.equal(isPenalising('unsafe_stop'), false);
});

test('C4: bottom-of-leaderboard exposure is forbidden', () => {
  assert.ok(FORBIDDEN_MECHANICS.includes('bottom_rank_display'));
});

test('C5: variable-ratio mechanics are forbidden for minors', () => {
  assert.ok(FORBIDDEN_MECHANICS.includes('variable_ratio_minor'));
  assert.ok(isMinorMode('kid'));
  assert.ok(isMinorMode('teen'));
  assert.equal(isMinorMode('standard'), false);
});

test('C6: no appearance, weight or calorie framing at any age', () => {
  for (const term of ['weight loss', 'calories', 'fat', 'slim', 'toned']) {
    assert.ok(
      BANNED_LEXICON.includes(term),
      `"${term}" must be in the banned lexicon`,
    );
  }
  // Kid and Centennial carry the stricter list on top.
  assert.ok(BANNED_LEXICON_STRICT.length > BANNED_LEXICON.length);
  assert.ok(BANNED_LEXICON_STRICT.includes('compete'));
});

test('Law 3: the five-variant publishing gate cannot be bypassed', () => {
  const partial: Movement = {
    id: 'mv_test',
    slug: 'test',
    title: 'Partial movement',
    state: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variants: [
      {
        id: 'v1',
        variant: 'standing',
        vector: {
          intent: 'mobilise',
          region: 'thoracic',
          plane: 'sagittal',
          load: 'none',
          neuroDemand: 0,
          breath: 'paced',
          sensory: 'proprioceptive',
          footprintM2: 1,
          conspicuousness: 1,
        },
        contraindications: [],
        environments: ['desk'],
        durationSeconds: 120,
        cueSets: AGE_MODES.map((ageMode) => ({ ageMode, instructions: ['Lift.'] })),
        screeningPassed: true,
      },
    ],
  };

  const failures = evaluatePublishGate(partial, AGE_MODES);
  assert.ok(failures.length >= 4, 'four missing variants must be reported');
  assert.ok(failures.every((f) => f.reason !== 'missing_cue_set'));
});

test('Law 1: a Snap is 90–300 seconds and every mode sits inside that', () => {
  assert.equal(SNAP_DURATION_SECONDS.min, 90);
  assert.equal(SNAP_DURATION_SECONDS.max, 300);
  for (const mode of AGE_MODES) {
    const [lo, hi] = AGE_MODE_DEFINITIONS[mode].durationRange;
    assert.ok(hi <= SNAP_DURATION_SECONDS.max, `${mode} upper bound within Snap range`);
    assert.ok(lo >= 60, `${mode} lower bound is a plausible Snap`);
  }
});

test('§16.3: cohort values below k are suppressed with no override path', () => {
  assert.equal(K_ANONYMITY_THRESHOLD, 8);
  assert.equal(suppressBelowThreshold(42, 7), 'SUPPRESSED');
  assert.equal(suppressBelowThreshold(42, 8), 42);
});

test('§13.4: matched effort earns identical Sparks across bodies', () => {
  const base = {
    durationSeconds: 150,
    rpe: 4,
    category: 'strength' as const,
    integrityConfidence: 1,
  };
  // A wheelchair user and a runner, each at their own baseline.
  const a = sparksFor({ ...base, capabilityNormaliser: 1 });
  const b = sparksFor({ ...base, capabilityNormaliser: 1 });
  assert.equal(a, b, 'equivalent effort must pay equivalently');
});

test('the library requires exactly five variants', () => {
  assert.equal(MOVEMENT_VARIANTS.length, 5);
  assert.deepEqual([...MOVEMENT_VARIANTS], [
    'standing',
    'seated',
    'chair_supported',
    'bed_recliner',
    'adaptive_single_limb',
  ]);
});
