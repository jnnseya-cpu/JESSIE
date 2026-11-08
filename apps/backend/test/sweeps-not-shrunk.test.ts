/**
 * The sweeps cannot be quietly shrunk.
 *
 * Every adversarial check in this repository is a list — of payloads, of
 * injection patterns, of routes — and the cheapest way to make one of
 * them green is to take something out of the list. That is not a
 * hypothetical: the launch audit's rules name it first among the things
 * that void a verdict, because it is the one that leaves no trace. A
 * deleted payload does not appear in a diff anybody reads twice, and the
 * run afterwards says "0 failures" in exactly the same words.
 *
 * So the floors are written down here, next to what they protect. Raising
 * one is ordinary work. Lowering one means editing this file and saying
 * why in the commit, which is the whole point.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HANDLED_WEBHOOK_EVENTS } from '@jessmove/shared';

const REPO = join(import.meta.dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

test('the payload sweep still carries its payloads and its route floor', () => {
  const source = read('scripts/fuzz-api.mjs');

  const payloads = source.slice(
    source.indexOf('const PAYLOADS = ['),
    source.indexOf('];', source.indexOf('const PAYLOADS = [')),
  );
  const entries = [...payloads.matchAll(/^\s*\['/gm)].length;
  assert.ok(
    entries >= 24,
    `the payload sweep is down to ${entries} payloads from 24. Removing one ` +
      'is how a sweep stops finding things while still reporting zero.',
  );

  // The D-006 payload specifically, and the check that reads the answer
  // rather than the status code. Both were added after the sweep was
  // found to miss the very defect it was written for.
  assert.match(
    payloads,
    /a string where an array belongs/,
    'the payload that reproduces D-006 has been removed from the sweep',
  );
  assert.match(
    source,
    /STRING_AS_COLLECTION_LENGTH = 137/,
    'the string-as-collection length has changed; 137 was chosen because ' +
      'nothing in this platform uses it as a limit, so a count of 137 in a ' +
      'response can only mean a string was walked as a collection',
  );
  assert.match(
    source,
    /the response counts/,
    'the sweep no longer checks what the response says, only its status ' +
      'code — which is how it missed D-006 the first time',
  );

  // Route discovery, and the floor under it.
  assert.match(
    source,
    /routes\.length < 40/,
    'the sweep no longer refuses to run when route discovery finds too ' +
      'few routes, so a discovery regression would read as a clean sweep',
  );
  assert.doesNotMatch(
    source,
    /const ROUTES = \[/,
    'the sweep has gone back to a hand-written route list, which is how ' +
      'it missed POST /movements and PUT /state/:key entirely',
  );
});

test('the injection corpus and the member corpus are both intact', () => {
  const source = read('apps/backend/test/humanity.test.ts');

  const mustBlock = [...(
    source.slice(source.indexOf('MUST_BLOCK'), source.indexOf('MUST_NOT_BLOCK'))
  ).matchAll(/^\s*\['/gm)].length;
  const mustNotBlock = [...(
    source.slice(source.indexOf('MUST_NOT_BLOCK'))
  ).matchAll(/^\s*\['/gm)].length;

  assert.ok(
    mustBlock >= 11,
    `the must-block corpus is down to ${mustBlock} payloads from 11`,
  );
  /*
   * The must-NOT-block corpus matters as much, and for the opposite
   * reason. One of the patterns added during the audit flagged "System: I
   * keep getting logged out. Is that a known issue?" — a member asking an
   * ordinary question. It was this corpus that caught it. Deleting an
   * entry from here is how a door starts refusing real people.
   */
  assert.ok(
    mustNotBlock >= 9,
    `the must-not-block corpus is down to ${mustNotBlock} member strings from 9`,
  );
  assert.match(
    source,
    /keep getting logged out/,
    'the member string that caught an over-eager speaker-label pattern has ' +
      'been removed from the corpus',
  );
});

test('the adversarial probe still probes money, admin and the webhook', () => {
  const source = read('scripts/adversarial-probe.sh');

  for (const [what, pattern] of [
    ['allowance minting', /\/acu\/grant/],
    ['the billing portal', /\/stripe\/portal/],
    ['webhook signature verification', /\/stripe\/webhook/],
    ['the admin surface', /\/comms\/stats/],
  ] as const) {
    assert.match(
      source,
      pattern,
      `the adversarial probe no longer tests ${what}`,
    );
  }

  const checks = [...source.matchAll(/\bcode (GET|POST|PUT|DELETE|PATCH)\b/g)].length;
  assert.ok(
    checks >= 15,
    `the adversarial probe is down to ${checks} requests; it had more`,
  );
});

test('the webhook event list is the one the platform acts on, and no shorter', () => {
  /*
   * Ten events, published through /stripe/status so the dashboard can be
   * configured from the code rather than from memory. If one is dropped
   * here, a real payment event stops being handled and the failure is
   * silent by construction: Stripe gets its 200, nothing is recorded, and
   * nobody finds out until a member's allowance is wrong.
   */
  assert.equal(
    HANDLED_WEBHOOK_EVENTS.length,
    10,
    `the handled webhook event list is ${HANDLED_WEBHOOK_EVENTS.length} long, ` +
      'not 10. Adding one is fine and this number moves with it; losing one ' +
      'silently stops a payment event being acted on.',
  );
  for (const event of [
    'checkout.session.completed',
    'invoice.paid',
    'invoice.payment_failed',
    'customer.subscription.deleted',
  ]) {
    assert.ok(
      (HANDLED_WEBHOOK_EVENTS as readonly string[]).includes(event),
      `${event} is no longer handled, and it moves money or entitlement`,
    );
  }
});

test('the deletion coverage check still names its retained tables', () => {
  const source = read('apps/backend/test/deletion-coverage.test.ts');
  const retained = [...(
    source.slice(source.indexOf('const RETAINED'), source.indexOf('};', source.indexOf('const RETAINED')))
  ).matchAll(/^\s{2}\w+:/gm)].length;
  assert.equal(
    retained,
    5,
    `the retained-table list is ${retained} entries, not 5. A table added ` +
      'here is a table whose rows survive a deletion request, which is a ' +
      'decision with a legal basis, not a maintenance detail.',
  );
});
