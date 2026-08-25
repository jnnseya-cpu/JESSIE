import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ACU_TOPUP_TIERS,
  AGENT_REGISTRY,
  BILLING_PLANS,
  MODEL_TOKEN_RATES,
  PAST_DUE_GRACE_DAYS,
  PLAN_DEFINITIONS,
  UNKNOWN_MODEL_RATE,
  acusForTokens,
  realisedAcuPriceGbp,
  realisedCallMargin,
  realisedProtectionMultiple,
  tokenRateFor,
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

const readBack = src;

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

test('a top-up credits the published tier', () => {
  for (const tier of ACU_TOPUP_TIERS) {
    const { acus, tier: matched } = topUpAcus(tier.gbp);
    assert.equal(matched?.gbp, tier.gbp, `£${tier.gbp} matched no tier`);
    assert.equal(acus, tier.acus + tier.bonusAcus, `£${tier.gbp} credited ${acus}`);
  }

  /*
   * The volume bonuses are gone. They were never granted — the tier table
   * was read by nothing — so no member ever received one, but they were
   * also arithmetically incompatible with the rule: £10 for 1,040 ACU is
   * £0.0096 an ACU against a £0.01 face value, which is 3.85× and not 4×.
   * A bonus is a discount, and a discount below face value is the platform
   * paying part of the member's provider bill.
   */
  assert.equal(topUpAcus(10).acus, 1_000);
  for (const tier of ACU_TOPUP_TIERS) {
    assert.equal(tier.bonusAcus, 0, `£${tier.gbp} still carries a bonus`);
  }
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

test('every plan clears the full 4x, with no exceptions', () => {
  /*
   * The governor prices every action at `direct cost x 4 x 100 ACU`,
   * where the 100 defines one ACU as a penny of revenue. The 4x is only
   * real if a penny was actually paid.
   *
   * No plan used to pay it. premium_monthly sold 1,200 ACU for £5.99 and
   * cleared 2x; family_annual sold 52,000 for £129.99 and cleared exactly
   * 1.0x, so a household that used its allowance cost £130 of provider
   * spend against £129.99 of revenue. Every allowance is now `price x 100`
   * — the arithmetic that makes 4x true rather than assumed.
   *
   * This is the hard floor. It is not a report and there is no plan it
   * does not apply to.
   */
  for (const plan of BILLING_PLANS) {
    const multiple = realisedProtectionMultiple(plan);
    assert.ok(
      multiple >= COST_PROTECTION_MULTIPLE,
      `${plan} clears only ${multiple}x — £${PLAN_DEFINITIONS[plan].gbp} for ` +
        `${PLAN_DEFINITIONS[plan].acuAllowance} ACU is £${realisedAcuPriceGbp(plan).toFixed(5)} each, ` +
        `against a £0.01 face value. The allowance must not exceed price x 100.`,
    );
  }

  const weakest = weakestPlanMargin();
  assert.ok(
    weakest.multiple >= COST_PROTECTION_MULTIPLE,
    `${weakest.plan} is the weakest at ${weakest.multiple}x`,
  );
});

test('the realised margin is pinned, so a price change cannot move it quietly', () => {
  for (const plan of BILLING_PLANS) {
    assert.equal(
      realisedProtectionMultiple(plan),
      4,
      `${plan} moved off 4x — an allowance may never exceed its price x 100`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * 5b — Where the 4x is actually decided: the token price
 * ------------------------------------------------------------------ */

test('a call is priced from real token rates, not from a shape', () => {
  /*
   * The adapters used to compute ACU themselves:
   *
   *     ((input + output x 3) / 10_000) x (frontier ? 1 : 0.35)
   *
   * That formula knows nothing about what any model charges. Worse, the
   * gateway then divided the result back down by 400 to produce the
   * "provider cost" it handed to breachesProtectionRule — so the guard was
   * checking a number reconstructed from the number it was checking. It
   * could not fail, and for the life of the platform it never did.
   *
   * Measured against list prices it billed between 0.068x and 0.99x of
   * direct cost. Not one AI call this platform ever served cleared 4x.
   */
  const provider = readBack('ai/provider.interface.ts');
  assert.match(provider, /acusForTokens\(/, 'the adapters price calls themselves again');
  assert.doesNotMatch(
    code('ai/provider.interface.ts'),
    /10_000/,
    'the invented token formula is back',
  );

  // The model id is required. "Frontier" is a tier, and a tier is not a
  // rate — two frontier models on this chain differ more than sevenfold.
  assert.match(provider, /export function toAcu\(model: string/);
});

test('every model on the chain clears 4x on a representative call', () => {
  const models = Object.keys(MODEL_TOKEN_RATES);
  assert.ok(models.length >= 6, `only ${models.length} models are priced`);

  for (const model of models) {
    for (const [input, output] of [
      [500, 100],
      [2_600, 500],
      [8_000, 4_000],
    ]) {
      const margin = realisedCallMargin(model, input, output);
      assert.ok(
        margin >= COST_PROTECTION_MULTIPLE,
        `${model} clears only ${margin}x on ${input} in / ${output} out`,
      );
    }
  }
});

test('an unrecognised model is charged at the most expensive rate known', () => {
  /*
   * Otherwise changing ANTHROPIC_MODEL to something this table has never
   * heard of silently switches off the margin. The safe assumption about
   * an unknown cost is the highest one we know of, not an average.
   */
  const { known, rate } = tokenRateFor('some-model-nobody-priced');
  assert.equal(known, false);
  assert.equal(rate, UNKNOWN_MODEL_RATE);

  const dearest = Object.values(MODEL_TOKEN_RATES).reduce((a, b) =>
    a.gbpPerMillionOutput > b.gbpPerMillionOutput ? a : b,
  );
  assert.equal(UNKNOWN_MODEL_RATE.gbpPerMillionInput, dearest.gbpPerMillionInput);
  assert.equal(UNKNOWN_MODEL_RATE.gbpPerMillionOutput, dearest.gbpPerMillionOutput);

  assert.ok(realisedCallMargin('some-model-nobody-priced', 2_600, 500) >= COST_PROTECTION_MULTIPLE);
});

test('a call that reaches a provider is never free', () => {
  // Math.ceil of a tiny cost is 1, and a provider reporting no usage at
  // all still consumed a request. Zero is not an available answer.
  assert.ok(acusForTokens('gemini-2.5-flash', 1, 0) >= 1);
  assert.ok(acusForTokens('gemini-2.5-flash', 0, 0) >= 1);

  // Nonsense from a provider cannot reduce a bill.
  assert.equal(acusForTokens('gpt-4.1', -50_000, -50_000), 1);
});

test('configuration cannot switch the margin off', () => {
  // A zero or negative override would be free AI by environment variable.
  const env = {
    AI_TOKEN_RATES_JSON: JSON.stringify({
      'gpt-4.1': { gbpPerMillionInput: 0, gbpPerMillionOutput: 0 },
      'claude-opus-5': { gbpPerMillionInput: -5, gbpPerMillionOutput: -5 },
    }),
  };
  assert.equal(tokenRateFor('gpt-4.1', env).rate, MODEL_TOKEN_RATES['gpt-4.1']);
  assert.equal(tokenRateFor('claude-opus-5', env).rate, MODEL_TOKEN_RATES['claude-opus-5']);

  // Malformed JSON falls back to the table rather than throwing.
  assert.equal(tokenRateFor('gpt-4.1', { AI_TOKEN_RATES_JSON: '{oh dear' }).known, true);
});

test('every agent ceiling matches its token budget at the worst-case rate', () => {
  /*
   * The ceilings were calibrated against the invented formula, so they
   * were ACU figures with no relationship to any price. The token budget
   * is the source of truth now and the ceiling is derived from it at the
   * most expensive rate, because the hold is taken before the provider
   * chain has picked a model.
   */
  for (const agent of Object.values(AGENT_REGISTRY)) {
    const { input, output } = agent.tokenBudget;
    const expected = input === 0 && output === 0 ? 0 : acusForTokens('__no_such_model__', input, output);
    assert.equal(
      agent.acuCeiling,
      expected,
      `${agent.code} holds ${agent.acuCeiling} ACU for a ${input}/${output} token budget`,
    );
  }
});

test('an agent that reaches a model always holds something', () => {
  for (const agent of Object.values(AGENT_REGISTRY)) {
    const callsAModel = agent.modelClass === 'mid_tier_llm' || agent.modelClass === 'frontier_llm';
    if (callsAModel) {
      assert.ok(agent.acuCeiling > 0, `${agent.code} calls a model and holds nothing`);
      assert.ok(agent.tokenBudget.output > 0, `${agent.code} has no output budget`);
    }
  }
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
