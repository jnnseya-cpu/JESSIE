import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAPABILITY_FIELDS,
  CONTRIBUTION_CEILING,
  DEGRADATION,
  DISAGREEMENT_TOLERANCE_PCT,
  LEADERBOARD_RULES,
  MOVA_STATES,
  NEVER_INGESTED,
  PRESENCE_DEFINITIONS,
  PROVIDER_DEFINITIONS,
  PROVIDERS,
  STALE_AFTER_MINUTES,
  SUPPORT_LADDER,
  TEAM_SCORE_TERMS,
  UnexplainableSuggestionError,
  calibrateDose,
  capabilitiesLostByTurningOff,
  contribution,
  disclosureFor,
  explain,
  fitsEnvironment,
  isDownwardSubstitution,
  isStale,
  isWinnableByMedianTeam,
  mayDeliver,
  reasonLine,
  resolveConflict,
  selectVariant,
  shouldWidenForDisagreement,
  suppressForRepetition,
  teamScore,
} from '@jessmove/shared';

/* ---------------- MOVA ---------------- */

test('MOVA: a suggestion without a complete reason trace cannot be shown', () => {
  assert.throws(
    () => explain({ trigger: 'Seated 94 minutes.', confidence: 0.8 }),
    UnexplainableSuggestionError,
    'missing window and fit must throw, not degrade to a vague string',
  );

  const trace = explain({
    trigger: 'Seated for 94 minutes.',
    window: '25 free minutes before 15:00.',
    fit: 'Silent, seated, needs no space.',
    ruledOut: ['Standing balance — no stable support'],
    attribution: { trigger: 'Sedentary Pattern Detector', window: 'Daily Rhythm', fit: 'Micro-Movement Coach' },
    confidence: 0.86,
  });
  assert.match(reasonLine(trace), /Seated for 94 minutes\./);
  assert.equal(trace.ruledOut.length, 1);
});

test('MOVA: turning the coach off removes no capability', () => {
  assert.deepEqual(capabilitiesLostByTurningOff(), []);
  assert.ok(PRESENCE_DEFINITIONS.off.retains.length > 0, 'off is a mode, not an absence');
  assert.ok(PRESENCE_DEFINITIONS.off.retains.includes('every chart and every reading'));
});

test('MOVA: only a safety message reaches somebody who asked for quiet', () => {
  assert.equal(mayDeliver('movement', 'quiet'), false);
  assert.equal(mayDeliver('success', 'quiet'), false);
  assert.equal(mayDeliver('safety', 'quiet'), true, 'safety is the single exception');
  // Off means off, including for safety — a coach that ignores "off" is not off.
  assert.equal(mayDeliver('safety', 'off'), false);
  assert.equal(mayDeliver('movement', 'full'), true);
});

test('MOVA: every state prints a label, so colour is never the only signal', () => {
  for (const state of Object.values(MOVA_STATES)) {
    assert.ok(state.label.length > 0, `${state.key} must carry a printed label`);
    assert.ok(state.means.length > 0);
  }
});

/* ---------------- Micro-movement ---------------- */

const OFFICE = {
  space: 'seat_only' as const,
  noise: 'silent' as const,
  privacy: 'semi_public' as const,
  footwear: 'formal_shoes' as const,
  clothing: 'formal' as const,
  stableSupport: true,
  inMotion: false,
};

test('micro-movement: a refusal always names its reason and its unlock', () => {
  const floorStretch = {
    minSpace: 'open_room' as const,
    maxNoise: 'quiet' as const,
    minPrivacy: 'private' as const,
    needsGrip: false,
    needsBalance: false,
    needsFloor: true,
    forbiddenFootwear: ['heels' as const],
    needsUnrestrictiveClothing: true,
  };
  const result = fitsEnvironment(floorStretch, OFFICE);
  assert.equal(result.fits, false);
  assert.ok(result.blockedBy.length >= 4, 'space, noise, privacy, floor and clothing all fail');
  assert.equal(
    result.blockedBy.length,
    new Set(result.blockedBy).size,
    'no duplicate reasons',
  );
  assert.ok(result.unlockedBy.length > 0, 'a refusal must say what would change it');
});

test('micro-movement: a silent seated movement fits an office desk', () => {
  const deskReset = {
    minSpace: 'seat_only' as const,
    maxNoise: 'silent' as const,
    minPrivacy: 'public' as const,
    needsGrip: false,
    needsBalance: false,
    needsFloor: false,
    forbiddenFootwear: [],
    needsUnrestrictiveClothing: false,
  };
  const result = fitsEnvironment(deskReset, OFFICE);
  assert.equal(result.fits, true, result.blockedBy.join('; '));
  assert.deepEqual(result.blockedBy, []);
});

test('micro-movement: balance work is blocked in a moving vehicle', () => {
  const balance = {
    minSpace: 'seat_only' as const,
    maxNoise: 'silent' as const,
    minPrivacy: 'public' as const,
    needsGrip: true,
    needsBalance: true,
    needsFloor: false,
    forbiddenFootwear: [],
    needsUnrestrictiveClothing: false,
  };
  const onTrain = { ...OFFICE, inMotion: true };
  assert.equal(fitsEnvironment(balance, onTrain).fits, false);
  assert.ok(
    fitsEnvironment(balance, onTrain).blockedBy.some((b) => /moving vehicle/.test(b)),
  );
});

test('micro-movement: variant selection only ever moves down the support ladder', () => {
  const standingBaseline = {
    baseline: 'standing' as const,
    standingCleared: true,
    singleLimbOnly: false,
    wheelchairUser: false,
    flare: false,
  };

  // A flare pushes to the gentlest variant.
  const flared = selectVariant({ ...standingBaseline, flare: true }, OFFICE, 'momentum');
  assert.equal(flared.variant, 'bed_recliner');
  assert.ok(isDownwardSubstitution('standing', flared.variant));

  // A wheelchair user gets the independently authored variant, not a degraded one.
  const wheelchair = selectVariant({ ...standingBaseline, wheelchairUser: true }, OFFICE, 'momentum');
  assert.equal(wheelchair.variant, 'adaptive_single_limb');
  assert.match(wheelchair.because, /independently/);

  // Vitality mode without clearance never gets standing.
  const vitality = selectVariant(
    { ...standingBaseline, standingCleared: false },
    { ...OFFICE, space: 'open_room' },
    'vitality',
  );
  assert.notEqual(vitality.variant, 'standing');
  assert.ok(isDownwardSubstitution('standing', vitality.variant));

  assert.equal(SUPPORT_LADDER[SUPPORT_LADDER.length - 1], 'standing', 'standing is the top rung');
});

test('micro-movement: a slipping completion rate lowers the ask rather than raising it', () => {
  const window = [90, 300] as const;
  const strong = calibrateDose({ recentCompletions: [200], completionProbability: 0.9, window });
  const steady = calibrateDose({ recentCompletions: [200], completionProbability: 0.65, window });
  const slipping = calibrateDose({ recentCompletions: [200], completionProbability: 0.3, window });

  assert.ok(strong.seconds > steady.seconds);
  assert.ok(slipping.seconds < steady.seconds, 'the ask gets smaller, not louder');
  assert.match(slipping.rationale, /smaller/);

  // Never outside the mode's window, however good the run.
  const capped = calibrateDose({ recentCompletions: [295], completionProbability: 1, window: [90, 180] });
  assert.ok(capped.seconds <= 180);

  const fresh = calibrateDose({ recentCompletions: [], completionProbability: 0.9, window });
  assert.equal(fresh.seconds, 90, 'no history starts at the floor');
});

test('micro-movement: repetition is suppressed and says so', () => {
  assert.equal(suppressForRepetition(4, 0).suppress, true);
  assert.match(String(suppressForRepetition(4, 0).because), /4h ago/);
  assert.equal(suppressForRepetition(48, 0).suppress, false);
  assert.equal(suppressForRepetition(undefined, 2).suppress, true, 'category fatigue counts too');
});

/* ---------------- Challenges ---------------- */

test('challenges: capability cannot enter a team score', () => {
  for (const field of CAPABILITY_FIELDS) {
    assert.throws(
      () => teamScore({ [field]: 0.5 } as never),
      /capability measure/,
      `${field} must be rejected at the boundary`,
    );
  }
});

test('challenges: the four terms are the whole scoring function', () => {
  const keys = TEAM_SCORE_TERMS.map((t) => t.key);
  assert.deepEqual(keys, ['participation', 'consistency', 'improvement', 'mutualSupport']);
  const weights = TEAM_SCORE_TERMS.reduce((a, t) => a + t.weight, 0);
  assert.ok(Math.abs(weights - 1) < 1e-9, 'the weights are a partition of one');

  assert.equal(
    teamScore({ participation: 1, consistency: 1, improvement: 1, mutualSupport: 1 }),
    100,
  );
  assert.throws(
    () => teamScore({ participation: 1.2, consistency: 1, improvement: 1, mutualSupport: 1 }),
    RangeError,
  );
});

test('challenges: no individual can dominate a team', () => {
  const superstar = contribution(
    {
      id: 'a',
      participated: true,
      daysActive: 7,
      daysPossible: 7,
      improvementVsOwnBaseline: 1,
      supportActs: 40,
    },
    2, // a tiny team, where domination would be easiest
  );
  assert.ok(superstar.capped, 'the ceiling must bite');
  assert.ok(superstar.share <= CONTRIBUTION_CEILING);
});

test('challenges: a team of entirely median people can still win', () => {
  const { winnable } = isWinnableByMedianTeam(60, 7, 10);
  assert.equal(winnable, true, 'a challenge no median team can win is not shipped');
  assert.equal(isWinnableByMedianTeam(200, 7, 10).winnable, false);
});

test('challenges: nobody is shown their position from the bottom', () => {
  assert.ok(LEADERBOARD_RULES.some((r) => /from the bottom/.test(r)));
  assert.ok(LEADERBOARD_RULES.some((r) => /Below-median positions are not rendered/.test(r)));
  assert.ok(LEADERBOARD_RULES.some((r) => /Explorer or Teen/.test(r)));
});

/* ---------------- Wearables ---------------- */

test('wearables: nothing is required, and every scope states what revoking costs', () => {
  for (const [scope, d] of Object.entries(DEGRADATION)) {
    assert.ok(d.losesPrecision.length > 0, `${scope} must say what is lost`);
    assert.ok(d.stillWorks.length > 0, `${scope} must say what still works`);
  }
});

test('wearables: the refused scopes are refused for every provider', () => {
  const requested = new Set(PROVIDERS.flatMap((p) => PROVIDER_DEFINITIONS[p].requests));
  for (const refused of NEVER_INGESTED) {
    for (const scope of requested) {
      assert.notEqual(scope, refused, `${refused} must never be a requested scope`);
    }
  }
  assert.ok(NEVER_INGESTED.some((n) => /blood glucose/.test(n)));
  assert.ok(NEVER_INGESTED.some((n) => /GPS/.test(n)));
});

test('wearables: a stale reading is labelled rather than used silently', () => {
  const fresh = { provider: 'apple_health' as const, scope: 'steps' as const, value: 4000, ageMinutes: 4 };
  const old = { provider: 'fitbit' as const, scope: 'steps' as const, value: 3600, ageMinutes: 400 };
  assert.equal(isStale(fresh), false);
  assert.equal(isStale(old), true);
  assert.ok(STALE_AFTER_MINUTES > 0);
});

test('wearables: disagreement is resolved deterministically and widens when large', () => {
  const readings = [
    { provider: 'fitbit' as const, scope: 'steps' as const, value: 5200, ageMinutes: 30 },
    { provider: 'apple_health' as const, scope: 'steps' as const, value: 4100, ageMinutes: 5 },
  ];
  const r = resolveConflict(readings);
  assert.equal(r.chosen.provider, 'apple_health', 'freshest wins');
  assert.match(r.because, /never left the device/);
  assert.ok(r.disagreementPct > DISAGREEMENT_TOLERANCE_PCT);
  assert.equal(shouldWidenForDisagreement(r.disagreementPct), true);

  assert.equal(shouldWidenForDisagreement(4), false);
  assert.throws(() => resolveConflict([]), RangeError);
});

test('wearables: a disclosure names what is accessed and what never is', () => {
  const d = disclosureFor('garmin');
  assert.ok(d.accesses.length > 0);
  assert.ok(d.willNotAccess.length >= NEVER_INGESTED.length);
  assert.match(d.howToDisconnect, /One tap/);
});

/* ------------------------------------------------------------------ *
 * Prescription coaching guides
 * ------------------------------------------------------------------ */

test('every movement category coaches every variant in full', async () => {
  const { guideFor } = await import('../src/prescriptions/guide.logic.ts');
  const { MOVEMENT_VARIANTS } = await import('@jessmove/shared');
  const categories = ['mobility', 'posture', 'balance', 'strength', 'breath', 'cardio', 'neuro', 'eye', 'play', 'skill'] as const;

  for (const category of categories) {
    for (const variant of MOVEMENT_VARIANTS) {
      const guide = guideFor(category, variant);
      assert.ok(guide.what.length > 10, `${category}/${variant} says what it is`);
      assert.equal(guide.steps.length, 5, `${category}/${variant} has setup + four steps`);
      assert.ok(guide.feel.length > 10, `${category}/${variant} says how it should feel`);
      assert.match(guide.stopIf, /never hurt/, 'the stop line is always present');
      // The first step is the variant's setup — a seated guide must not
      // open by telling someone to stand.
      if (variant === 'seated') assert.match(guide.steps[0]!, /Sit/);
      if (variant === 'bed_recliner') assert.doesNotMatch(guide.steps[0]!, /Stand/);
    }
  }
});

/* ------------------------------------------------------------------ *
 * MOVA — the coach's assembled prompt and its final guard
 * ------------------------------------------------------------------ */

test('MOVA: an under-18 prompt states the body rules as absolutes', async () => {
  const { systemPromptFor } = await import('../src/mova/mova.logic.ts');
  const child = systemPromptFor({ age: 12 });
  assert.match(child, /under 18/i);
  assert.match(child, /Never mention calories, weight, BMI/);
  const adult = systemPromptFor({ age: 40 });
  assert.doesNotMatch(adult, /Never mention calories/);
});

test('MOVA: every published refusal reaches the model', async () => {
  const { systemPromptFor } = await import('../src/mova/mova.logic.ts');
  const { MOVA_REFUSES } = await import('@jessmove/shared');
  const prompt = systemPromptFor({ age: 34 });
  for (const refusal of MOVA_REFUSES) {
    assert.ok(prompt.includes(refusal.ask), `"${refusal.ask}" is in the prompt`);
  }
});

test('MOVA: a body-shaped answer to a minor is refused by the platform, not the model', async () => {
  const { violatesMinorRules } = await import('../src/mova/mova.logic.ts');
  assert.equal(violatesMinorRules('That meal is about 600 calories.'), true);
  assert.equal(violatesMinorRules('Your BMI suggests…'), true);
  assert.equal(violatesMinorRules('Try a two-minute walk to wake your legs up.'), false);
});

test('MOVA: the register matches the age mode it was built for', async () => {
  const { systemPromptFor } = await import('../src/mova/mova.logic.ts');
  assert.match(systemPromptFor({ age: 15 }), /teen mode/);
  assert.match(systemPromptFor({ age: 30 }), /momentum mode/);
  assert.match(systemPromptFor({ age: 82 }), /vitality mode/);
});
