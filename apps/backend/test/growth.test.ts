import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMMISSION_RATE,
  COMMISSION_UNLOCK_REFERRALS,
  EXECUTIVE_APPROVAL_ABOVE_GBP,
  LIFETIME_CAP_PER_CUSTOMER_GBP,
  MANUAL_REVIEW_ABOVE_GBP,
  MIN_TRANSACTION_GBP,
  MONTHLY_CAP_GBP,
  NEVER_COMMISSIONABLE,
  PAYOUT_MINIMUM_GBP,
  REFERRAL_STATES,
  REWARD_LADDER,
  TRUST_SIGNAL_DEFINITIONS,
  VALIDATION_WINDOW_DAYS,
  canTransitionReferral,
  cashEligible,
  commissionFor,
  countsTowardsLadder,
  nextRung,
  payoutDecision,
  statusFor,
  trustScore,
  verifiedNetRevenue,
  type RevenueInput,
} from '@jessmove/shared';

const revenue = (over: Partial<RevenueInput> = {}): RevenueInput => ({
  paymentReceivedGbp: 1000,
  taxGbp: 0,
  paymentFeesGbp: 0,
  refundsGbp: 0,
  chargebacksGbp: 0,
  discountsGbp: 0,
  creditsGbp: 0,
  freeAcuValueGbp: 0,
  promotionalValueGbp: 0,
  fraudDeductionsGbp: 0,
  ...over,
});

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

test('the ladder is strictly ascending', () => {
  for (let i = 1; i < REWARD_LADDER.length; i += 1) {
    assert.ok(
      REWARD_LADDER[i]!.paidReferrals > REWARD_LADDER[i - 1]!.paidReferrals,
      'ladder rungs must ascend',
    );
  }
});

test('cash unlocks at exactly one rung, and it is twenty', () => {
  const first = REWARD_LADDER.find((r) => r.cashUnlocked);
  assert.equal(first?.paidReferrals, COMMISSION_UNLOCK_REFERRALS);
  assert.equal(first?.status, 'verified_growth_referrer');
  // Every rung above it also pays cash — the unlock cannot be lost by climbing.
  const after = REWARD_LADDER.filter((r) => r.paidReferrals >= COMMISSION_UNLOCK_REFERRALS);
  assert.ok(after.every((r) => r.cashUnlocked));
});

test('status is derived from the referral count', () => {
  assert.equal(statusFor(0), null);
  assert.equal(statusFor(1), 'starter');
  assert.equal(statusFor(4), 'starter');
  assert.equal(statusFor(19), 'builder');
  assert.equal(statusFor(20), 'verified_growth_referrer');
  assert.equal(statusFor(500), 'elite_referrer');
});

test('the next rung is the next one up, and null at the top', () => {
  assert.equal(nextRung(0)?.paidReferrals, 1);
  assert.equal(nextRung(10)?.paidReferrals, 20);
  assert.equal(nextRung(100), null);
});

/* ------------------------------------------------------------------ *
 * Eligibility
 * ------------------------------------------------------------------ */

test('a normal referrer earns no cash below twenty', () => {
  assert.equal(cashEligible('normal', 19), false);
  assert.equal(cashEligible('normal', 20), true);
});

test('an approved influencer earns from the first referral', () => {
  assert.equal(cashEligible('approved_influencer', 0), true);
});

test('an ineligible partner accrues nothing in cash and is told what is missing', () => {
  const result = commissionFor(revenue(), {
    kind: 'normal',
    verifiedPaidReferrals: 13,
    lifetimeAlreadyPaidGbp: 0,
  });
  assert.equal(result.commissionGbp, 0);
  assert.equal(result.eligible, false);
  assert.match(result.reason, /7 to go/);
  // The gross figure is still computed, so the partner can see what is waiting.
  assert.equal(result.grossCommissionGbp, 10);
});

/* ------------------------------------------------------------------ *
 * Verified Net Revenue
 * ------------------------------------------------------------------ */

test('every deduction reduces the commissionable base', () => {
  const net = verifiedNetRevenue(
    revenue({
      paymentReceivedGbp: 1000,
      taxGbp: 166.67,
      paymentFeesGbp: 21.5,
      refundsGbp: 50,
      chargebacksGbp: 30,
      discountsGbp: 40,
      creditsGbp: 10,
      freeAcuValueGbp: 15,
      promotionalValueGbp: 25,
      fraudDeductionsGbp: 5,
    }),
  );
  assert.equal(net, 636.83);
});

test('net revenue floors at zero — a heavy refund never produces negative commission', () => {
  const net = verifiedNetRevenue(revenue({ paymentReceivedGbp: 100, refundsGbp: 400 }));
  assert.equal(net, 0);
  const result = commissionFor(
    revenue({ paymentReceivedGbp: 100, refundsGbp: 400 }),
    { kind: 'approved_influencer', verifiedPaidReferrals: 0, lifetimeAlreadyPaidGbp: 0 },
  );
  assert.equal(result.commissionGbp, 0);
});

test('commission is one per cent of net, not of gross', () => {
  const result = commissionFor(
    revenue({ paymentReceivedGbp: 1000, taxGbp: 200, paymentFeesGbp: 30 }),
    { kind: 'approved_influencer', verifiedPaidReferrals: 0, lifetimeAlreadyPaidGbp: 0 },
  );
  assert.equal(result.netRevenueGbp, 770);
  assert.equal(result.commissionGbp, 7.7);
  assert.notEqual(result.commissionGbp, 1000 * COMMISSION_RATE);
});

test('the things that are never commissionable are named, not implied', () => {
  for (const term of ['free trials', 'chargebacks', 'self-referrals', 'duplicate accounts']) {
    assert.ok(NEVER_COMMISSIONABLE.includes(term), `${term} must be listed`);
  }
});

/* ------------------------------------------------------------------ *
 * Caps
 * ------------------------------------------------------------------ */

test('there is no monthly cap', () => {
  assert.equal(MONTHLY_CAP_GBP, null);
});

test('the per-customer lifetime cap binds', () => {
  const result = commissionFor(revenue({ paymentReceivedGbp: 100_000 }), {
    kind: 'approved_influencer',
    verifiedPaidReferrals: 0,
    lifetimeAlreadyPaidGbp: 19_950,
  });
  assert.equal(result.grossCommissionGbp, 1000);
  assert.equal(result.commissionGbp, 50);
  assert.equal(result.cappedBy, 'lifetime_customer_cap');
  assert.equal(result.lifetimeToDateGbp, LIFETIME_CAP_PER_CUSTOMER_GBP);
});

test('a partner already at the cap earns nothing more on that customer', () => {
  const result = commissionFor(revenue({ paymentReceivedGbp: 50_000 }), {
    kind: 'approved_influencer',
    verifiedPaidReferrals: 0,
    lifetimeAlreadyPaidGbp: LIFETIME_CAP_PER_CUSTOMER_GBP,
  });
  assert.equal(result.commissionGbp, 0);
  assert.equal(result.cappedBy, 'lifetime_customer_cap');
});

test('the cap is per customer, so a second customer starts fresh', () => {
  const capped = commissionFor(revenue({ paymentReceivedGbp: 10_000 }), {
    kind: 'approved_influencer',
    verifiedPaidReferrals: 0,
    lifetimeAlreadyPaidGbp: LIFETIME_CAP_PER_CUSTOMER_GBP,
  });
  const fresh = commissionFor(revenue({ paymentReceivedGbp: 10_000 }), {
    kind: 'approved_influencer',
    verifiedPaidReferrals: 0,
    lifetimeAlreadyPaidGbp: 0,
  });
  assert.equal(capped.commissionGbp, 0);
  assert.equal(fresh.commissionGbp, 100);
});

/* ------------------------------------------------------------------ *
 * Trust
 * ------------------------------------------------------------------ */

test('a clean referral verifies at full score', () => {
  const t = trustScore([]);
  assert.equal(t.score, 100);
  assert.equal(t.verdict, 'verified');
});

test('a shared card is fatal regardless of everything else', () => {
  const t = trustScore(['same_payment_card']);
  assert.equal(t.verdict, 'rejected');
  assert.deepEqual(t.fatal, ['same_payment_card']);
  assert.match(t.reason, /Same payment card/);
});

test('a self-referral, a duplicate account and an existing customer are all fatal', () => {
  for (const s of ['self_referral_match', 'duplicate_account', 'existing_customer'] as const) {
    assert.equal(trustScore([s]).verdict, 'rejected', s);
  }
});

test('soft signals accumulate into a hold before they reject', () => {
  assert.equal(trustScore(['vpn_or_proxy']).verdict, 'verified');
  assert.equal(trustScore(['same_ip', 'vpn_or_proxy']).verdict, 'held');
  assert.equal(trustScore(['same_device', 'velocity_spike']).verdict, 'rejected');
});

test('a repeated signal is not counted twice', () => {
  assert.equal(
    trustScore(['same_ip', 'same_ip', 'same_ip']).score,
    trustScore(['same_ip']).score,
  );
});

test('the score never goes below zero', () => {
  const all = Object.keys(TRUST_SIGNAL_DEFINITIONS) as (keyof typeof TRUST_SIGNAL_DEFINITIONS)[];
  assert.equal(trustScore(all).score, 0);
});

/* ------------------------------------------------------------------ *
 * The referral lifecycle
 * ------------------------------------------------------------------ */

test('the reward path runs forward only', () => {
  assert.ok(canTransitionReferral('pending', 'verified'));
  assert.ok(canTransitionReferral('verified', 'approved'));
  assert.ok(canTransitionReferral('approved', 'paid'));
  assert.equal(canTransitionReferral('paid', 'approved'), false);
  assert.equal(canTransitionReferral('verified', 'pending'), false);
});

test('a paid referral can still be reversed — a refund arrives after the money leaves', () => {
  assert.ok(canTransitionReferral('paid', 'reversed'));
});

test('rejected and reversed are terminal', () => {
  for (const s of ['rejected', 'reversed'] as const) {
    for (const to of REFERRAL_STATES) {
      assert.equal(canTransitionReferral(s, to), false, `${s} -> ${to}`);
    }
  }
});

test('a held referral can recover or be rejected, and nothing else', () => {
  assert.ok(canTransitionReferral('held', 'verified'));
  assert.ok(canTransitionReferral('held', 'rejected'));
  assert.equal(canTransitionReferral('held', 'paid'), false);
});

test('only approved and paid referrals count towards the ladder', () => {
  assert.equal(countsTowardsLadder('approved'), true);
  assert.equal(countsTowardsLadder('paid'), true);
  for (const s of ['pending', 'verified', 'held', 'rejected', 'reversed'] as const) {
    assert.equal(countsTowardsLadder(s), false, s);
  }
});

/* ------------------------------------------------------------------ *
 * Payouts
 * ------------------------------------------------------------------ */

const payout = (over: Partial<Parameters<typeof payoutDecision>[0]> = {}) =>
  payoutDecision({
    balanceGbp: 120,
    kycComplete: true,
    oldestEarningAgeDays: 45,
    ...over,
  });

test('a clean balance pays out', () => {
  const d = payout();
  assert.equal(d.payableGbp, 120);
  assert.deepEqual(d.blocked, []);
});

test('the payout minimum sits above the platform minimum charge', () => {
  assert.ok(PAYOUT_MINIMUM_GBP > MIN_TRANSACTION_GBP);
  assert.equal(payout({ balanceGbp: 20 }).blocked.includes('below_minimum'), true);
});

test('a blocked payout is carried forward, never forfeited', () => {
  const d = payout({ balanceGbp: 20 });
  assert.equal(d.payableGbp, 0);
  assert.equal(d.carriedForwardGbp, 20);
});

test('KYC is required before any money moves', () => {
  const d = payout({ kycComplete: false });
  assert.ok(d.blocked.includes('kyc_incomplete'));
  assert.equal(d.payableGbp, 0);
});

test('earnings inside the validation window are not payable yet', () => {
  assert.ok(
    payout({ oldestEarningAgeDays: VALIDATION_WINDOW_DAYS.min - 1 }).blocked.includes(
      'inside_validation_window',
    ),
  );
  assert.deepEqual(payout({ oldestEarningAgeDays: VALIDATION_WINDOW_DAYS.min }).blocked, []);
});

test('a chargeback clawback is deducted from the balance', () => {
  const d = payout({ balanceGbp: 120, clawbackGbp: 100 });
  assert.equal(d.payableGbp, 0);
  assert.ok(d.blocked.includes('below_minimum'));
  assert.equal(d.carriedForwardGbp, 20);
});

test('a clawback larger than the balance is a negative balance, not a payout', () => {
  const d = payout({ balanceGbp: 50, clawbackGbp: 200 });
  assert.ok(d.blocked.includes('negative_balance'));
  assert.equal(d.payableGbp, 0);
  assert.equal(d.carriedForwardGbp, 0);
});

test('large payouts escalate', () => {
  assert.equal(payout({ balanceGbp: 900 }).requiresManualReview, false);
  assert.equal(payout({ balanceGbp: MANUAL_REVIEW_ABOVE_GBP + 1 }).requiresManualReview, true);
  assert.equal(
    payout({ balanceGbp: EXECUTIVE_APPROVAL_ABOVE_GBP + 1 }).requiresExecutiveApproval,
    true,
  );
});

test('an executive-approval payout also requires manual review', () => {
  const d = payout({ balanceGbp: EXECUTIVE_APPROVAL_ABOVE_GBP + 1 });
  assert.equal(d.requiresManualReview, true);
  assert.equal(d.requiresExecutiveApproval, true);
});

test('every decision explains itself', () => {
  for (const d of [payout(), payout({ balanceGbp: 5 }), payout({ kycComplete: false })]) {
    assert.ok(d.reason.length > 8);
  }
});
