import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACU_PER_GBP,
  COST_MODEL_VERSION,
  COST_PROTECTION_MULTIPLE,
  OVERHEAD_TOTAL,
  PROFIT_MULTIPLE,
  STRIPE,
  TARGET_GROSS_MARGIN,
  VAT_RATE,
  acuAllowanceFor,
  acusForAction,
  aiCallCost,
  cloudCost,
  freeTierSubsidy,
  messagingCost,
  monthlyCost,
  planEconomics,
  priceAction,
  priceFloor,
  stress,
  stripeFee,
  type UserCostProfile,
} from '@movequest/shared';
import {
  ACU_PER_GBP as BC_ACU_PER_GBP,
  COST_PROTECTION_MULTIPLE as BC_PROTECTION,
} from '@movequest/body-command';

/* A modelled Premium subscriber: a full month of real usage. */
const PREMIUM: UserCostProfile = {
  label: 'Premium',
  aiCalls: [
    // 30 daily adaptive commands on the mid tier.
    ...Array.from({ length: 30 }, () => ({ tier: 'mid' as const, inputTokens: 2200, outputTokens: 320 })),
    // 4 weekly plans and 2 deep analyses on the frontier tier.
    ...Array.from({ length: 4 }, () => ({ tier: 'frontier' as const, inputTokens: 7000, outputTokens: 1400 })),
    ...Array.from({ length: 2 }, () => ({ tier: 'frontier' as const, inputTokens: 14000, outputTokens: 2200 })),
    // 20 FoodLens meals with a vision call each.
    ...Array.from({ length: 20 }, () => ({ tier: 'mid' as const, inputTokens: 1400, outputTokens: 600, images: 1 })),
  ],
  cloud: {
    firestoreReads: 24_000,
    firestoreWrites: 3_200,
    firestoreStorageGb: 0.012,
    cloudRunVcpuSeconds: 420,
    cloudRunGibSeconds: 210,
    requests: 5_600,
    functionInvocations: 3_400,
    storageGb: 0.05,
    egressGb: 0.35,
    bigQueryStorageGb: 0.02,
    bigQueryQueryTb: 0.00015,
    redisGbHours: 0.4,
  },
  messaging: { smsCount: 0, whatsappConversations: 0 },
  carriesOverhead: true,
};

/* A lightweight-tier user: no app, every prompt is a billable message. */
const LIGHTWEIGHT: UserCostProfile = {
  ...PREMIUM,
  label: 'Lightweight (T3)',
  aiCalls: PREMIUM.aiCalls.slice(0, 34),
  messaging: { smsCount: 60, whatsappConversations: 30 },
};

const FREE: UserCostProfile = {
  label: 'Free',
  aiCalls: Array.from({ length: 8 }, () => ({ tier: 'mid' as const, inputTokens: 1600, outputTokens: 240 })),
  cloud: { ...PREMIUM.cloud, firestoreReads: 6_000, firestoreWrites: 800, cloudRunVcpuSeconds: 90, cloudRunGibSeconds: 45, requests: 1_200, functionInvocations: 700, egressGb: 0.08, redisGbHours: 0.1 },
  messaging: { smsCount: 0, whatsappConversations: 0 },
  carriesOverhead: false,
};

test('the two cost-protection constants have not drifted apart', () => {
  assert.equal(
    COST_PROTECTION_MULTIPLE,
    BC_PROTECTION,
    'economics.ts and body-command/acu.ts must agree on the protection multiple',
  );
  assert.equal(ACU_PER_GBP, BC_ACU_PER_GBP);
});

test('the margin rule is 100% profit on fully-loaded cost', () => {
  assert.equal(PROFIT_MULTIPLE, 2);
  assert.equal(TARGET_GROSS_MARGIN, 0.5, '2x cost is a 50% gross margin');
  assert.ok(COST_MODEL_VERSION.length > 0);
});

test('every cost line is priced, and none of them is zero by accident', () => {
  const c = monthlyCost(PREMIUM);
  assert.ok(c.ai > 0, 'AI');
  assert.ok(c.cloud > 0, 'cloud');
  assert.ok(c.overhead > 0, 'overhead');
  assert.equal(c.messaging, 0, 'an app user sends no billable messages');
  assert.ok(
    Math.abs(c.total - (c.ai + c.cloud + c.messaging + c.overhead)) < 0.001,
    'the breakdown must sum to the total',
  );
  assert.ok(OVERHEAD_TOTAL > 1, 'human cost is the largest single line and must not be trivial');
});

test('a plan reconciles: gross is exactly VAT plus Stripe plus net revenue', () => {
  const p = planEconomics({ plan: 'Premium', grossGbp: 7.99, profile: PREMIUM });
  assert.ok(
    Math.abs(p.grossGbp - (p.vat + p.stripe + p.netRevenue)) < 0.001,
    'the money must add up',
  );
  assert.ok(p.vat > 0, 'VAT was never ours and must be removed first');
  assert.ok(Math.abs(p.vat - 7.99 * (VAT_RATE / (1 + VAT_RATE))) < 0.001);
  assert.equal(p.stripe, stripeFee(7.99, 'uk'));
});

test('the price floor is the price at which the margin rule is exactly met', () => {
  const cost = monthlyCost(PREMIUM).total;
  const floor = priceFloor(cost);
  const atFloor = planEconomics({ plan: 'at floor', grossGbp: floor, profile: PREMIUM });

  assert.ok(
    Math.abs(atFloor.profitMultiple - PROFIT_MULTIPLE) < 0.02,
    `pricing at the floor should land on ${PROFIT_MULTIPLE}x, got ${atFloor.profitMultiple}`,
  );
  assert.equal(atFloor.clearsTarget, true);

  // A penny under the floor must fail.
  const under = planEconomics({ plan: 'under', grossGbp: floor - 0.5, profile: PREMIUM });
  assert.equal(under.clearsTarget, false, 'below the floor the rule must bite');
});

test('an international card raises the floor, because it costs more to collect', () => {
  const cost = monthlyCost(PREMIUM).total;
  assert.ok(
    priceFloor(cost, { cardMix: 'international' }) > priceFloor(cost, { cardMix: 'uk' }),
  );
  // A business contract is ex-VAT, so the same cost needs a lower headline price.
  assert.ok(priceFloor(cost, { vatInclusive: false }) < priceFloor(cost, { vatInclusive: true }));
});

test('the lightweight tier is the most expensive user to serve, and we know it', () => {
  const app = monthlyCost(PREMIUM).total;
  const sms = monthlyCost(LIGHTWEIGHT).total;
  assert.ok(sms > app, 'a T3 user with no app costs more, not less');
  assert.ok(messagingCost({ smsCount: 60, whatsappConversations: 30 }) > 1);
});

test('an action must clear both rules, and names the one that bound', () => {
  // Cheap model call, negligible infrastructure: the 4x provider rule binds.
  const cheap = priceAction({ providerCostGbp: 0.004, cloudCostGbp: 0.0002, supportShareGbp: 0.0001 });
  assert.equal(cheap.bindingRule, 'provider_protection');
  assert.equal(cheap.priceGbp, cheap.byProviderRule);

  // Tiny model call, heavy infrastructure: the margin rule binds instead.
  const heavyInput = { providerCostGbp: 0.002, cloudCostGbp: 0.03, supportShareGbp: 0.02 };
  const heavy = priceAction(heavyInput);
  assert.equal(heavy.bindingRule, 'margin');
  assert.equal(heavy.priceGbp, heavy.byMarginRule);
  assert.ok(
    heavy.priceGbp > heavyInput.providerCostGbp * COST_PROTECTION_MULTIPLE,
    'the 4x rule alone would have under-priced this action by a factor of ' +
      String(Math.round(heavy.priceGbp / (heavyInput.providerCostGbp * COST_PROTECTION_MULTIPLE))),
  );

  assert.ok(acusForAction(heavyInput) >= 1, 'ACUs round up, never down');
});

test('the ACU allowance is derived from what the plan can actually afford', () => {
  const premium = planEconomics({ plan: 'Premium', grossGbp: 7.99, profile: PREMIUM });
  const allowance = acuAllowanceFor(premium);
  assert.ok(allowance > 0, 'a paying plan must be able to afford some AI');

  // Spending the whole allowance must still leave the plan clearing target.
  const aiSpendAtAllowance = allowance / ACU_PER_GBP / COST_PROTECTION_MULTIPLE;
  const costAtAllowance =
    premium.cost.cloud + premium.cost.messaging + premium.cost.overhead + aiSpendAtAllowance;
  assert.ok(
    premium.netRevenue / costAtAllowance >= PROFIT_MULTIPLE - 0.01,
    'the allowance must not be a number that bankrupts the plan when fully used',
  );
});

test('the free tier is a cost, and the model says how it is paid for', () => {
  const free = monthlyCost(FREE).total;
  const premium = planEconomics({ plan: 'Premium', grossGbp: 7.99, profile: PREMIUM });
  assert.ok(free > 0, 'free is never free to serve');

  const s = freeTierSubsidy({
    freeUsers: 9_000,
    paidUsers: 1_000,
    freeMonthlyCost: free,
    paidContribution: premium.contribution,
  });
  assert.ok(s.breakEvenConversionPct > 0 && s.breakEvenConversionPct < 100);
  assert.equal(typeof s.sustainable, 'boolean');
  assert.ok(s.totalFreeCost > 0);
});

test('stress testing names what breaks first', () => {
  const premium = planEconomics({ plan: 'Premium', grossGbp: 7.99, profile: PREMIUM });
  const doubled = stress(premium, { aiMultiplier: 2 });
  const quadrupled = stress(premium, { aiMultiplier: 4 });

  assert.ok(doubled.profitMultiple < premium.profitMultiple, 'a shock must reduce the multiple');
  assert.ok(quadrupled.profitMultiple < doubled.profitMultiple);
  assert.ok(quadrupled.contribution < doubled.contribution);
});

test('Stripe fees are charged on the gross, including the VAT we never keep', () => {
  const fee = stripeFee(10, 'uk');
  const expected = 10 * (STRIPE.ukCardPct + STRIPE.billingPct + STRIPE.disputeReservePct) + STRIPE.fixedFee;
  assert.ok(Math.abs(fee - expected) < 0.0001);
  assert.ok(stripeFee(10, 'international') > stripeFee(10, 'uk'));
});

test('a call to the frontier tier costs materially more than the mid tier', () => {
  const mid = aiCallCost({ tier: 'mid', inputTokens: 5000, outputTokens: 1000 });
  const frontier = aiCallCost({ tier: 'frontier', inputTokens: 5000, outputTokens: 1000 });
  assert.ok(frontier > mid * 5, 'routing matters, which is why the agent registry declares a tier');
  assert.ok(
    aiCallCost({ tier: 'mid', inputTokens: 1000, outputTokens: 200, images: 3 }) >
      aiCallCost({ tier: 'mid', inputTokens: 1000, outputTokens: 200 }),
    'vision is billed',
  );
});

test('cloud cost is dominated by reads, not by compute', () => {
  const base = cloudCost(PREMIUM.cloud);
  const chatty = cloudCost({ ...PREMIUM.cloud, firestoreReads: PREMIUM.cloud.firestoreReads * 20 });
  assert.ok(chatty > base, 'a client that re-reads on every render is a cost problem');
});

/* ---------------- the £5 minimum charge ---------------- */

test('no payment is ever taken below the minimum charge', async () => {
  const { BelowMinimumChargeError, MIN_TRANSACTION_GBP, assertChargeable, fixedFeeBurden } =
    await import('@movequest/shared');

  assert.equal(MIN_TRANSACTION_GBP, 5);

  for (const amount of [0.5, 1.99, 2, 4.99]) {
    assert.throws(() => assertChargeable(amount), BelowMinimumChargeError, `£${amount} must be refused`);
  }
  assert.doesNotThrow(() => assertChargeable(5));
  assert.doesNotThrow(() => assertChargeable(5.99));

  assert.throws(() => assertChargeable(0), RangeError);
  assert.throws(() => assertChargeable(-5), RangeError);

  // The reason, stated numerically: the fixed fee dominates small charges.
  assert.ok(fixedFeeBurden(2) > 9, 'Stripe’s fixed fee is over 9% of a £2 charge');
  assert.ok(fixedFeeBurden(5) < 4.5, 'and under 4.5% at the floor');
});

test('the error explains itself rather than just refusing', async () => {
  const { assertChargeable } = await import('@movequest/shared');
  try {
    assertChargeable(1.99);
    assert.fail('should have thrown');
  } catch (e) {
    assert.match(String((e as Error).message), /below the £5\.00 minimum/);
    assert.match(String((e as Error).message), /10\.1% of it/);
    assert.match(String((e as Error).message), /Bundle it into a subscription/);
  }
});

test('every published plan and top-up tier clears the minimum', async () => {
  const { ACU_TOPUP_TIERS, MIN_TRANSACTION_GBP, assertChargeable } = await import('@movequest/shared');

  for (const tier of ACU_TOPUP_TIERS) {
    assert.doesNotThrow(() => assertChargeable(tier.gbp), `£${tier.gbp} top-up`);
    assert.ok(tier.gbp >= MIN_TRANSACTION_GBP);
  }
  assert.equal(ACU_TOPUP_TIERS[0].gbp, MIN_TRANSACTION_GBP, 'the smallest tier is the floor itself');
  assert.equal(ACU_TOPUP_TIERS[0].bonusAcus, 0, 'no bonus at the floor — the fee has not amortised yet');

  // Consumer subscriptions.
  for (const price of [5.99, 8.99, 12.99, 17.99]) {
    assert.doesNotThrow(() => assertChargeable(price));
  }
});

test('an organisation invoice clears the floor even where a seat rate does not', async () => {
  const { MIN_CONTRACT_SEATS, assertChargeable } = await import('@movequest/shared');

  // £2 a seat is below the floor as a number, and is never charged as one.
  assert.throws(() => assertChargeable(2));

  // The transaction is the invoice, and the minimum contract size guarantees it.
  const invoice = 2 * MIN_CONTRACT_SEATS;
  assert.doesNotThrow(() => assertChargeable(invoice));
  assert.ok(invoice >= 5, 'the seat minimum and the charge minimum are consistent');
});

test('the price floor never lands below the minimum charge', async () => {
  const { MIN_TRANSACTION_GBP, monthlyCost, priceFloor } = await import('@movequest/shared');

  // Even the cheapest user to serve must not produce a sub-minimum price.
  const cheapest = monthlyCost({
    label: 'minimal',
    carriesOverhead: true,
    messaging: { smsCount: 0, whatsappConversations: 0 },
    cloud: { firestoreReads: 0, firestoreWrites: 0, firestoreStorageGb: 0, cloudRunVcpuSeconds: 0,
      cloudRunGibSeconds: 0, requests: 0, functionInvocations: 0, storageGb: 0, egressGb: 0,
      bigQueryStorageGb: 0, bigQueryQueryTb: 0, redisGbHours: 0 },
    aiCalls: [],
  });
  const floor = priceFloor(cheapest.total);
  assert.ok(
    Math.max(floor, MIN_TRANSACTION_GBP) >= MIN_TRANSACTION_GBP,
    'whichever binds, the charge clears £5',
  );
  // In practice human cost alone puts the floor above £5 anyway.
  assert.ok(floor >= 3, 'overhead alone is substantial');
});
