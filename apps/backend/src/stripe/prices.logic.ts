import { PLAN_DEFINITIONS, type BillingPlan } from '@jessmove/shared';

/**
 * Price discovery — Stripe is the admin panel.
 *
 * Each price in Stripe carries metadata `plan` (premium_monthly,
 * family_annual, …). The backend lists active prices and matches on that
 * metadata, so changing a price is done where prices are managed — in
 * the Stripe dashboard — and no environment variable needs editing. The
 * STRIPE_PRICE_* variables still work as explicit overrides for anyone
 * who wants to pin a specific ID.
 */

export interface StripePriceLike {
  readonly id: string;
  readonly active?: boolean;
  readonly metadata?: Readonly<Record<string, string>>;
}

const KNOWN_PLANS = new Set(Object.keys(PLAN_DEFINITIONS));

/**
 * Stripe lists newest first; the first active price per plan wins, so
 * replacing a price in the dashboard takes effect on the next refresh
 * with no code or configuration change.
 */
export function matchPricesByPlan(prices: readonly StripePriceLike[]): Map<BillingPlan, string> {
  const byPlan = new Map<BillingPlan, string>();
  for (const price of prices) {
    const plan = price.metadata?.plan;
    if (!plan || !KNOWN_PLANS.has(plan)) continue;
    if (price.active === false) continue;
    if (!byPlan.has(plan as BillingPlan)) byPlan.set(plan as BillingPlan, price.id);
  }
  return byPlan;
}

/** How long a discovery result is trusted before the next listing. */
export const PRICE_CACHE_MS = 5 * 60 * 1000;
