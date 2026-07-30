import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAPABILITY_FIELDS,
  CapabilityInScoringError,
  TEAM_SCORE_TERMS,
  teamScore,
} from '@jessmove/shared';

/*
 * The How-it-works page states: "Asserted in continuous integration. A
 * build that scores movement on calories, weight or appearance does not
 * ship." This file is that assertion.
 */

test('a valid team score is the weighted sum of exactly four terms', () => {
  const score = teamScore({
    participation: 1,
    consistency: 1,
    improvement: 1,
    mutualSupport: 1,
  });
  assert.equal(score, 100);
  assert.equal(TEAM_SCORE_TERMS.length, 4);
  assert.equal(TEAM_SCORE_TERMS.reduce((a, t) => a + t.weight, 0), 1);
});

test('every capability field is rejected from scoring input', () => {
  for (const field of CAPABILITY_FIELDS) {
    assert.throws(
      () =>
        teamScore({
          participation: 1,
          consistency: 1,
          improvement: 1,
          mutualSupport: 1,
          [field]: 500,
        } as never),
      CapabilityInScoringError,
      `${field} must never reach the scoring function`,
    );
  }
});

test('the ban is substring-based, so a renamed calorie field still fails', () => {
  for (const sneaky of ['dailyCalories', 'body_weight_kg', 'avgHeartRateBpm']) {
    assert.throws(
      () =>
        teamScore({
          participation: 1,
          consistency: 1,
          improvement: 1,
          mutualSupport: 1,
          [sneaky]: 1,
        } as never),
      CapabilityInScoringError,
    );
  }
});
