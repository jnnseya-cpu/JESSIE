import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  BILLING_PLANS,
  ENTITLED_STATES,
  HANDLED_WEBHOOK_EVENTS,
  MIN_TRANSACTION_GBP,
  PLAN_DEFINITIONS,
  SIGNATURE_TOLERANCE_SECONDS,
  SUBSCRIPTION_STATES,
  WEBHOOK_EFFECTS,
  assertStripeChargeable,
  fromMinorUnits,
  isEntitled,
  isHandled,
  toMinorUnits,
} from '@jessmove/shared';
import {
  expectedSignature,
  parseSignatureHeader,
  verifyWebhook,
} from '../src/stripe/signature.ts';
import { buildMessage, isConnectFailure, probeAdvice, type ProbeResult } from '../src/mail/smtp.ts';

/* ------------------------------------------------------------------ *
 * Plans and money
 * ------------------------------------------------------------------ */

test('every plan is defined and names an environment variable for its price', () => {
  for (const plan of BILLING_PLANS) {
    const def = PLAN_DEFINITIONS[plan];
    assert.equal(def.plan, plan);
    assert.ok(def.gbp > 0, `${plan} has no price`);
    assert.ok(def.priceEnvVar.startsWith('STRIPE_PRICE_'), `${plan} price var`);
    assert.ok(def.acuAllowance > 0, `${plan} grants nothing`);
  }
});

test('no Price ID is hard-coded — they are all environment variable names', () => {
  for (const plan of BILLING_PLANS) {
    assert.ok(
      !/^price_/.test(PLAN_DEFINITIONS[plan].priceEnvVar),
      `${plan} appears to carry a literal Price ID`,
    );
  }
});

test('money converts to integer minor units and back without drift', () => {
  assert.equal(toMinorUnits(5.99), 599);
  assert.equal(toMinorUnits(129.99), 12_999);
  assert.equal(toMinorUnits(0.1 + 0.2), 30);
  assert.equal(fromMinorUnits(599), 5.99);
});

test('a sub-£5 charge is refused before it reaches Stripe', () => {
  assert.throws(() => assertStripeChargeable(4.99), RangeError);
  assert.throws(() => assertStripeChargeable(0), RangeError);
  assert.throws(() => assertStripeChargeable(-10), RangeError);
  assert.doesNotThrow(() => assertStripeChargeable(MIN_TRANSACTION_GBP));
});

test('every published plan clears the minimum charge', () => {
  for (const plan of BILLING_PLANS) {
    const def = PLAN_DEFINITIONS[plan];
    if (def.plan === 'organisation_seat') continue; // billed at 10+ seats
    assert.doesNotThrow(() => assertStripeChargeable(def.gbp), plan);
  }
});

test('entitlement follows trialing and active, and nothing else', () => {
  for (const state of SUBSCRIPTION_STATES) {
    assert.equal(isEntitled(state), ENTITLED_STATES.includes(state), state);
  }
  assert.equal(isEntitled('past_due'), false);
  assert.equal(isEntitled('canceled'), false);
});

/* ------------------------------------------------------------------ *
 * Which events are acted on
 * ------------------------------------------------------------------ */

test('every handled event has a documented effect', () => {
  for (const type of HANDLED_WEBHOOK_EVENTS) {
    assert.ok(WEBHOOK_EFFECTS[type]?.length > 10, `${type} has no effect described`);
  }
});

test('an unknown event type is not handled', () => {
  assert.equal(isHandled('customer.subscription.created'), true);
  assert.equal(isHandled('radar.early_fraud_warning.created'), false);
  assert.equal(isHandled(''), false);
});

test('only invoice.paid grants an allowance', () => {
  const granting = HANDLED_WEBHOOK_EVENTS.filter((t) => /Grant/.test(WEBHOOK_EFFECTS[t]));
  assert.deepEqual(granting, ['invoice.paid']);
});

/* ------------------------------------------------------------------ *
 * Webhook signature — the part that must be right
 * ------------------------------------------------------------------ */

const SECRET = 'whsec_test_0123456789abcdef';

function signed(body: string, timestamp: number, secret = SECRET): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

const BODY = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { object: {} } });

test('a correctly signed request verifies', () => {
  const now = 1_760_000_000;
  const event = verifyWebhook(BODY, signed(BODY, now), SECRET, now);
  assert.equal(event.id, 'evt_1');
});

test('a tampered body does not verify', () => {
  const now = 1_760_000_000;
  const header = signed(BODY, now);
  const tampered = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { object: { amount_paid: 999999 } } });
  assert.throws(() => verifyWebhook(tampered, header, SECRET, now), /no signature matched/);
});

test('a wrong secret does not verify', () => {
  const now = 1_760_000_000;
  assert.throws(
    () => verifyWebhook(BODY, signed(BODY, now, 'whsec_someone_elses'), SECRET, now),
    /no signature matched/,
  );
});

test('an old timestamp is refused — a captured request cannot be replayed', () => {
  const now = 1_760_000_000;
  const old = now - SIGNATURE_TOLERANCE_SECONDS - 1;
  assert.throws(() => verifyWebhook(BODY, signed(BODY, old), SECRET, now), /outside the/);
  // Just inside the window still passes.
  const recent = now - SIGNATURE_TOLERANCE_SECONDS + 1;
  assert.doesNotThrow(() => verifyWebhook(BODY, signed(BODY, recent), SECRET, now));
});

test('a future timestamp is refused too — clock skew is not a bypass', () => {
  const now = 1_760_000_000;
  const future = now + SIGNATURE_TOLERANCE_SECONDS + 60;
  assert.throws(() => verifyWebhook(BODY, signed(BODY, future), SECRET, now), /outside the/);
});

test('a missing header, missing secret or malformed header is refused', () => {
  const now = 1_760_000_000;
  assert.throws(() => verifyWebhook(BODY, undefined, SECRET, now), /no Stripe-Signature/);
  assert.throws(() => verifyWebhook(BODY, signed(BODY, now), '', now), /not configured/);
  assert.throws(() => verifyWebhook(BODY, 'nonsense', SECRET, now), /timestamp/);
  assert.throws(() => verifyWebhook(BODY, `t=${now}`, SECRET, now), /no v1 signature/);
});

test('a header carrying several signatures verifies if any one matches', () => {
  const now = 1_760_000_000;
  const good = expectedSignature(BODY, now, SECRET);
  const header = `t=${now},v1=${'0'.repeat(64)},v1=${good}`;
  assert.doesNotThrow(() => verifyWebhook(BODY, header, SECRET, now));
});

test('a signature of the wrong length is refused rather than throwing', () => {
  const now = 1_760_000_000;
  assert.throws(() => verifyWebhook(BODY, `t=${now},v1=abc`, SECRET, now), /no signature matched/);
});

test('a verified body that is not JSON is refused', () => {
  const now = 1_760_000_000;
  const body = 'not json at all';
  assert.throws(() => verifyWebhook(body, signed(body, now), SECRET, now), /not valid JSON/);
});

test('the header parser tolerates spacing and extra schemes', () => {
  const parsed = parseSignatureHeader('t=1700000000, v0=abc, v1=def, v1=ghi');
  assert.equal(parsed.timestamp, 1_700_000_000);
  assert.deepEqual(parsed.signatures, ['def', 'ghi']);
});

/* ------------------------------------------------------------------ *
 * SMTP message construction
 * ------------------------------------------------------------------ */

const smtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'u',
  pass: 'p',
  from: 'JESS MOVE <jess@jessmove.com>',
};

test('a plain message carries the headers a mail server needs', () => {
  const msg = buildMessage(smtpConfig, { to: 'a@b.com', subject: 'Hello', text: 'Body' }, 'bnd');
  assert.match(msg, /^From: JESS MOVE <jess@jessmove\.com>\r\n/);
  assert.match(msg, /\r\nTo: a@b\.com\r\n/);
  assert.match(msg, /\r\nSubject: Hello\r\n/);
  assert.match(msg, /\r\nMIME-Version: 1\.0\r\n/);
});

test('header injection through a newline is refused', () => {
  assert.throws(
    () => buildMessage(smtpConfig, { to: 'a@b.com\r\nBcc: victim@c.com', subject: 'x', text: 'y' }, 'b'),
    /line break/,
  );
  assert.throws(
    () => buildMessage(smtpConfig, { to: 'a@b.com', subject: 'x\nBcc: victim@c.com', text: 'y' }, 'b'),
    /line break/,
  );
});

test('a leading dot in the body is stuffed, or it would end the message early', () => {
  const msg = buildMessage(smtpConfig, { to: 'a@b.com', subject: 's', text: 'line\n.\nmore' }, 'b');
  assert.match(msg, /\r\n\.\.\r\n/);
});

test('bare newlines become CRLF throughout', () => {
  const msg = buildMessage(smtpConfig, { to: 'a@b.com', subject: 's', text: 'one\ntwo\nthree' }, 'b');
  assert.equal(/[^\r]\n/.test(msg), false, 'a bare LF survived');
});

test('a non-ASCII subject is encoded rather than sent raw', () => {
  const msg = buildMessage(smtpConfig, { to: 'a@b.com', subject: 'Café — résumé', text: 'x' }, 'b');
  assert.match(msg, /Subject: =\?UTF-8\?B\?/);
});

test('an HTML message is multipart with both parts and a closing boundary', () => {
  const msg = buildMessage(
    smtpConfig,
    { to: 'a@b.com', subject: 's', text: 'plain', html: '<p>rich</p>' },
    'BOUNDARY',
  );
  assert.match(msg, /Content-Type: multipart\/alternative; boundary="BOUNDARY"/);
  assert.match(msg, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(msg, /Content-Type: text\/html; charset=UTF-8/);
  assert.match(msg, /--BOUNDARY--/);
});

test('a reply-to is included only when given', () => {
  const without = buildMessage(smtpConfig, { to: 'a@b.com', subject: 's', text: 't' }, 'b');
  assert.equal(/Reply-To:/.test(without), false);
  const withIt = buildMessage(
    smtpConfig,
    { to: 'a@b.com', subject: 's', text: 't', replyTo: 'help@jessmove.com' },
    'b',
  );
  assert.match(withIt, /Reply-To: help@jessmove\.com/);
});

/* ------------------------------------------------------------------ *
 * SMTP reachability: failure classification and probe advice
 * ------------------------------------------------------------------ */

test('network failures are retryable on the other port, mail rejections are not', () => {
  assert.equal(isConnectFailure('SMTP connect timed out'), true);
  assert.equal(isConnectFailure('connect ETIMEDOUT 1.2.3.4:465'), true);
  assert.equal(isConnectFailure('connect ECONNREFUSED 1.2.3.4:465'), true);
  assert.equal(isConnectFailure('getaddrinfo ENOTFOUND smtp.example.com'), true);
  // The server answered — a different port would give the same answer.
  assert.equal(isConnectFailure('SMTP AUTH password failed: 535 authentication failed'), false);
  assert.equal(isConnectFailure('SMTP RCPT TO failed: 550 mailbox unavailable'), false);
});

const probeRow = (port: number, ok: boolean, detail: string): ProbeResult => ({
  port,
  encryption: port === 465 ? 'implicit TLS' : 'STARTTLS',
  ok,
  detail,
  ms: 12,
});

test('probe advice: configured port working needs no change', () => {
  const advice = probeAdvice(465, [probeRow(465, true, 'ok'), probeRow(587, false, 'SMTP connect timed out')]);
  assert.match(advice, /Port 465 works end to end/);
});

test('probe advice: a working alternate names the exact variable change', () => {
  const advice = probeAdvice(465, [probeRow(465, false, 'SMTP connect timed out'), probeRow(587, true, 'ok')]);
  assert.match(advice, /SMTP_PORT=587/);
  assert.match(advice, /falls back to it automatically/);
});

test('probe advice: a 535 on both ports points at the mailbox password', () => {
  const detail = 'SMTP AUTH password failed: 535 authentication failed';
  const advice = probeAdvice(465, [probeRow(465, false, detail), probeRow(587, false, detail)]);
  assert.match(advice, /SMTP_PASS/);
});

test('probe advice: both ports dark points at egress, not credentials', () => {
  const detail = 'SMTP connect timed out';
  const advice = probeAdvice(465, [probeRow(465, false, detail), probeRow(587, false, detail)]);
  assert.match(advice, /network egress, not credentials/);
});
