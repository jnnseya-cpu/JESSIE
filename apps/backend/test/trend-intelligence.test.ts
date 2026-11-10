/**
 * The trend engine's arithmetic and its one refusal.
 *
 * Two kinds of test here. Most measure the scoring against the figures
 * the specification states, so a drift in a weight is a failing test
 * rather than a slightly different answer nobody notices. The rest pin
 * the clinical safety control: there is no decision this engine can reach
 * that publishes anything, and the way that control fails is by somebody
 * adding one member to a union, so the union is pinned by name.
 *
 * The conformance IDs in the test names are the specification's own
 * (TI-03, TI-04, TI-14), so a reader can find the scenario being checked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_KINDS,
  ACTION_TRANSITIONS,
  AVAILABLE_ACTION_KINDS,
  AVAILABLE_BRIEF_CHANNELS,
  BRIEF_CHANNELS,
  CONFIDENCE_WEIGHTS,
  COUNT_GATE,
  DECISION_CUTOFFS,
  LIVE_ACTION_KINDS,
  MIN_COMPARABLE_PERIODS,
  PATCHABLE_FIELDS,
  SINGLE_FAMILY_CONFIDENCE_CAP,
  SOURCE_FAMILIES,
  SOURCE_FAMILY_DEFINITIONS,
  TREND_DECISIONS,
  TREND_OPPORTUNITY_WEIGHTS,
  canTransitionAction,
  checkBrief,
  confidenceScore,
  corroborationScore,
  countFeedGate,
  decide,
  demandFromZ,
  freshnessScore,
  idempotencyKeyParts,
  logLift,
  mayProposeLiveWrite,
  median,
  medianAbsoluteDeviation,
  robustZ,
  trendOpportunityScore,
  type BriefChannel,
  type GrowthBrief,
} from '@jessmove/shared';

/* ------------------------------------------------------------------ *
 * Weights
 * ------------------------------------------------------------------ */

test('both weight sets sum to one, so a score cannot exceed its range', () => {
  /*
   * A weight set that sums to 0.95 produces a maximum score of 95 and a
   * threshold of 75 that quietly means 79. The sum is the only thing
   * keeping the published cutoffs meaningful.
   */
  const opportunity = Object.values(TREND_OPPORTUNITY_WEIGHTS).reduce((a, b) => a + b, 0);
  const confidence = Object.values(CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(opportunity, 1, `opportunity weights sum to ${opportunity}`);
  assert.equal(confidence, 1, `confidence weights sum to ${confidence}`);
});

test('demand and platform fit are weighted equally, and are half the score', () => {
  /*
   * This is the product's actual argument, expressed as two numbers:
   * demand the platform cannot serve is not an opportunity however large
   * it is. If these ever diverge it is a change of strategy, not a tuning
   * decision, and it should be argued for rather than committed.
   */
  assert.equal(TREND_OPPORTUNITY_WEIGHTS.demand, TREND_OPPORTUNITY_WEIGHTS.fit);
  assert.equal(
    TREND_OPPORTUNITY_WEIGHTS.demand + TREND_OPPORTUNITY_WEIGHTS.fit,
    0.5,
  );
});

/* ------------------------------------------------------------------ *
 * TI-03 — the stated figures
 * ------------------------------------------------------------------ */

test('TI-03: the specification example scores 86.25 and 83.5 exactly', () => {
  const opportunity = trendOpportunityScore({
    demand: 80,
    fit: 95,
    intent: 85,
    timing: 90,
    readiness: 80,
  });
  const confidence = confidenceScore({
    sourceQuality: 90,
    corroboration: 80,
    coverage: 70,
    freshness: 90,
    independentFamilies: 2,
  });

  assert.equal(opportunity, 86.25);
  assert.equal(confidence, 83.5);
});

test('TI-03: those figures produce a reviewable brief, on unrounded values', () => {
  /*
   * The scenario requires that neither score is rounded before the
   * decision. It matters at exactly this point: 86.25 is over the
   * priority score of 85, but 83.5 is under the priority confidence of
   * 85, so the correct answer is the lower band. Rounding 83.5 up to 84
   * would not change it; rounding to the nearest five would, and a
   * "tidy" display value finding its way into the comparison is the
   * realistic version of that mistake.
   */
  const verdict = decide(86.25, 83.5);
  assert.equal(verdict.decision, 'reviewable_brief');
  assert.equal(verdict.mayCreateBrief, true);
  assert.equal(verdict.opportunity, 86.25, 'the verdict must carry the unrounded score');
  assert.equal(verdict.confidence, 83.5);
});

/* ------------------------------------------------------------------ *
 * The refusal
 * ------------------------------------------------------------------ */

test('no decision this engine can reach publishes anything', () => {
  /*
   * The clinical safety control, as a test rather than a comment.
   *
   * The specification's fourth band makes a score of 85 and a confidence
   * of 85 "eligible for bounded automatic action in approved low-risk
   * classes only", and section 7 floats automatically running a CTA
   * variant on a tenth of eligible traffic. On a platform where an agent
   * writes about people's bodies, both are a draft-to-published edge, and
   * there must not be one.
   *
   * So the band exists and earns attention instead: `priority_review`
   * moves a topic up a reviewer's queue and does nothing else. This test
   * pins the union by name, because the way this control gets lost is one
   * plausible-looking member added to it by somebody who had a deadline.
   */
  assert.deepEqual(TREND_DECISIONS, [
    'vetoed',
    'archive',
    'watch',
    'reviewable_brief',
    'priority_review',
  ]);

  for (const decision of TREND_DECISIONS) {
    assert.doesNotMatch(
      decision,
      /auto|publish|live|send|execute/i,
      `"${decision}" names an outcome that acts without a person`,
    );
  }

  // The top band, at its own thresholds, still only earns review.
  const top = decide(
    DECISION_CUTOFFS.priorityScore + 10,
    DECISION_CUTOFFS.priorityConfidence + 10,
  );
  assert.equal(top.decision, 'priority_review');
  assert.match(
    top.why,
    /does not go live on its own/,
    'the top band must say in its own words that it does not publish',
  );
});

test('a veto beats any score, including a perfect one', () => {
  const verdict = decide(100, 100, ['unsupported_claim']);
  assert.equal(verdict.decision, 'vetoed');
  assert.equal(verdict.mayCreateBrief, false);
  assert.match(verdict.why, /No score overcomes a veto/);
});

/* ------------------------------------------------------------------ *
 * The decision bands
 * ------------------------------------------------------------------ */

test('each band is reached at its own boundary, and one point below it is not', () => {
  const { archiveBelowScore, archiveBelowConfidence, briefScore, briefConfidence } =
    DECISION_CUTOFFS;

  assert.equal(decide(archiveBelowScore - 0.01, 90).decision, 'archive');
  assert.equal(decide(90, archiveBelowConfidence - 0.01).decision, 'archive');
  assert.equal(decide(archiveBelowScore, archiveBelowConfidence).decision, 'watch');
  assert.equal(decide(briefScore, briefConfidence).decision, 'reviewable_brief');
  assert.equal(decide(briefScore - 0.01, briefConfidence).decision, 'watch');

  /*
   * A strong opportunity with weak confidence is the single most
   * important case in this table, and the one a careless implementation
   * gets wrong. It must not reach a brief: a big number nobody can
   * corroborate is exactly what this engine exists not to act on.
   */
  const strongButUnsure = decide(95, 60);
  assert.equal(strongButUnsure.decision, 'watch');
  assert.equal(strongButUnsure.mayCreateBrief, false);
});

/* ------------------------------------------------------------------ *
 * Movement
 * ------------------------------------------------------------------ */

test('the robust statistics behave on the cases that break the naive ones', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(medianAbsoluteDeviation([1, 1, 1, 1]), 0);

  // One wild outlier must not move the centre. A mean would be dragged
  // from 2 to 202; the median is not.
  assert.equal(median([1, 2, 3, 1000]), 2.5);

  // A zero baseline is the normal state of a topic nobody has covered.
  // Without the +1 this is infinite rather than large.
  assert.ok(Number.isFinite(logLift(10, 0)));
  assert.ok(logLift(10, 0) > logLift(10, 5));
  assert.equal(logLift(5, 5), 0, 'no change must be exactly no lift');
});

test('a perfectly flat history cannot produce an infinite z', () => {
  /*
   * Four identical weeks give a median absolute deviation of zero. The
   * denominator floor is the only thing between that and a division by
   * zero declaring week five a miracle.
   */
  const z = robustZ(8, [3, 3, 3, 3]);
  assert.ok(Number.isFinite(z), `z was ${z}`);
  assert.ok(z > 0);
});

test('both count gates are needed, because either alone is wrong', () => {
  const history = [4, 5, 4, 6, 5, 4, 5, 6];

  // Unusual, but it is four people.
  const tiny = countFeedGate(4, history);
  assert.equal(tiny.open, false);
  if (tiny.open === false) assert.equal(tiny.why, 'below_count_floor');

  // A big number that is no news: 5,000 against a baseline of 5,000.
  const flat = countFeedGate(5000, [5000, 5000, 5000, 5000]);
  assert.equal(flat.open, false);
  if (flat.open === false) assert.equal(flat.why, 'not_unusual_enough');

  // Both satisfied.
  const open = countFeedGate(40, history);
  assert.equal(open.open, true);
  if (open.open) {
    assert.ok(open.z >= COUNT_GATE.minZ);
    assert.ok(open.lift > 0);
  }
});

test('too little history is unknown, and says so rather than scoring zero', () => {
  const verdict = countFeedGate(100, [5, 5, 5]);
  assert.equal(verdict.open, false);
  if (verdict.open === false) {
    assert.equal(verdict.why, 'insufficient_history');
    assert.equal(verdict.z, null, 'an unknown must not carry a computed z');
    assert.match(verdict.detail, /unknown, not flat/);
  }
  assert.equal(MIN_COMPARABLE_PERIODS, 4);
});

test('the demand mapping is clamped at both ends', () => {
  assert.equal(demandFromZ(0), 50);
  assert.equal(demandFromZ(2), 70);
  assert.equal(demandFromZ(100), 100, 'an enormous z must not exceed the range');
  assert.equal(demandFromZ(-100), 0);
});

/* ------------------------------------------------------------------ *
 * Confidence, corroboration and freshness
 * ------------------------------------------------------------------ */

test('TI-04: one source family cannot reach a brief, however good it looks', () => {
  /*
   * Three syndications of one story are one story. On this platform the
   * equivalent is three reports derived from the same event pipe. With
   * everything else perfect, a lone family must still land below the 75
   * a brief needs — otherwise "corroborated" means nothing.
   */
  const perfectButAlone = confidenceScore({
    sourceQuality: 100,
    corroboration: corroborationScore(1),
    coverage: 100,
    freshness: 100,
    independentFamilies: 1,
  });
  assert.equal(perfectButAlone, SINGLE_FAMILY_CONFIDENCE_CAP);
  assert.ok(
    perfectButAlone < DECISION_CUTOFFS.briefConfidence,
    'the single-family cap must sit below the brief threshold or it does nothing',
  );
  assert.equal(decide(100, perfectButAlone).decision, 'watch');

  assert.equal(corroborationScore(1), 0);
  assert.equal(corroborationScore(2), 80);
  assert.equal(corroborationScore(3), 100);
  assert.equal(corroborationScore(9), 100);
});

test('attention-only families are marked as unable to corroborate', () => {
  /*
   * Engaged reads look like demand and are not. The specification is
   * explicit that a context-only source cannot satisfy the corroboration
   * minimum, and this is the family where that rule earns its keep.
   */
  assert.equal(SOURCE_FAMILY_DEFINITIONS.blog_engagement.contextOnly, true);
  const corroborating = SOURCE_FAMILIES.filter(
    (f) => !SOURCE_FAMILY_DEFINITIONS[f].contextOnly,
  );
  assert.ok(
    corroborating.length >= 2,
    'at least two families must be able to corroborate or no topic can ever ' +
      'clear the single-family cap',
  );
  assert.ok(
    SOURCE_FAMILY_DEFINITIONS.conversion.quality >
      SOURCE_FAMILY_DEFINITIONS.blog_engagement.quality,
    'a completed conversion must outrank a read',
  );
});

test('freshness falls linearly and reaches zero when stale', () => {
  assert.equal(freshnessScore(0, 168), 100);
  assert.equal(freshnessScore(84, 168), 50);
  assert.equal(freshnessScore(168, 168), 0);
  assert.equal(freshnessScore(400, 168), 0, 'past stale is zero, never negative');
  assert.equal(freshnessScore(-5, 168), 100, 'a future window close is not extra fresh');
});

/* ------------------------------------------------------------------ *
 * The brief
 * ------------------------------------------------------------------ */

const NOW = new Date('2026-11-10T12:00:00.000Z');

function briefFixture(overrides: Partial<GrowthBrief> = {}): GrowthBrief {
  return {
    schemaVersion: 1,
    briefId: 'gb_001',
    briefVersion: 1,
    topicId: 'desk-breaks-for-stiff-hips',
    opportunityScore: 86.25,
    confidence: 83.5,
    validFrom: '2026-11-10T10:00:00.000Z',
    expiresAt: '2026-11-17T10:00:00.000Z',
    evidenceIds: ['ev_1', 'ev_2'],
    audience: 'Desk workers who sit for long stretches',
    intent: 'find short movements that fit between meetings',
    approvedClaimIds: ['claim_desk_breaks_01'],
    ctaId: 'cta_try_a_snap',
    allowedChannels: ['seo'],
    prohibitedClaims: ['cures back pain'],
    objective: 'engaged reads per eligible session',
    experimentId: 'exp_1',
    policyVersion: 3,
    approvedBy: 'editor@example.test',
    ...overrides,
  };
}

test('a brief in its window, evidenced and approved, resolves', () => {
  const check = checkBrief(briefFixture(), NOW, 'seo');
  assert.equal(check.ok, true, check.why);
  assert.deepEqual(check.rejections, []);
});

test('TI-05: an expired brief is refused even though it is structurally valid', () => {
  /*
   * The scenario that matters most, because it is the one a cache
   * creates: the brief was fine when it was read and is not fine when the
   * write happens. Expiry is checked at both moments for that reason.
   */
  const check = checkBrief(briefFixture(), new Date('2026-11-18T00:00:00.000Z'), 'seo');
  assert.equal(check.ok, false);
  assert.ok(check.rejections.includes('expired'));
});

test('a brief with no reviewer, no evidence or no approved claim cannot be served', () => {
  for (const [what, override, rejection] of [
    ['no reviewer', { approvedBy: '   ' }, 'no_reviewer'],
    ['no evidence', { evidenceIds: [] }, 'no_evidence'],
    ['no approved claim', { approvedClaimIds: [] }, 'no_approved_claim'],
  ] as const) {
    const check = checkBrief(briefFixture(override), NOW, 'seo');
    assert.equal(check.ok, false, `${what} was accepted`);
    assert.ok(
      check.rejections.includes(rejection),
      `${what} did not produce ${rejection}`,
    );
  }
});

test('an inverted window is caught rather than silently never matching', () => {
  const check = checkBrief(
    briefFixture({
      validFrom: '2026-11-17T10:00:00.000Z',
      expiresAt: '2026-11-10T10:00:00.000Z',
    }),
    NOW,
  );
  assert.equal(check.ok, false);
  assert.ok(check.rejections.includes('window_inverted'));
});

test('a channel with no adapter is refused, and the reserved values stay unavailable', () => {
  /*
   * The channel list is wider than the channels that work, on purpose —
   * the enum reserves stable routing values. The danger is that a
   * reserved value reads as a working one. `lifecycle` means emailing
   * real people and `paid` means spending real money; neither has an
   * adapter here and a brief naming either must be refused.
   */
  for (const channel of ['lifecycle', 'paid', 'owned_placement', 'organic_social'] as const) {
    const check = checkBrief(briefFixture({ allowedChannels: [channel] }), NOW);
    assert.equal(check.ok, false, `${channel} was accepted as available`);
    assert.ok(check.rejections.includes('unavailable_channel'));
  }

  /*
   * One available channel. `organic_social` moved out of this list when
   * the engine was embedded: the only social writer on the platform is
   * the partner growth engine, which writes for affiliates and bills
   * their allowance, so the platform's brief must not reach it.
   */
  assert.deepEqual([...AVAILABLE_BRIEF_CHANNELS], ['seo']);
  for (const available of AVAILABLE_BRIEF_CHANNELS) {
    assert.ok(
      (BRIEF_CHANNELS as readonly BriefChannel[]).includes(available),
      `${available} is available but not a known channel`,
    );
  }

  // Asking for a channel the brief does not allow is a different refusal
  // from asking for one nothing supports, and must not be conflated.
  /*
   * Asking for a channel the brief does not list is a different refusal
   * from asking for one nothing supports, and conflating them would hide
   * a brief that was scoped to one channel being acted on for another.
   * `owned_placement` is used here because it is reserved rather than
   * available, so this case reports both reasons and must include the
   * specific one.
   */
  const wrongChannel = checkBrief(
    briefFixture({ allowedChannels: ['seo'] }),
    NOW,
    'owned_placement',
  );
  assert.equal(wrongChannel.ok, false);
  assert.ok(
    wrongChannel.rejections.includes('channel_not_in_brief'),
    `expected channel_not_in_brief, got ${wrongChannel.rejections.join(', ')}`,
  );
});

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

test('the action kinds that do not exist are the ones that cannot be asked for', () => {
  /*
   * The specification puts URLs, redirects, canonicals, robots,
   * structured data, permissions and template code out of scope for v1
   * automation. They are absent from the union rather than blocked
   * downstream, because a kind that does not exist cannot be requested by
   * a model, a caller or a mistake.
   */
  assert.deepEqual(ACTION_KINDS, [
    'seo_metadata_patch',
    'owned_content_patch',
    'seo_page_draft',
    'organic_social_draft',
  ]);
  for (const kind of ACTION_KINDS) {
    assert.doesNotMatch(
      kind,
      /redirect|canonical|robots|schema|permission|template|publish|delete/i,
      `${kind} names something out of scope for automation`,
    );
  }

  // Drafts patch nothing at all.
  assert.deepEqual(PATCHABLE_FIELDS.seo_page_draft, []);
  assert.deepEqual(PATCHABLE_FIELDS.organic_social_draft, []);
  // A live kind that is *available* must have something to patch. A
  // reserved one must have nothing, so it cannot half-work.
  for (const kind of LIVE_ACTION_KINDS) {
    const available = AVAILABLE_ACTION_KINDS.includes(kind);
    assert.equal(
      PATCHABLE_FIELDS[kind].length > 0,
      available,
      `${kind} is ${available ? 'available' : 'reserved'} and its patchable ` +
        'field list disagrees',
    );
  }
  assert.deepEqual([...PATCHABLE_FIELDS.seo_metadata_patch], ['title', 'description']);
});

test('a live write needs a pre-bound target and a topic that earned it', () => {
  const base = {
    kind: 'seo_metadata_patch' as const,
    fields: ['title'],
    targetIsPreBound: true,
    decision: 'reviewable_brief' as const,
  };
  assert.equal(mayProposeLiveWrite(base).allowed, true);

  const unbound = mayProposeLiveWrite({ ...base, targetIsPreBound: false });
  assert.equal(unbound.allowed, false);
  assert.match(unbound.why, /not pre-bound/);

  for (const decision of ['watch', 'archive', 'vetoed'] as const) {
    const weak = mayProposeLiveWrite({ ...base, decision });
    assert.equal(weak.allowed, false, `${decision} was allowed to write`);
  }

  // A field outside the allowlist is refused by name.
  const offList = mayProposeLiveWrite({ ...base, fields: ['canonicalUrl', 'title'] });
  assert.equal(offList.allowed, false);
  assert.match(offList.why, /canonicalUrl/);

  // A draft is always proposable, because it changes nothing visible.
  const draft = mayProposeLiveWrite({
    kind: 'organic_social_draft',
    fields: [],
    targetIsPreBound: false,
    decision: 'watch',
  });
  assert.equal(draft.allowed, true);
});

test('a reserved action kind is refused rather than attempted', () => {
  const reserved = mayProposeLiveWrite({
    kind: 'owned_content_patch',
    fields: [],
    targetIsPreBound: true,
    decision: 'priority_review',
  });
  assert.equal(reserved.allowed, false);
  assert.match(reserved.why, /reserved kind with no adapter/);
});

test('even an eligible live write still requires a second person', () => {
  const verdict = mayProposeLiveWrite({
    kind: 'seo_metadata_patch',
    fields: ['description'],
    targetIsPreBound: true,
    decision: 'priority_review',
  });
  assert.equal(verdict.allowed, true);
  assert.match(
    verdict.why,
    /approver who is not the author/,
    'eligibility must not read as permission',
  );
});

test('the action state machine has no path from proposed to applied', () => {
  /*
   * Walked rather than asserted, so a new transition that happens to
   * create a shortcut is caught. Approval is the only way through, and a
   * terminal state is terminal.
   */
  assert.equal(canTransitionAction('proposed', 'validated'), true);
  assert.equal(canTransitionAction('proposed', 'applied'), false);
  assert.equal(canTransitionAction('validated', 'queued'), false);
  assert.equal(canTransitionAction('pending_approval', 'queued'), false);
  assert.equal(canTransitionAction('approved', 'queued'), true);
  assert.equal(canTransitionAction('applied', 'rolled_back'), true);
  assert.equal(canTransitionAction('failed', 'queued'), false);
  assert.equal(canTransitionAction('rolled_back', 'queued'), false);

  // Breadth-first: no route from proposed to applied may skip approval.
  const seen = new Set<string>(['proposed']);
  const queue = ['proposed'];
  while (queue.length) {
    const state = queue.shift()!;
    for (const next of ACTION_TRANSITIONS[state as keyof typeof ACTION_TRANSITIONS]) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  assert.ok(seen.has('applied'), 'applied must be reachable at all');
  assert.ok(
    ACTION_TRANSITIONS.pending_approval.includes('approved'),
    'approval must be the only door to approved',
  );
  for (const [from, tos] of Object.entries(ACTION_TRANSITIONS)) {
    if (from === 'approved') continue;
    assert.ok(
      !tos.includes('queued'),
      `${from} can queue work without being approved first`,
    );
  }
});

test('the idempotency key changes when the write changes, and not otherwise', () => {
  const parts = {
    briefId: 'gb_001',
    briefVersion: 2,
    channel: 'seo' as const,
    actionKind: 'seo_metadata_patch' as const,
    targetId: 'post_desk_breaks',
    baseRevision: 7,
    canonicalPatchHash: 'abc123',
  };
  const key = idempotencyKeyParts(parts);
  assert.equal(idempotencyKeyParts({ ...parts }), key, 'the same write must dedupe');

  /*
   * The base revision is in the key deliberately. A retry against a
   * target that has since moved is a different write and must not dedupe
   * against the original — otherwise the second attempt silently returns
   * the first one's result and the editor's change is lost.
   */
  assert.notEqual(idempotencyKeyParts({ ...parts, baseRevision: 8 }), key);
  assert.notEqual(idempotencyKeyParts({ ...parts, canonicalPatchHash: 'def456' }), key);
  assert.notEqual(idempotencyKeyParts({ ...parts, briefVersion: 3 }), key);
  assert.notEqual(idempotencyKeyParts({ ...parts, targetId: 'post_other' }), key);
});
