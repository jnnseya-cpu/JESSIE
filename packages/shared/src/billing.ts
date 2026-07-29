/**
 * Stripe billing contract.
 *
 * The webhook is the part of a payments integration that people get wrong,
 * and it is wrong in ways that cost money rather than throwing errors. The
 * three rules encoded here:
 *
 *  1. **Verify the signature against the raw body.** A parsed-and-
 *     re-serialised body produces a different string and the signature
 *     will not match — or worse, a lax implementation skips verification
 *     and accepts anything posted to the URL.
 *  2. **Every event is idempotent.** Stripe retries for up to three days
 *     and will happily deliver the same event twice. Granting an
 *     entitlement twice is a real loss.
 *  3. **Only act on events you understand.** Unknown types are
 *     acknowledged with a 200 and ignored, never 4xx'd — a 4xx makes
 *     Stripe retry forever and eventually disable the endpoint.
 */

import { MIN_TRANSACTION_GBP } from './economics';

/* ------------------------------------------------------------------ *
 * Plans
 * ------------------------------------------------------------------ */

export const BILLING_PLANS = [
  'premium_monthly',
  'premium_annual',
  'family_monthly',
  'family_annual',
  'organisation_seat',
] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

export interface PlanDefinition {
  readonly plan: BillingPlan;
  readonly label: string;
  readonly gbp: number;
  readonly interval: 'month' | 'year';
  /** Seats included. Organisation is priced per seat. */
  readonly seats: number;
  /** ACU granted on each successful billing period. */
  readonly acuAllowance: number;
  /** The Stripe Price ID lives in configuration, never in code. */
  readonly priceEnvVar: string;
}

export const PLAN_DEFINITIONS: Readonly<Record<BillingPlan, PlanDefinition>> = {
  premium_monthly: {
    plan: 'premium_monthly',
    label: 'Premium, monthly',
    gbp: 5.99,
    interval: 'month',
    seats: 1,
    acuAllowance: 1_200,
    priceEnvVar: 'STRIPE_PRICE_PREMIUM_MONTHLY',
  },
  premium_annual: {
    plan: 'premium_annual',
    label: 'Premium, annual',
    gbp: 59.99,
    interval: 'year',
    seats: 1,
    acuAllowance: 15_600,
    priceEnvVar: 'STRIPE_PRICE_PREMIUM_ANNUAL',
  },
  family_monthly: {
    plan: 'family_monthly',
    label: 'Family, monthly',
    gbp: 12.99,
    interval: 'month',
    seats: 5,
    acuAllowance: 4_000,
    priceEnvVar: 'STRIPE_PRICE_FAMILY_MONTHLY',
  },
  family_annual: {
    plan: 'family_annual',
    label: 'Family, annual',
    gbp: 129.99,
    interval: 'year',
    seats: 5,
    acuAllowance: 52_000,
    priceEnvVar: 'STRIPE_PRICE_FAMILY_ANNUAL',
  },
  organisation_seat: {
    plan: 'organisation_seat',
    label: 'Organisation, per seat',
    gbp: 2.0,
    interval: 'month',
    seats: 1,
    acuAllowance: 400,
    priceEnvVar: 'STRIPE_PRICE_ORG_SEAT',
  },
};

/** Amounts reach Stripe as integer minor units. Floats never touch money. */
export function toMinorUnits(gbp: number): number {
  if (!Number.isFinite(gbp)) throw new RangeError('an amount must be a finite number');
  return Math.round(gbp * 100);
}

export function fromMinorUnits(pence: number): number {
  return Number((pence / 100).toFixed(2));
}

/* ------------------------------------------------------------------ *
 * Subscription lifecycle
 * ------------------------------------------------------------------ */

export const SUBSCRIPTION_STATES = [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

/** States in which paid features are available. */
export const ENTITLED_STATES: readonly SubscriptionState[] = ['trialing', 'active'];

export function isEntitled(state: SubscriptionState): boolean {
  return ENTITLED_STATES.includes(state);
}

/**
 * `past_due` keeps entitlement for a grace period rather than cutting a
 * person off the moment a card expires. Losing your movement coach because
 * a bank declined a renewal is a bad experience and a churn driver.
 */
export const PAST_DUE_GRACE_DAYS = 7;

/* ------------------------------------------------------------------ *
 * Webhook events
 * ------------------------------------------------------------------ */

/**
 * The events this platform acts on. Everything else is acknowledged and
 * ignored — Stripe sends dozens of types and reacting to one you have not
 * modelled is how double-grants happen.
 */
export const HANDLED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
] as const;
export type HandledWebhookEvent = (typeof HANDLED_WEBHOOK_EVENTS)[number];

export function isHandled(type: string): type is HandledWebhookEvent {
  return (HANDLED_WEBHOOK_EVENTS as readonly string[]).includes(type);
}

/** What each handled event does, in one line. Mirrors the switch in the service. */
export const WEBHOOK_EFFECTS: Readonly<Record<HandledWebhookEvent, string>> = {
  'checkout.session.completed': 'Link the Stripe customer to the account. No entitlement yet.',
  'customer.subscription.created': 'Record the subscription and its state.',
  'customer.subscription.updated': 'Update state, plan and period. Entitlement follows the state.',
  'customer.subscription.deleted': 'End entitlement at the period end already recorded.',
  'invoice.paid': 'Grant the ACU allowance for the period. The only event that grants units.',
  'invoice.payment_failed': 'Move to past_due and start the grace period. Notify the customer.',
  'charge.refunded': 'Reverse the matching allowance and flag any partner commission.',
  'charge.dispute.created': 'Freeze entitlement, flag for review, reverse partner commission.',
  'payment_intent.succeeded': 'Credit a one-off ACU top-up.',
  'payment_intent.payment_failed': 'Record the failure. Nothing is credited.',
};

/**
 * Replay window. Stripe signs with a timestamp; anything older than this
 * is refused, so a captured request cannot be replayed later.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export const WEBHOOK_PATH = '/stripe/webhook';

export class WebhookVerificationError extends Error {
  constructor(reason: string) {
    super(`stripe webhook rejected: ${reason}`);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * A charge must clear the platform's minimum before it is sent to Stripe
 * at all. Below £5 the fixed fee eats an unreasonable share, which is why
 * the floor exists — see economics.ts.
 */
export function assertStripeChargeable(gbp: number): void {
  if (!Number.isFinite(gbp) || gbp <= 0) {
    throw new RangeError('a charge must be a positive amount');
  }
  if (gbp < MIN_TRANSACTION_GBP) {
    throw new RangeError(
      `£${gbp.toFixed(2)} is below the £${MIN_TRANSACTION_GBP.toFixed(2)} minimum charge`,
    );
  }
}
