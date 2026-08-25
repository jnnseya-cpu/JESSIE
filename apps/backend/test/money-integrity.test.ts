import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ACU_TOPUP_TIERS,
  BILLING_PLANS,
  PAST_DUE_GRACE_DAYS,
  PLAN_DEFINITIONS,
  realisedAcuPriceGbp,
  realisedProtectionMultiple,
  topUpAcus,
  topUpTierFor,
  weakestPlanMargin,
} from '@jessmove/shared';
import { ACU_PER_GBP, COST_PROTECTION_MULTIPLE } from '@jessmove/body-command';

/**
 * Every way this platform could lose money that a search of the code could
 * find, and the fix for each.
 *
 * The ones that had already been built correctly are not repeated here —
 * `billing.test.ts` covers webhook idempotency and the signature. What
 * follows is the set that were open.
 *
 * Several are structural assertions rather than behavioural ones. That is
 * deliberate: the defects were absences, and an absence is not something a
 * behavioural test discovers. Nothing failed when `charge.refunded` did
 * nothing, because doing nothing throws no error.
 */

const src = (path: string): string =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/** Comments describe the intent; the assertions are about the code. */
const code = (path: string): string =>
  src(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const WALLET = code('acu/wallet.service.ts');
const STRIPE = code('stripe/stripe.service.ts');
const STRIPE_CONTROLLER = code('stripe/stripe.controller.ts');
const GUARD = code('auth/auth.guard.ts');

/* ------------------------------------------------------------------ *
 * 1 — Spend the allowance, then take the money back
 * ------------------------------------------------------------------ */

test('a refund reverses the allowance it bought', () => {
  /*
   * `charge.refunded` computed the refunded amount and wrote a log line.
   * Top up £50, spend the 5,400 ACU, ask the card issuer for the money
   * back: money returned, compute already paid for by this platform,
   * repeatable indefinitely at no cost to whoever does it.
   */
  assert.match(STRIPE, /case 'charge\.refunded'[\s\S]{0,200}this\.reverse\(/);
  assert.match(WALLET, /async clawback\(/, 'the wallet cannot take allowance back');
});

test('a dispute reverses the allowance and freezes the subscription', () => {
  const branch = STRIPE.slice(STRIPE.indexOf("case 'charge.dispute.created'"));
  assert.match(branch.slice(0, 600), /this\.reverse\(/, 'a dispute reverses nothing');
  assert.match(branch.slice(0, 600), /this\.freezeFor\(/, 'a dispute freezes nothing');
});

test('a reversal never puts a wallet into debt', () => {
  // The unrecoverable part is reported as a shortfall, not carried.
  assert.match(WALLET, /shortfall/, 'the shortfall is not measured');
  assert.doesNotMatch(WALLET, /remaining\s*=\s*-/, 'a grant can go negative');
});

test('a reversal is applied once however many times it is delivered', () => {
  assert.match(WALLET, /claimAdjustment/, 'a reversal has no claim');
  const migration = readFileSync(
    new URL('../../../db/migrations/0027_wallet_integrity.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /UNIQUE \(kind, reference\)/, 'a reversal can be applied twice');
});

/* ------------------------------------------------------------------ *
 * 2 — Two instances spending the same balance
 * ------------------------------------------------------------------ */

test('the wallet is written conditionally on the version it was read at', () => {
  /*
   * The wallet was a Map hydrated once and a whole-object JSON write with
   * no condition on it. Two instances each held a pre-spend copy, each
   * spent, and the second save erased the first — one deduction recorded,
   * two provider calls paid for. On serverless there is always more than
   * one instance, so this was not a rare race.
   *
   * Proved against real Postgres by `pnpm verify:money`, which measures
   * it: eight concurrent writes, eight accepted before and one after.
   */
  assert.match(WALLET, /app_wallets\.version = \$5/, 'the write is unconditional again');
  assert.match(WALLET, /version = app_wallets\.version \+ 1/);
});

test('every mutation reads fresh rather than trusting the cached copy', () => {
  assert.match(WALLET, /private async mutate</, 'there is no single mutation path');
  assert.match(WALLET, /private async reload\(/, 'nothing re-reads the row');

  // The balance check and the draw-down must be inside one mutation, or
  // the check is against a balance that can change before the write.
  const spend = WALLET.slice(WALLET.indexOf('async spend('), WALLET.indexOf('async refund('));
  assert.match(spend, /this\.mutate\(/, 'spend does not run inside a mutation');
  assert.ok(
    spend.indexOf('this.mutate(') < spend.indexOf('insufficient_balance'),
    'the balance is checked outside the mutation that acts on it',
  );
});

test('a spend that cannot be recorded is refused, not allowed', () => {
  /*
   * `persist` used to catch and log. The spend returned allowed, the
   * provider was called, and the balance came back on the next restart —
   * the bill was real and the deduction was not.
   */
  assert.match(WALLET, /not_recorded/, 'an unrecordable spend has no refusal');
  const persist = WALLET.slice(WALLET.indexOf('private async persist('), WALLET.indexOf('private async reload('));
  assert.doesNotMatch(persist, /catch/, 'persist swallows write failures again');
});

/* ------------------------------------------------------------------ *
 * 3 — The billing portal, which took the customer from the request
 * ------------------------------------------------------------------ */

test('the billing portal opens the caller’s own customer, not one they name', () => {
  /*
   * `POST /stripe/portal` took a `customerId` from the body with no
   * session at all. A Stripe customer id is not a secret — it travels in
   * redirects, receipts and support threads — and the portal it opens can
   * cancel the subscription, read every invoice and change the card.
   */
  const portal = STRIPE_CONTROLLER.slice(STRIPE_CONTROLLER.indexOf("@Post('portal')"));
  assert.match(portal.slice(0, 400), /customerIdFor\(/, 'the customer is still taken from the request');

  const dto = code('stripe/stripe.dto.ts');
  const portalDto = dto.slice(dto.indexOf('class PortalDto'));
  assert.doesNotMatch(portalDto.slice(0, 300), /customerId/, 'PortalDto still accepts a customerId');
});

test('every route that names an account is guarded', () => {
  for (const route of ['checkout', 'topup', 'portal']) {
    const at = STRIPE_CONTROLLER.indexOf(`@Post('${route}')`);
    assert.ok(at > 0, `${route} is missing`);
    const preceding = STRIPE_CONTROLLER.slice(Math.max(0, at - 120), at);
    assert.match(preceding, /@SelfOnly\(/, `/stripe/${route} is open`);
  }
});

test('a self-only check cannot be skipped by sending the wrong type', () => {
  /*
   * The check was `typeof asked === 'string' && asked !== session.uid`,
   * so a body with no such field, or `{"userId": ["someone-else"]}` —
   * which Express parses into an array — fell through to a handler that
   * then answered with that account.
   */
  assert.match(GUARD, /typeof asked !== 'string' \|\| asked !== session\.uid/);
});

/* ------------------------------------------------------------------ *
 * 4 — Pricing that existed only in a constants file
 * ------------------------------------------------------------------ */

test('a top-up credits the published tier, bonus included', () => {
  for (const tier of ACU_TOPUP_TIERS) {
    const { acus, tier: matched } = topUpAcus(tier.gbp);
    assert.equal(matched?.gbp, tier.gbp, `£${tier.gbp} matched no tier`);
    assert.equal(acus, tier.acus + tier.bonusAcus, `£${tier.gbp} credited ${acus}`);
  }

  // £10 advertised 1,040 and the webhook granted 1,000, every time.
  assert.equal(topUpAcus(10).acus, 1_040);
});

test('an off-tier payment still credits, at face value and reported', () => {
  // The money has already been taken. Granting nothing would be theft.
  assert.equal(topUpTierFor(7), null);
  assert.equal(topUpAcus(7).acus, 700);
  assert.equal(topUpAcus(7).tier, null);
});

test('the webhook credits from the tier table rather than a bare multiplication', () => {
  const branch = STRIPE.slice(STRIPE.indexOf("case 'payment_intent.succeeded'"));
  assert.match(branch.slice(0, 900), /topUpAcus\(/, 'the published bonus is dead again');
});

test('every top-up sells an ACU at or above face value', () => {
  // Top-ups are the one product that preserves the governor's 4x exactly.
  for (const tier of ACU_TOPUP_TIERS) {
    const perAcu = tier.gbp / (tier.acus + tier.bonusAcus);
    const faceValue = 1 / ACU_PER_GBP;
    assert.ok(
      perAcu >= faceValue * 0.9,
      `£${tier.gbp} sells an ACU at £${perAcu.toFixed(5)} against a £${faceValue} face value`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * 5 — The margin the Cost Governor believes it is enforcing
 * ------------------------------------------------------------------ */

test('no plan sells allowance below what it costs to serve', () => {
  /*
   * The governor prices every action at `direct cost x 4 x 100 ACU`,
   * where the 100 defines one ACU as a penny of revenue. The 4x is only
   * real if a penny was actually paid. A top-up pays it; a subscription
   * does not, and the two halves live in different packages so neither
   * had to agree with the other.
   *
   * 1.0 is the line where a member who uses their whole allowance costs
   * exactly what they paid — before Stripe's fee and before any of the
   * overhead in OVERHEAD_PER_PAID_USER_MONTH. Below it the plan is a
   * guaranteed loss, and that is a build failure rather than a report.
   */
  for (const plan of BILLING_PLANS) {
    const multiple = realisedProtectionMultiple(plan);
    assert.ok(
      multiple >= 1,
      `${plan} clears only ${multiple}x its provider cost — £${PLAN_DEFINITIONS[plan].gbp} ` +
        `for ${PLAN_DEFINITIONS[plan].acuAllowance} ACU is £${realisedAcuPriceGbp(plan).toFixed(5)} each`,
    );
  }
});

test('the realised margin is pinned, so a price change cannot move it quietly', () => {
  /*
   * These are the figures as they stand, not the figures they should be.
   * The governor assumes 4x and no plan reaches 2x. Changing an allowance
   * or a price fails this test, which is the point — the number moving is
   * a decision, and a decision should not be able to happen by accident.
   */
  const expected: Record<string, number> = {
    premium_monthly: 1.997,
    premium_annual: 1.538,
    family_monthly: 1.299,
    family_annual: 1,
    organisation_seat: 2,
  };

  for (const plan of BILLING_PLANS) {
    assert.equal(
      realisedProtectionMultiple(plan),
      expected[plan],
      `${plan} moved — reprice deliberately or restore the allowance`,
    );
  }

  const weakest = weakestPlanMargin();
  assert.equal(weakest.plan, 'family_annual');
  assert.ok(
    weakest.multiple < COST_PROTECTION_MULTIPLE,
    'if every plan now clears 4x, this test has done its job and should be tightened',
  );
});

/* ------------------------------------------------------------------ *
 * 6 — Entitlement that never expired
 * ------------------------------------------------------------------ */

test('the past-due grace period is enforced in both directions', () => {
  /*
   * PAST_DUE_GRACE_DAYS was declared with a paragraph about why losing
   * your coach to an expired card is the wrong behaviour, and then read
   * by nothing. So past_due was not a grace period — it was permanent
   * entitlement on a card that had stopped paying.
   */
  assert.match(STRIPE, /PAST_DUE_GRACE_DAYS/, 'the grace period is unread again');
  assert.match(STRIPE, /async entitledNow\(/);
  assert.ok(PAST_DUE_GRACE_DAYS > 0 && PAST_DUE_GRACE_DAYS <= 30);
});

test('the subscription and the customer link outlive the process', () => {
  /*
   * Both were Maps. A refund arrives naming a customer and nothing else,
   * and a reversal that cannot find the wallet is a reversal that does
   * not happen — which on serverless is most of them.
   */
  assert.match(STRIPE, /FROM stripe_customers/, 'the customer link is memory-only again');
  assert.match(STRIPE, /FROM stripe_subscriptions/, 'the subscription is memory-only again');
});

test('the grace clock is not restarted by a repeated failure', () => {
  // Two failed payments in a row must not extend entitlement indefinitely.
  assert.match(STRIPE, /state_since = CASE WHEN stripe_subscriptions\.state IS DISTINCT FROM/);
});
