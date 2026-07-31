import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchPricesByPlan } from '../src/stripe/prices.logic.ts';

test('prices are matched by their plan metadata, not by position or amount', () => {
  const byPlan = matchPricesByPlan([
    { id: 'price_A', metadata: { plan: 'premium_monthly' } },
    { id: 'price_B', metadata: { plan: 'family_annual' } },
    { id: 'price_C', metadata: { plan: 'organisation_seat' } },
  ]);
  assert.equal(byPlan.get('premium_monthly'), 'price_A');
  assert.equal(byPlan.get('family_annual'), 'price_B');
  assert.equal(byPlan.get('organisation_seat'), 'price_C');
});

test('unknown or missing plan metadata is ignored rather than guessed', () => {
  const byPlan = matchPricesByPlan([
    { id: 'price_X', metadata: { plan: 'not_a_plan' } },
    { id: 'price_Y', metadata: {} },
    { id: 'price_Z' },
  ]);
  assert.equal(byPlan.size, 0);
});

test('the newest active price per plan wins — replacing a price needs no config change', () => {
  const byPlan = matchPricesByPlan([
    { id: 'price_new', metadata: { plan: 'premium_monthly' } },
    { id: 'price_old', metadata: { plan: 'premium_monthly' } },
  ]);
  assert.equal(byPlan.get('premium_monthly'), 'price_new');
});

test('an archived price is never selected', () => {
  const byPlan = matchPricesByPlan([
    { id: 'price_dead', active: false, metadata: { plan: 'premium_monthly' } },
    { id: 'price_live', active: true, metadata: { plan: 'premium_monthly' } },
  ]);
  assert.equal(byPlan.get('premium_monthly'), 'price_live');
});
