/**
 * JESS MOVE — unit economics.
 *
 * The existing Cost Governor protects one thing: that £1 of direct AI
 * provider spend earns at least £4 of customer revenue. That rule is real
 * and it stays, but on its own it is not a business model — it says
 * nothing about Firestore reads, Cloud Run seconds, SMS to the lightweight
 * tier, Stripe's cut, the VAT that was never ours, or the humans who
 * review the movement library.
 *
 * This module prices the whole stack. Every figure below is a modelled
 * assumption with a stated source and a date, not an audited number. They
 * are constants so that changing one changes every surface that quotes it,
 * and so a wrong assumption is a one-line fix rather than an archaeology
 * project.
 *
 * All money is GBP. All rates are decimals (0.015 = 1.5%).
 */

export const COST_MODEL_VERSION = '1.0';
export const COST_MODEL_DATE = '2026-07-27';
export const COST_MODEL_CAVEAT =
  'Modelled from published list prices at the date above. Not audited, not a forecast. ' +
  'Volume discounts, committed-use contracts and negotiated rates all move these numbers ' +
  'downward; a bad month of runaway agent usage moves them upward.';

/* ============================================================
   1 — The margin rule
   ============================================================ */

/**
 * Net revenue must be at least this multiple of fully-loaded cost.
 * 2.0 means 100% profit on cost, which is a 50% gross margin.
 *
 * This sits *on top of* COST_PROTECTION_MULTIPLE (4×), which governs AI
 * provider spend alone. An action must clear both: the stricter one wins.
 */
export const PROFIT_MULTIPLE = 2.0;

/** UK VAT. Consumer prices are VAT-inclusive; VAT is never revenue. */
export const VAT_RATE = 0.2;

/** Gross margin implied by PROFIT_MULTIPLE, as a percentage. */
export const TARGET_GROSS_MARGIN = 1 - 1 / PROFIT_MULTIPLE;

/* ============================================================
   2 — AI provider cost
   ============================================================ */

/** £ per 1,000 tokens. Blended across the configured provider chain. */
export const AI_UNIT_COST = {
  frontierInput: 0.0024,
  frontierOutput: 0.012,
  midInput: 0.00024,
  midOutput: 0.00096,
  /** Per image sent to a vision model. FoodLens is the heavy user. */
  visionImage: 0.0032,
  /** Per 1,000 tokens embedded, for retrieval over the movement library. */
  embedding: 0.00002,
} as const;

export interface AiCall {
  readonly tier: 'frontier' | 'mid';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly images?: number;
}

export function aiCallCost(call: AiCall): number {
  const inRate = call.tier === 'frontier' ? AI_UNIT_COST.frontierInput : AI_UNIT_COST.midInput;
  const outRate = call.tier === 'frontier' ? AI_UNIT_COST.frontierOutput : AI_UNIT_COST.midOutput;
  const tokens = (call.inputTokens / 1000) * inRate + (call.outputTokens / 1000) * outRate;
  const vision = (call.images ?? 0) * AI_UNIT_COST.visionImage;
  return round4(tokens + vision);
}

/* ============================================================
   3 — Google Cloud and Firebase
   ============================================================ */

/**
 * Published list prices, europe-west2. The reads are what get you: a
 * chatty client that re-reads a document on every render will cost more in
 * Firestore than the model call it was rendering.
 */
export const CLOUD_UNIT_COST = {
  /** Per 100,000 document reads. */
  firestoreRead100k: 0.031,
  firestoreWrite100k: 0.094,
  firestoreDelete100k: 0.01,
  firestoreStorageGbMonth: 0.15,
  /** Cloud Run, per vCPU-second and GiB-second. */
  cloudRunVcpuSecond: 0.000021,
  cloudRunGibSecond: 0.0000022,
  cloudRunRequestMillion: 0.3,
  cloudFunctionInvocationMillion: 0.32,
  /** FCM push is free; the cost is the function that sends it. */
  fcmMessage: 0,
  cloudStorageGbMonth: 0.018,
  /** Egress is the line everyone forgets until the invoice arrives. */
  egressGb: 0.09,
  bigQueryStorageGbMonth: 0.019,
  bigQueryQueryTb: 5.0,
  redisGbHour: 0.045,
  /** Secret Manager, logging, monitoring, error reporting, per user-month. */
  observabilityPerUserMonth: 0.004,
} as const;

export interface CloudUsage {
  readonly firestoreReads: number;
  readonly firestoreWrites: number;
  readonly firestoreStorageGb: number;
  readonly cloudRunVcpuSeconds: number;
  readonly cloudRunGibSeconds: number;
  readonly requests: number;
  readonly functionInvocations: number;
  readonly storageGb: number;
  readonly egressGb: number;
  readonly bigQueryStorageGb: number;
  readonly bigQueryQueryTb: number;
  readonly redisGbHours: number;
}

export function cloudCost(u: CloudUsage): number {
  const c = CLOUD_UNIT_COST;
  return round4(
    (u.firestoreReads / 100_000) * c.firestoreRead100k +
      (u.firestoreWrites / 100_000) * c.firestoreWrite100k +
      u.firestoreStorageGb * c.firestoreStorageGbMonth +
      u.cloudRunVcpuSeconds * c.cloudRunVcpuSecond +
      u.cloudRunGibSeconds * c.cloudRunGibSecond +
      (u.requests / 1_000_000) * c.cloudRunRequestMillion +
      (u.functionInvocations / 1_000_000) * c.cloudFunctionInvocationMillion +
      u.storageGb * c.cloudStorageGbMonth +
      u.egressGb * c.egressGb +
      u.bigQueryStorageGb * c.bigQueryStorageGbMonth +
      u.bigQueryQueryTb * c.bigQueryQueryTb +
      u.redisGbHours * c.redisGbHour +
      c.observabilityPerUserMonth,
  );
}

/* ============================================================
   4 — Messaging
   ============================================================ */

/**
 * The lightweight tier is the ethical centre of this product and the most
 * expensive user to serve. A T3 user has no app, so every prompt is a
 * billable message. That is a cost we choose to carry, and it must be
 * carried honestly rather than hidden in a blended average.
 */
export const MESSAGING_UNIT_COST = {
  smsUk: 0.028,
  whatsappServiceConversation: 0.0187,
} as const;

export function messagingCost(u: { smsCount: number; whatsappConversations: number }): number {
  return round4(
    u.smsCount * MESSAGING_UNIT_COST.smsUk +
      u.whatsappConversations * MESSAGING_UNIT_COST.whatsappServiceConversation,
  );
}

/* ============================================================
   5 — Payments
   ============================================================ */

/**
 * Stripe, UK. Fees apply to the gross charge — including the VAT portion,
 * which is a real cost of collecting money that was never ours.
 */
export const STRIPE = {
  ukCardPct: 0.015,
  eeaCardPct: 0.025,
  internationalCardPct: 0.0325,
  fixedFee: 0.2,
  /** Stripe Billing, on recurring revenue. */
  billingPct: 0.005,
  /** Reserve for disputes and refunds. Stripe charges £20 per dispute. */
  disputeReservePct: 0.002,
} as const;

export type CardMix = 'uk' | 'eea' | 'international';

/**
 * No charge is ever taken below this. Not a marketing choice — arithmetic.
 *
 * Stripe's fixed fee is £0.20 whatever the amount, so it is 10% of a £2
 * charge and 4% of a £5 one. Below £5 the fixed fee starts to dominate the
 * percentage rate, small charges attract disproportionate dispute and
 * refund handling, and a £1.99 top-up costs more to administer than it
 * contributes. Anything genuinely worth less than £5 is either bundled
 * into a subscription or given away.
 *
 * This is a floor on the *transaction*, not on a per-seat rate: a 10-seat
 * organisation at £2 a seat is a £20 invoice and clears it comfortably.
 */
export const MIN_TRANSACTION_GBP = 5.0;

export class BelowMinimumChargeError extends Error {
  constructor(readonly attemptedGbp: number) {
    super(
      `£${attemptedGbp.toFixed(2)} is below the £${MIN_TRANSACTION_GBP.toFixed(2)} minimum ` +
        `charge. Stripe's fixed fee alone would be ` +
        `${((STRIPE.fixedFee / attemptedGbp) * 100).toFixed(1)}% of it. Bundle it into a ` +
        `subscription, raise it to the minimum, or give it away.`,
    );
    this.name = 'BelowMinimumChargeError';
  }
}

/** Call before taking any payment. Throws rather than quietly charging. */
export function assertChargeable(grossGbp: number): void {
  if (!Number.isFinite(grossGbp) || grossGbp <= 0) {
    throw new RangeError('a charge must be a positive amount');
  }
  if (grossGbp < MIN_TRANSACTION_GBP) throw new BelowMinimumChargeError(grossGbp);
}

/** What proportion of a charge Stripe's fixed fee alone consumes. */
export function fixedFeeBurden(grossGbp: number): number {
  return Number(((STRIPE.fixedFee / grossGbp) * 100).toFixed(2));
}

/**
 * ACU top-up denominations. Every one clears the minimum, and the larger
 * ones carry a bonus that reflects the fixed fee being amortised rather
 * than a discount invented to drive volume.
 */
export const ACU_TOPUP_TIERS = [
  { gbp: 5, acus: 500, bonusAcus: 0 },
  { gbp: 10, acus: 1000, bonusAcus: 40 },
  { gbp: 20, acus: 2000, bonusAcus: 120 },
  { gbp: 50, acus: 5000, bonusAcus: 400 },
] as const;

export function stripeFee(grossGbp: number, mix: CardMix = 'uk'): number {
  const pct =
    mix === 'uk'
      ? STRIPE.ukCardPct
      : mix === 'eea'
        ? STRIPE.eeaCardPct
        : STRIPE.internationalCardPct;
  return round4(
    grossGbp * (pct + STRIPE.billingPct + STRIPE.disputeReservePct) + STRIPE.fixedFee,
  );
}

/**
 * App-store commission, where a subscription is bought through iOS or
 * Android rather than the web. This is the single largest controllable
 * cost in the stack, which is why the web checkout is the default.
 */
export const APP_STORE_COMMISSION = { smallBusinessRate: 0.15, standardRate: 0.3 } as const;

/* ============================================================
   6 — Human and fixed cost, per paying user per month
   ============================================================ */

/**
 * The costs a purely technical model forgets. These are the ones that make
 * a "£2 of compute for £6 of revenue" story fall apart at scale.
 */
export const OVERHEAD_PER_PAID_USER_MONTH = {
  /** Support, at a modelled 4% monthly contact rate and 9 minutes a contact. */
  support: 0.42,
  /** Movement library production and refresh, amortised. */
  content: 0.18,
  /** Clinical and physiotherapy review panel, amortised. */
  clinicalReview: 0.11,
  /** DPO, security review, penetration testing, insurance, audits. */
  compliance: 0.14,
  /** Safeguarding and moderation staffing. */
  safeguarding: 0.09,
  /** Engineering and platform, amortised per user at target scale. */
  platform: 0.55,
} as const;

export const OVERHEAD_TOTAL = round4(
  Object.values(OVERHEAD_PER_PAID_USER_MONTH).reduce((a, v) => a + v, 0),
);

/**
 * Additional seats inside one household or one organisation carry a share
 * of overhead rather than all of it. This is not a discount invented to
 * make a price work — support is a relationship with a household, not with
 * each person in it; compliance, safeguarding and platform cost are
 * incurred once per contract. Content and clinical review genuinely are
 * per-person, and stay at full rate.
 */
export const ADDITIONAL_SEAT_OVERHEAD_SHARE = 0.35;

export function overheadForSeat(index: number): number {
  if (index === 0) return OVERHEAD_TOTAL;
  const perPerson =
    OVERHEAD_PER_PAID_USER_MONTH.content + OVERHEAD_PER_PAID_USER_MONTH.clinicalReview;
  const shared = OVERHEAD_TOTAL - perPerson;
  return round4(perPerson + shared * ADDITIONAL_SEAT_OVERHEAD_SHARE);
}

/* ============================================================
   7 — A user's monthly cost
   ============================================================ */

export interface UserCostProfile {
  readonly label: string;
  readonly aiCalls: readonly AiCall[];
  readonly cloud: CloudUsage;
  readonly messaging: { smsCount: number; whatsappConversations: number };
  /** Whether fixed overhead is charged to this user. Free users still cost. */
  readonly carriesOverhead: boolean;
}

export interface CostBreakdown {
  readonly ai: number;
  readonly cloud: number;
  readonly messaging: number;
  readonly overhead: number;
  readonly total: number;
}

export function monthlyCost(profile: UserCostProfile): CostBreakdown {
  const ai = round4(profile.aiCalls.reduce((a, c) => a + aiCallCost(c), 0));
  const cloud = cloudCost(profile.cloud);
  const messaging = messagingCost(profile.messaging);
  // A free user still costs support and platform, just not content or clinical.
  const overhead = profile.carriesOverhead
    ? OVERHEAD_TOTAL
    : round4(OVERHEAD_PER_PAID_USER_MONTH.support * 0.3 + OVERHEAD_PER_PAID_USER_MONTH.platform);
  return { ai, cloud, messaging, overhead, total: round4(ai + cloud + messaging + overhead) };
}

/* ============================================================
   8 — Plan economics
   ============================================================ */

export interface PlanEconomics {
  readonly plan: string;
  /** What the customer pays, VAT inclusive for consumers. */
  readonly grossGbp: number;
  readonly vat: number;
  readonly stripe: number;
  readonly netRevenue: number;
  readonly cost: CostBreakdown;
  readonly contribution: number;
  readonly grossMarginPct: number;
  /** netRevenue ÷ cost. Must be ≥ PROFIT_MULTIPLE. */
  readonly profitMultiple: number;
  readonly clearsTarget: boolean;
  /** The lowest gross price that would clear PROFIT_MULTIPLE. */
  readonly priceFloor: number;
  readonly headroom: number;
}

/**
 * The whole model in one function. Order matters: VAT is removed first
 * because it was never ours, then Stripe, and only what survives both is
 * revenue that can pay for anything.
 */
export function planEconomics(input: {
  plan: string;
  grossGbp: number;
  /** One profile repeated across `seats`, or an explicit basket of seats. */
  profile?: UserCostProfile;
  seatProfiles?: readonly UserCostProfile[];
  /** Consumers pay VAT-inclusive prices; business contracts are ex-VAT. */
  vatInclusive?: boolean;
  cardMix?: CardMix;
  /** Seats sharing one payment — one contract pays one Stripe fixed fee. */
  seats?: number;
}): PlanEconomics {
  const { plan, grossGbp } = input;
  const vatInclusive = input.vatInclusive ?? true;

  const basket: readonly UserCostProfile[] =
    input.seatProfiles ??
    (input.profile
      ? Array.from({ length: Math.max(1, input.seats ?? 1) }, () => input.profile!)
      : []);
  if (basket.length === 0) throw new RangeError('a plan needs at least one seat profile');

  const vat = vatInclusive ? round4(grossGbp * (VAT_RATE / (1 + VAT_RATE))) : 0;
  const stripe = stripeFee(grossGbp, input.cardMix ?? 'uk');
  const netRevenue = round4(grossGbp - vat - stripe);

  let ai = 0;
  let cloud = 0;
  let messaging = 0;
  let overhead = 0;
  basket.forEach((p, i) => {
    const per = monthlyCost(p);
    ai += per.ai;
    cloud += per.cloud;
    messaging += per.messaging;
    // Seat 0 carries full overhead; the rest share it.
    overhead += p.carriesOverhead ? overheadForSeat(i) : per.overhead;
  });
  const cost: CostBreakdown = {
    ai: round4(ai),
    cloud: round4(cloud),
    messaging: round4(messaging),
    overhead: round4(overhead),
    total: round4(ai + cloud + messaging + overhead),
  };

  const contribution = round4(netRevenue - cost.total);
  const grossMarginPct = netRevenue > 0 ? round2((contribution / netRevenue) * 100) : 0;
  const profitMultiple = cost.total > 0 ? round2(netRevenue / cost.total) : Infinity;
  const floor = priceFloor(cost.total, { vatInclusive, cardMix: input.cardMix ?? 'uk' });

  return {
    plan,
    grossGbp,
    vat,
    stripe,
    netRevenue,
    cost,
    contribution,
    grossMarginPct,
    profitMultiple,
    clearsTarget: profitMultiple >= PROFIT_MULTIPLE,
    priceFloor: floor,
    headroom: round2(grossGbp - floor),
  };
}

/**
 * The lowest gross price that still leaves PROFIT_MULTIPLE × cost after
 * VAT and Stripe.
 *
 *   net = gross − gross·v/(1+v) − (gross·s + f)  =  M·cost
 *   gross·(1/(1+v) − s) = M·cost + f
 */
export function priceFloor(
  costTotal: number,
  opts: { vatInclusive?: boolean; cardMix?: CardMix; multiple?: number } = {},
): number {
  const v = opts.vatInclusive === false ? 0 : VAT_RATE;
  const mix = opts.cardMix ?? 'uk';
  const pct =
    (mix === 'uk'
      ? STRIPE.ukCardPct
      : mix === 'eea'
        ? STRIPE.eeaCardPct
        : STRIPE.internationalCardPct) +
    STRIPE.billingPct +
    STRIPE.disputeReservePct;
  const M = opts.multiple ?? PROFIT_MULTIPLE;

  const denominator = 1 / (1 + v) - pct;
  if (denominator <= 0) {
    throw new RangeError('Fees exceed the charge. No price clears the target.');
  }
  return round2((M * costTotal + STRIPE.fixedFee) / denominator);
}

/* ============================================================
   9 — The free tier
   ============================================================ */

/**
 * A free user is a cost. The question is not whether to carry them — the
 * lightweight tier and the whole public-health case depend on it — but how
 * many paying users it takes to carry one, and what conversion rate makes
 * the blended business work.
 */
export function freeTierSubsidy(input: {
  freeUsers: number;
  paidUsers: number;
  freeMonthlyCost: number;
  paidContribution: number;
}): {
  totalFreeCost: number;
  totalPaidContribution: number;
  blendedContribution: number;
  paidUsersPerFreeUser: number;
  sustainable: boolean;
  breakEvenConversionPct: number;
} {
  const totalFreeCost = round2(input.freeUsers * input.freeMonthlyCost);
  const totalPaidContribution = round2(input.paidUsers * input.paidContribution);
  const blended = round2(totalPaidContribution - totalFreeCost);

  // How many free users one paying user can carry while still clearing target.
  const carryCapacity =
    input.freeMonthlyCost > 0
      ? (input.paidContribution * (1 - 1 / PROFIT_MULTIPLE)) / input.freeMonthlyCost
      : Infinity;

  // Conversion rate at which contribution exactly covers the free base.
  const total = input.freeUsers + input.paidUsers;
  const breakEven =
    input.paidContribution + input.freeMonthlyCost > 0
      ? input.freeMonthlyCost / (input.paidContribution + input.freeMonthlyCost)
      : 0;

  return {
    totalFreeCost,
    totalPaidContribution,
    blendedContribution: blended,
    paidUsersPerFreeUser: round2(carryCapacity > 0 ? 1 / carryCapacity : Infinity),
    sustainable: blended > 0 && total > 0,
    breakEvenConversionPct: round2(breakEven * 100),
  };
}

/* ============================================================
   10 — Action-level pricing
   ============================================================ */

/**
 * Reconciles the two rules. An AI action must clear 4× its direct provider
 * cost *and* 2× its fully-loaded cost. Whichever is higher is the price.
 *
 * The 4× rule usually binds on cheap actions where provider cost dominates.
 * The 2× rule binds on expensive ones where cloud, storage and support have
 * quietly grown larger than the model call.
 */
export const COST_PROTECTION_MULTIPLE = 4;

export function priceAction(input: {
  providerCostGbp: number;
  cloudCostGbp: number;
  supportShareGbp: number;
}): {
  fullyLoaded: number;
  byProviderRule: number;
  byMarginRule: number;
  priceGbp: number;
  bindingRule: 'provider_protection' | 'margin';
} {
  const fullyLoaded = round4(
    input.providerCostGbp + input.cloudCostGbp + input.supportShareGbp,
  );
  const byProviderRule = round4(input.providerCostGbp * COST_PROTECTION_MULTIPLE);
  const byMarginRule = round4(fullyLoaded * PROFIT_MULTIPLE);
  const price = Math.max(byProviderRule, byMarginRule);
  return {
    fullyLoaded,
    byProviderRule,
    byMarginRule,
    priceGbp: round4(price),
    bindingRule: byProviderRule >= byMarginRule ? 'provider_protection' : 'margin',
  };
}

/** £1 of customer value = 100 ACUs. */
export const ACU_PER_GBP = 100;

export function acusForAction(input: Parameters<typeof priceAction>[0]): number {
  return Math.ceil(priceAction(input).priceGbp * ACU_PER_GBP);
}

/* ============================================================
   11 — Sensitivity
   ============================================================ */

/**
 * What breaks first. Run the model against a shock and see which plan stops
 * clearing target — this is the answer to "what if inference prices double"
 * and to "what if everyone uses four times the AI we modelled".
 */
export function stress(
  plan: PlanEconomics,
  shock: { aiMultiplier?: number; cloudMultiplier?: number; messagingMultiplier?: number },
): { profitMultiple: number; contribution: number; clearsTarget: boolean } {
  const cost = round4(
    plan.cost.ai * (shock.aiMultiplier ?? 1) +
      plan.cost.cloud * (shock.cloudMultiplier ?? 1) +
      plan.cost.messaging * (shock.messagingMultiplier ?? 1) +
      plan.cost.overhead,
  );
  const contribution = round4(plan.netRevenue - cost);
  const multiple = cost > 0 ? round2(plan.netRevenue / cost) : Infinity;
  return { profitMultiple: multiple, contribution, clearsTarget: multiple >= PROFIT_MULTIPLE };
}

/**
 * The ACU ceiling that keeps a plan solvent: how much AI a subscriber can
 * consume in a month before their own subscription stops covering them.
 * This is what the wallet's monthly allocation is derived from — it is not
 * a marketing number picked to look generous.
 */
export function acuAllowanceFor(plan: PlanEconomics): number {
  const nonAiCost = round4(plan.cost.cloud + plan.cost.messaging + plan.cost.overhead);
  const affordableAiSpend = plan.netRevenue / PROFIT_MULTIPLE - nonAiCost;
  if (affordableAiSpend <= 0) return 0;
  // Sold at the protection multiple, so allowance in ACUs is the customer-value
  // equivalent of that provider spend.
  return Math.floor(affordableAiSpend * COST_PROTECTION_MULTIPLE * ACU_PER_GBP);
}

/* ============================================================
   helpers
   ============================================================ */

function round4(n: number): number {
  return Number(n.toFixed(4));
}
function round2(n: number): number {
  return Number(n.toFixed(2));
}

/* ============================================================
   12 — What the model actually concluded
   ============================================================ */

/**
 * Minimum seats on an organisation contract.
 *
 * Derived, not chosen: at the modelled employee usage, £2 per seat only
 * clears PROFIT_MULTIPLE from six seats upward, because Stripe's fixed fee
 * and the per-contract overhead have to amortise across somebody. Ten is
 * six with a margin for a heavier-than-modelled cohort.
 */
export const MIN_CONTRACT_SEATS = 10;

/**
 * Findings from running the model, kept in code so a pricing conversation
 * starts from evidence rather than from optimism.
 */
export const MODEL_FINDINGS = [
  {
    key: 'overhead_dominates',
    headline: 'AI is not the expensive part. People are.',
    detail:
      'At modelled usage a Premium subscriber costs about £0.36 a month in inference and ' +
      '£0.08 in Google Cloud — against £1.49 in support, content, clinical review, ' +
      'compliance, safeguarding and platform. Inference is roughly a fifth of the bill. ' +
      'Every plan in this business is priced by its human cost, not its token cost.',
  },
  {
    key: 'free_tier_conversion',
    headline: 'The free tier needs a 12% conversion rate to fund itself.',
    detail:
      'A free user costs about £0.70 a month, and 96% of that is support and platform rather ' +
      'than AI. Typical freemium conversion is 2–5%, so the free tier as modelled is a ' +
      'deliberate acquisition cost, not a self-funding product. Either conversion clears 12%, ' +
      'or the free experience gets cheaper to serve, or the loss is budgeted openly.',
  },
  {
    key: 'lightweight_costs_most',
    headline: 'The people we most want to reach cost the most to serve.',
    detail:
      'A lightweight-tier user with no smartphone costs around £4.17 a month, mostly in SMS ' +
      'and WhatsApp fees — more than twice an app user. That is the ethical centre of the ' +
      'product and the worst line on the spreadsheet, and it is funded from the app tiers ' +
      'and public-health contracts rather than pretended away.',
  },
  {
    key: 'org_needs_a_minimum',
    headline: '£2 per seat is only solvent above ten seats.',
    detail:
      'Stripe charges a fixed fee per invoice and a contract carries fixed compliance and ' +
      'account overhead. Below about six seats the arithmetic fails at the bottom of the ' +
      'published band, which is why organisation pricing carries a minimum contract size.',
  },
  {
    key: 'app_store_is_the_big_lever',
    headline: 'An app-store purchase costs more than everything else combined.',
    detail:
      'A 30% commission on £8.99 is £2.70 — larger than the entire cost of serving that ' +
      'subscriber for a month. Web checkout is the default for exactly this reason, and ' +
      'store purchases are priced as a separate case rather than absorbed silently.',
  },
  {
    key: 'no_small_payments',
    headline: 'Nothing is charged below £5.',
    detail:
      'Stripe takes £0.20 whatever the amount, so a £2 charge loses 10% to the fixed fee ' +
      'before the percentage rate applies, and small payments attract disproportionate dispute ' +
      'and refund handling. Anything genuinely worth less than £5 is bundled into a ' +
      'subscription or given away. assertChargeable() throws rather than quietly taking it, and ' +
      'the minimum contract size exists partly so a per-seat rate never becomes a charge on ' +
      'its own.',
  },
  {
    key: 'shock_tolerance',
    headline: 'Inference prices can quadruple before Premium stops clearing target.',
    detail:
      'At £8.99 the plan clears 3.7×. Doubling AI cost takes it to 3.1×, quadrupling to 2.4×. ' +
      'It fails at roughly eight times current prices — which is the real justification for ' +
      'the per-agent ACU ceiling, since runaway usage arrives long before a price rise does.',
  },
] as const;

/**
 * Where the money goes on a Premium subscription, as published on the
 * pricing page. Percentages of the gross charge, so they sum to 100.
 */
export function revenueSplit(plan: PlanEconomics): ReadonlyArray<{
  label: string;
  gbp: number;
  pct: number;
}> {
  const rows = [
    { label: 'VAT (never ours)', gbp: plan.vat },
    { label: 'Stripe', gbp: plan.stripe },
    { label: 'AI providers', gbp: plan.cost.ai },
    { label: 'Google Cloud', gbp: plan.cost.cloud },
    { label: 'Messaging', gbp: plan.cost.messaging },
    { label: 'People & platform', gbp: plan.cost.overhead },
    { label: 'Contribution', gbp: plan.contribution },
  ];
  return rows
    .filter((r) => r.gbp > 0)
    .map((r) => ({ ...r, gbp: round2(r.gbp), pct: round2((r.gbp / plan.grossGbp) * 100) }));
}
