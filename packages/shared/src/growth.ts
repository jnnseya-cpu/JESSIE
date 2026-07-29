/**
 * The Growth Partner Programme.
 *
 * A controlled growth engine, not a loose referral scheme. The single
 * structural decision that makes it controlled: an ordinary user earns
 * ACUs and privileges first and unlocks cash commission only after twenty
 * *verified paid* referrals. Approved influencers earn commission
 * immediately, under the same fraud, refund and abuse rules.
 *
 * Everything downstream follows from one definition — Verified Net
 * Revenue. Commission is a percentage of money the business actually kept,
 * after tax, fees, refunds, chargebacks, discounts, credits, free units and
 * fraud deductions. A programme that pays on gross is a programme that pays
 * out on revenue it never had, and it is the reason most referral schemes
 * quietly close.
 *
 * These numbers are commercial terms, not internal cost model. They are
 * published to partners in full, which is why they live here rather than in
 * economics.ts.
 */

import { MIN_TRANSACTION_GBP } from './economics';

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

export const PARTNER_STATUSES = [
  'starter',
  'connector',
  'builder',
  'verified_growth_referrer',
  'power_referrer',
  'elite_referrer',
] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export interface LadderRung {
  readonly paidReferrals: number;
  readonly status: PartnerStatus;
  readonly label: string;
  readonly reward: string;
  /** True from the rung where cash commission becomes payable. */
  readonly cashUnlocked: boolean;
}

export const REWARD_LADDER: readonly LadderRung[] = [
  { paidReferrals: 1, status: 'starter', label: 'Starter', reward: 'ACU bonus', cashUnlocked: false },
  { paidReferrals: 5, status: 'connector', label: 'Connector', reward: 'More ACUs, plus a profile badge', cashUnlocked: false },
  { paidReferrals: 10, status: 'builder', label: 'Builder', reward: 'Premium feature access', cashUnlocked: false },
  { paidReferrals: 20, status: 'verified_growth_referrer', label: 'Verified Growth Referrer', reward: 'Unlocks 1% lifetime commission', cashUnlocked: true },
  { paidReferrals: 50, status: 'power_referrer', label: 'Power Referrer', reward: 'Higher privileges and priority support', cashUnlocked: true },
  { paidReferrals: 100, status: 'elite_referrer', label: 'Elite Referrer', reward: 'Partner status', cashUnlocked: true },
];

/** Verified paid referrals required before cash commission unlocks. */
export const COMMISSION_UNLOCK_REFERRALS = 20;

export const COMMISSION_RATE = 0.01;

/** No monthly cap. The only ceiling is per customer, for the life of that customer. */
export const LIFETIME_CAP_PER_CUSTOMER_GBP = 20_000;
export const MONTHLY_CAP_GBP = null;

/** ACU granted at each rung, in units. */
export const LADDER_ACU_REWARD: Readonly<Record<PartnerStatus, number>> = {
  starter: 250,
  connector: 750,
  builder: 1_500,
  verified_growth_referrer: 3_000,
  power_referrer: 7_500,
  elite_referrer: 20_000,
};

export function statusFor(paidReferrals: number): PartnerStatus | null {
  let earned: PartnerStatus | null = null;
  for (const rung of REWARD_LADDER) {
    if (paidReferrals >= rung.paidReferrals) earned = rung.status;
  }
  return earned;
}

export function nextRung(paidReferrals: number): LadderRung | null {
  return REWARD_LADDER.find((r) => r.paidReferrals > paidReferrals) ?? null;
}

/* ------------------------------------------------------------------ *
 * Partner kinds
 * ------------------------------------------------------------------ */

export const PARTNER_KINDS = ['normal', 'verified_growth', 'approved_influencer'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export interface PartnerKindDefinition {
  readonly kind: PartnerKind;
  readonly label: string;
  readonly earnsCashImmediately: boolean;
  readonly summary: string;
}

export const PARTNER_KIND_DEFINITIONS: Readonly<Record<PartnerKind, PartnerKindDefinition>> = {
  normal: {
    kind: 'normal',
    label: 'Normal Referrer',
    earnsCashImmediately: false,
    summary:
      'ACUs, badges, feature privileges, priority support, early access and status upgrades. ' +
      `No cash until ${COMMISSION_UNLOCK_REFERRALS} verified paid referrals.`,
  },
  verified_growth: {
    kind: 'verified_growth',
    label: 'Verified Growth Referrer',
    earnsCashImmediately: true,
    summary:
      `1% lifetime commission, unlocked after ${COMMISSION_UNLOCK_REFERRALS} verified paid ` +
      'referrals, under the same rules as an influencer: no monthly cap, a per-customer ' +
      'lifetime cap, fraud checks, refund deductions and KYC.',
  },
  approved_influencer: {
    kind: 'approved_influencer',
    label: 'Approved Influencer',
    earnsCashImmediately: true,
    summary:
      '1% lifetime commission immediately on verified net revenue — no monthly cap, a ' +
      `£${LIFETIME_CAP_PER_CUSTOMER_GBP.toLocaleString('en-GB')} per-customer lifetime cap, ` +
      'strict fraud and quality checks.',
  },
};

/**
 * Whether a partner may be paid cash right now. An approved influencer is
 * eligible from day one; everybody else has to get to twenty.
 */
export function cashEligible(kind: PartnerKind, verifiedPaidReferrals: number): boolean {
  if (kind === 'approved_influencer') return true;
  return verifiedPaidReferrals >= COMMISSION_UNLOCK_REFERRALS;
}

/* ------------------------------------------------------------------ *
 * Verified Net Revenue — the definition everything else depends on
 * ------------------------------------------------------------------ */

/**
 * Every deduction, named. The order does not matter arithmetically; it is
 * listed in the order it appears on a partner statement so the figure can
 * be reconciled line by line.
 */
export interface RevenueInput {
  /** Money actually received from the customer. Not invoiced — received. */
  readonly paymentReceivedGbp: number;
  readonly taxGbp: number;
  readonly paymentFeesGbp: number;
  readonly refundsGbp: number;
  readonly chargebacksGbp: number;
  readonly discountsGbp: number;
  readonly creditsGbp: number;
  /** The cash value of free ACUs granted against this customer. */
  readonly freeAcuValueGbp: number;
  readonly promotionalValueGbp: number;
  readonly fraudDeductionsGbp: number;
}

export const REVENUE_DEDUCTIONS: readonly (keyof RevenueInput)[] = [
  'taxGbp',
  'paymentFeesGbp',
  'refundsGbp',
  'chargebacksGbp',
  'discountsGbp',
  'creditsGbp',
  'freeAcuValueGbp',
  'promotionalValueGbp',
  'fraudDeductionsGbp',
];

/** Never commissionable, whatever the trust score says. */
export const NEVER_COMMISSIONABLE: readonly string[] = [
  'free users',
  'free trials',
  'free ACUs',
  'refunded payments',
  'failed payments',
  'chargebacks',
  'self-referrals',
  'existing JESS MOVE customers',
  'duplicate accounts',
  'fake users',
  'abusive users',
  'internal and administrative accounts',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Verified Net Revenue. Floors at zero — a customer who refunded more than
 * they paid produces no commission, never a negative one that would then be
 * added to somebody's balance.
 */
export function verifiedNetRevenue(input: RevenueInput): number {
  const deductions = REVENUE_DEDUCTIONS.reduce((sum, key) => sum + (input[key] || 0), 0);
  return round2(Math.max(0, input.paymentReceivedGbp - deductions));
}

export interface CommissionResult {
  readonly netRevenueGbp: number;
  readonly rate: number;
  /** What the rate would pay before the per-customer lifetime cap. */
  readonly grossCommissionGbp: number;
  /** What is actually payable after the cap. */
  readonly commissionGbp: number;
  readonly cappedBy: 'lifetime_customer_cap' | null;
  readonly lifetimeToDateGbp: number;
  readonly eligible: boolean;
  readonly reason: string;
}

/**
 * Commission on one customer's revenue for one period.
 *
 * `lifetimeAlreadyPaidGbp` is what this partner has already earned on this
 * *same customer*, which is what the cap applies to. The cap is per
 * customer for the life of that customer, and there is no monthly cap at
 * all.
 */
export function commissionFor(
  input: RevenueInput,
  opts: {
    kind: PartnerKind;
    verifiedPaidReferrals: number;
    lifetimeAlreadyPaidGbp: number;
  },
): CommissionResult {
  const netRevenueGbp = verifiedNetRevenue(input);
  const eligible = cashEligible(opts.kind, opts.verifiedPaidReferrals);
  const grossCommissionGbp = round2(netRevenueGbp * COMMISSION_RATE);

  if (!eligible) {
    const short = COMMISSION_UNLOCK_REFERRALS - opts.verifiedPaidReferrals;
    return {
      netRevenueGbp,
      rate: COMMISSION_RATE,
      grossCommissionGbp,
      commissionGbp: 0,
      cappedBy: null,
      lifetimeToDateGbp: opts.lifetimeAlreadyPaidGbp,
      eligible: false,
      reason:
        `Cash commission unlocks at ${COMMISSION_UNLOCK_REFERRALS} verified paid referrals — ` +
        `${short} to go. ACUs and privileges accrue in the meantime.`,
    };
  }

  const headroom = Math.max(0, LIFETIME_CAP_PER_CUSTOMER_GBP - opts.lifetimeAlreadyPaidGbp);
  const commissionGbp = round2(Math.min(grossCommissionGbp, headroom));
  const capped = commissionGbp < grossCommissionGbp;

  return {
    netRevenueGbp,
    rate: COMMISSION_RATE,
    grossCommissionGbp,
    commissionGbp,
    cappedBy: capped ? 'lifetime_customer_cap' : null,
    lifetimeToDateGbp: round2(opts.lifetimeAlreadyPaidGbp + commissionGbp),
    eligible: true,
    reason: capped
      ? `Capped at £${LIFETIME_CAP_PER_CUSTOMER_GBP.toLocaleString('en-GB')} lifetime for this customer.`
      : 'Payable on verified net revenue.',
  };
}

/* ------------------------------------------------------------------ *
 * Trust and fraud
 * ------------------------------------------------------------------ */

export const TRUST_SIGNALS = [
  'same_device',
  'same_ip',
  'same_payment_card',
  'same_bank_details',
  'vpn_or_proxy',
  'disposable_email',
  'velocity_spike',
  'self_referral_match',
  'existing_customer',
  'duplicate_account',
  'no_product_usage',
  'immediate_refund',
] as const;
export type TrustSignal = (typeof TRUST_SIGNALS)[number];

export interface TrustSignalDefinition {
  readonly signal: TrustSignal;
  readonly label: string;
  /** Points deducted from a starting score of 100. */
  readonly penalty: number;
  /** True when the signal alone is disqualifying, regardless of score. */
  readonly fatal: boolean;
}

export const TRUST_SIGNAL_DEFINITIONS: Readonly<Record<TrustSignal, TrustSignalDefinition>> = {
  same_device: { signal: 'same_device', label: 'Same device as the referrer', penalty: 45, fatal: false },
  same_ip: { signal: 'same_ip', label: 'Same IP address as the referrer', penalty: 25, fatal: false },
  same_payment_card: { signal: 'same_payment_card', label: 'Same payment card', penalty: 100, fatal: true },
  same_bank_details: { signal: 'same_bank_details', label: 'Same bank details', penalty: 100, fatal: true },
  vpn_or_proxy: { signal: 'vpn_or_proxy', label: 'VPN or proxy at signup', penalty: 15, fatal: false },
  disposable_email: { signal: 'disposable_email', label: 'Disposable email domain', penalty: 30, fatal: false },
  velocity_spike: { signal: 'velocity_spike', label: 'Referral velocity spike', penalty: 35, fatal: false },
  self_referral_match: { signal: 'self_referral_match', label: 'Identity matches the referrer', penalty: 100, fatal: true },
  existing_customer: { signal: 'existing_customer', label: 'Already a customer before the referral', penalty: 100, fatal: true },
  duplicate_account: { signal: 'duplicate_account', label: 'Duplicate of an existing account', penalty: 100, fatal: true },
  no_product_usage: { signal: 'no_product_usage', label: 'Paid but never used the product', penalty: 40, fatal: false },
  immediate_refund: { signal: 'immediate_refund', label: 'Refunded within the validation window', penalty: 60, fatal: false },
};

/** Below this a referral is held for review. Fatal signals reject outright. */
export const TRUST_HOLD_THRESHOLD = 70;
export const TRUST_REJECT_THRESHOLD = 40;

export interface TrustAssessment {
  readonly score: number;
  readonly verdict: 'verified' | 'held' | 'rejected';
  readonly fatal: readonly TrustSignal[];
  readonly signals: readonly TrustSignal[];
  readonly reason: string;
}

export function trustScore(signals: readonly TrustSignal[]): TrustAssessment {
  const unique = [...new Set(signals)];
  const fatal = unique.filter((s) => TRUST_SIGNAL_DEFINITIONS[s].fatal);
  const score = Math.max(
    0,
    100 - unique.reduce((sum, s) => sum + TRUST_SIGNAL_DEFINITIONS[s].penalty, 0),
  );

  if (fatal.length > 0) {
    return {
      score,
      verdict: 'rejected',
      fatal,
      signals: unique,
      reason: `Disqualifying signal: ${fatal.map((f) => TRUST_SIGNAL_DEFINITIONS[f].label).join(', ')}.`,
    };
  }
  if (score < TRUST_REJECT_THRESHOLD) {
    return { score, verdict: 'rejected', fatal, signals: unique, reason: `Trust score ${score} is below ${TRUST_REJECT_THRESHOLD}.` };
  }
  if (score < TRUST_HOLD_THRESHOLD) {
    return { score, verdict: 'held', fatal, signals: unique, reason: `Trust score ${score} is below ${TRUST_HOLD_THRESHOLD} — held for manual review.` };
  }
  return { score, verdict: 'verified', fatal, signals: unique, reason: 'Passed automated checks.' };
}

/* ------------------------------------------------------------------ *
 * Referral and payout lifecycle
 * ------------------------------------------------------------------ */

/** The reward path. A referral moves forward only. */
export const REWARD_PATH = ['pending', 'verified', 'approved', 'paid'] as const;
/** The risk path. Anything that leaves the reward path lands here. */
export const RISK_PATH = ['held', 'rejected', 'reversed'] as const;

export const REFERRAL_STATES = [...REWARD_PATH, ...RISK_PATH] as const;
export type ReferralState = (typeof REFERRAL_STATES)[number];

export const REFERRAL_TRANSITIONS: Readonly<Record<ReferralState, readonly ReferralState[]>> = {
  pending: ['verified', 'held', 'rejected'],
  verified: ['approved', 'held', 'rejected'],
  approved: ['paid', 'held', 'reversed'],
  paid: ['reversed'],
  held: ['verified', 'rejected'],
  rejected: [],
  reversed: [],
};

export function canTransitionReferral(from: ReferralState, to: ReferralState): boolean {
  return REFERRAL_TRANSITIONS[from].includes(to);
}

/** Only these states count towards the ladder. */
export function countsTowardsLadder(state: ReferralState): boolean {
  return state === 'approved' || state === 'paid';
}

/* ------------------------------------------------------------------ *
 * Payouts
 * ------------------------------------------------------------------ */

export const PAYOUT_MINIMUM_GBP = 25;
export const VALIDATION_WINDOW_DAYS = { min: 30, max: 45 } as const;
export const MANUAL_REVIEW_ABOVE_GBP = 1_000;
export const EXECUTIVE_APPROVAL_ABOVE_GBP = 5_000;

export const PAYOUT_RULES: readonly string[] = [
  `£${PAYOUT_MINIMUM_GBP} minimum payout`,
  `${VALIDATION_WINDOW_DAYS.min}–${VALIDATION_WINDOW_DAYS.max} day validation window`,
  'KYC required before the first payout',
  'chargebacks deducted from future earnings',
  `manual review above £${MANUAL_REVIEW_ABOVE_GBP.toLocaleString('en-GB')}`,
  `executive approval above £${EXECUTIVE_APPROVAL_ABOVE_GBP.toLocaleString('en-GB')}`,
  'account suspension for fraud',
];

export type PayoutBlock =
  | 'below_minimum'
  | 'kyc_incomplete'
  | 'inside_validation_window'
  | 'negative_balance';

export interface PayoutDecision {
  readonly payableGbp: number;
  readonly blocked: readonly PayoutBlock[];
  readonly requiresManualReview: boolean;
  readonly requiresExecutiveApproval: boolean;
  readonly carriedForwardGbp: number;
  readonly reason: string;
}

/**
 * Whether a balance can be paid out now.
 *
 * A blocked payout is carried forward, never forfeited. That distinction
 * matters: a scheme that voids a sub-minimum balance is one that keeps
 * money it owes, and partners notice.
 *
 * Note the payout minimum is £25, which is separate from and higher than
 * the platform's £5 minimum charge — the direction of the money is
 * different and so is the fee structure.
 */
export function payoutDecision(opts: {
  balanceGbp: number;
  kycComplete: boolean;
  oldestEarningAgeDays: number;
  clawbackGbp?: number;
}): PayoutDecision {
  const clawback = opts.clawbackGbp ?? 0;
  const net = round2(opts.balanceGbp - clawback);
  const blocked: PayoutBlock[] = [];

  if (net < 0) blocked.push('negative_balance');
  if (!opts.kycComplete) blocked.push('kyc_incomplete');
  if (opts.oldestEarningAgeDays < VALIDATION_WINDOW_DAYS.min) {
    blocked.push('inside_validation_window');
  }
  if (net < PAYOUT_MINIMUM_GBP) blocked.push('below_minimum');

  const payable = blocked.length === 0 ? net : 0;

  return {
    payableGbp: payable,
    blocked,
    requiresManualReview: payable > MANUAL_REVIEW_ABOVE_GBP,
    requiresExecutiveApproval: payable > EXECUTIVE_APPROVAL_ABOVE_GBP,
    carriedForwardGbp: blocked.length === 0 ? 0 : round2(Math.max(0, net)),
    reason:
      blocked.length === 0
        ? payable > EXECUTIVE_APPROVAL_ABOVE_GBP
          ? `£${payable.toFixed(2)} payable, pending executive approval.`
          : payable > MANUAL_REVIEW_ABOVE_GBP
            ? `£${payable.toFixed(2)} payable, pending manual review.`
            : `£${payable.toFixed(2)} payable — past the validation window, KYC complete.`
        : `Held and carried forward: ${blocked.map((b) => b.replace(/_/g, ' ')).join(', ')}.`,
  };
}

/** The published headline, assembled from the constants rather than typed twice. */
export const PROGRAMME_SUMMARY =
  `Normal users earn ACUs and privileges first. After ${COMMISSION_UNLOCK_REFERRALS} verified ` +
  `paid referrals they unlock ${COMMISSION_RATE * 100}% lifetime commission. Approved ` +
  `influencers earn ${COMMISSION_RATE * 100}% immediately. There is no monthly cap; ` +
  `commissions are limited only by a £${LIFETIME_CAP_PER_CUSTOMER_GBP.toLocaleString('en-GB')} ` +
  'lifetime cap per customer and are paid solely on verified net revenue after strict fraud, ' +
  'refund and abuse checks.';

/** Sanity: the payout floor must sit above the platform's minimum charge. */
export const PAYOUT_ABOVE_CHARGE_FLOOR = PAYOUT_MINIMUM_GBP > MIN_TRANSACTION_GBP;
