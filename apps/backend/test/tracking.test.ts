import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ALLOWED_PAYLOAD_KEYS,
  FORBIDDEN_PAYLOAD_KEYS,
  NEVER_TRACKED_PREFIXES,
  TRACKABLE_PREFIXES,
  TRACKING_EVENTS,
  TRACKING_EVENT_KEYS,
  TRACKING_MIN_AGE,
  mayTrack,
  scrubPayload,
} from '@jessmove/shared';

/**
 * The advertising tags, and everything they are not allowed to touch.
 *
 * Almost every assertion here is a refusal, which is the right shape for
 * this feature: nobody needs a test proving Meta can count a page view, and
 * everybody needs one proving it cannot see a member's conditions.
 *
 * These are also the questions this platform gets asked. A link worker asks
 * whether it can reach somebody's family; an NHS buyer reading the assurance
 * page asks what leaves the building. "We were careful" is not an answer to
 * either. A test that fails when somebody adds `conditions` to a payload is.
 */

/* ------------------------------------------------------------------ *
 * Consent
 * ------------------------------------------------------------------ */

const base = { consented: true, path: '/', age: null as number | null, browserOptOut: false };

test('nothing runs without consent', () => {
  const verdict = mayTrack({ ...base, consented: false });
  assert.equal(verdict.may, false);
  assert.equal(verdict.refusal, 'no_consent');
});

test('a browser opt-out outranks the banner', () => {
  // Somebody who set Global Privacy Control and then clicked accept out of
  // habit is still refused. Honouring a signal only when it agrees with you
  // is not honouring it.
  const verdict = mayTrack({ ...base, consented: true, browserOptOut: true });
  assert.equal(verdict.may, false);
  assert.equal(verdict.refusal, 'browser_opt_out');
});

test('a consented adult on a public page is allowed', () => {
  assert.equal(mayTrack({ ...base, path: '/micro-movement', age: 54 }).may, true);
  assert.equal(mayTrack({ ...base, path: '/blog/some-article' }).may, true);
});

/* ------------------------------------------------------------------ *
 * Children
 * ------------------------------------------------------------------ */

test('a child is never profiled, consent or not', () => {
  for (const age of [10, 12, 15, 17]) {
    const verdict = mayTrack({ ...base, path: '/', age });
    assert.equal(verdict.may, false, `age ${age} was allowed`);
    assert.equal(verdict.refusal, 'under_age');
  }
  assert.equal(mayTrack({ ...base, path: '/', age: TRACKING_MIN_AGE }).may, true);
});

test('the page written for children carries no tag at all', () => {
  // It is a marketing page, so the allowlist would otherwise reach it. It is
  // also the one marketing page whose audience makes an advertising pixel
  // indefensible, so it is refused by name.
  assert.equal(mayTrack({ ...base, path: '/for-children' }).may, false);
  assert.equal(mayTrack({ ...base, path: '/for-children/anything' }).may, false);
});

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

test('no tag runs anywhere behind the login', () => {
  for (const path of [
    '/account',
    '/account/food',
    '/account/body',
    '/console',
    '/unsubscribe',
    '/auth/reset',
  ]) {
    const verdict = mayTrack({ ...base, path, age: 40 });
    assert.equal(verdict.may, false, `${path} would have carried a tag`);
    assert.equal(verdict.refusal, 'surface_not_permitted');
  }
});

test('an unknown path is refused rather than allowed', () => {
  // An allowlist, deliberately: a page missing from it loses a measurement,
  // whereas a page missing from a blocklist leaks. New health surfaces will
  // be added for years and none should have to remember to opt out.
  assert.equal(mayTrack({ ...base, path: '/some-page-invented-next-year' }).may, false);
});

test('the never-tracked list is not merely the absence of an allow', () => {
  // Both lists must independently refuse the account, so that adding a
  // marketing landing page under /account/… cannot quietly open the door.
  for (const prefix of NEVER_TRACKED_PREFIXES) {
    assert.ok(
      !TRACKABLE_PREFIXES.includes(prefix),
      `${prefix} appears in both the allowlist and the never-tracked list`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Payloads — the leak that would arrive by accident
 * ------------------------------------------------------------------ */

test('no health or identifying key survives a payload', () => {
  const hostile = {
    value: 5.99,
    currency: 'GBP',
    plan: 'premium',
    // Everything below is the accident this exists to stop: an object that
    // happened to be in scope at the call site, passed straight through.
    email: 'someone@example.test',
    userId: 'u_123',
    age: 71,
    conditions: ['type_2_diabetes'],
    medication: 'metformin',
    weightKg: 88,
    kcal: 690,
    fallsRisk: 'elevated',
    heartRate: 71,
    acuBalance: 536,
    token: 'secret',
  };

  const clean = scrubPayload(hostile);
  assert.deepEqual(clean, { value: 5.99, currency: 'GBP', plan: 'premium' });

  for (const key of Object.keys(clean)) {
    assert.ok(ALLOWED_PAYLOAD_KEYS.includes(key), `${key} escaped the allowlist`);
    assert.ok(!FORBIDDEN_PAYLOAD_KEYS.includes(key), `${key} is forbidden and survived`);
  }
});

test('an unrecognised key is dropped even when it looks harmless', () => {
  assert.deepEqual(scrubPayload({ somethingNew: 'x', value: 1 }), { value: 1 });
});

test('a nested object cannot smuggle anything through', () => {
  // Only primitives survive, so a value that is itself an object — the usual
  // way a whole member record ends up in an analytics call — is dropped.
  assert.deepEqual(scrubPayload({ value: { nested: 'payload' } as never }), {});
});

/* ------------------------------------------------------------------ *
 * The taxonomy
 * ------------------------------------------------------------------ */

test('every event is named for both networks, and says why it exists', () => {
  for (const key of TRACKING_EVENT_KEYS) {
    const event = TRACKING_EVENTS[key];
    assert.ok(event.meta.length > 0, `${key} has no Meta name`);
    assert.ok(event.google.length > 0, `${key} has no Google name`);
    assert.ok(event.because.length > 8, `${key} has no reason recorded`);
  }
});

test('no event name describes a health topic', () => {
  // A conversion called "falls_programme_signup" is a health disclosure
  // wearing a marketing label. The names stay commercial.
  const clinical = /health|condition|medication|falls|weight|bmi|calorie|diabet|balance|strength|mobility/i;
  for (const key of TRACKING_EVENT_KEYS) {
    const event = TRACKING_EVENTS[key];
    for (const name of [key, event.meta, event.google]) {
      assert.doesNotMatch(name, clinical, `event name "${name}" describes a health topic`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * The implementation, not just the rules
 * ------------------------------------------------------------------ */

const FRONTEND = new URL('../../frontend/app/', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, FRONTEND), 'utf8');

test('neither vendor is contacted before somebody agrees', () => {
  const src = read('tracking.tsx');

  // The scripts must be created inside the loaders, and the loaders must be
  // reached only through a consent check. A tag that loads on arrival and
  // waits for consent before *firing* has already told the vendor the
  // visitor's address and the page they were on.
  const gate = src.indexOf("consent !== 'accepted'");
  const load = src.indexOf('loadMeta(metaId())');
  assert.ok(gate > 0 && load > gate, 'the loaders are not behind the consent check');

  assert.match(src, /connect\.facebook\.net/);
  assert.match(src, /googletagmanager\.com/);
  // No vendor script may be referenced from the document itself.
  assert.doesNotMatch(read('layout.tsx'), /facebook|googletagmanager|gtag/i);
});

test('the server-side relay sends no identity', () => {
  const src = readFileSync(new URL('../src/tracking/conversions.service.ts', import.meta.url), 'utf8');

  // Meta will match on a hashed email if given one. A hash is still an
  // identifier, and matching a health platform's members into an ad profile
  // is not worth a better attribution number.
  // Look for the property, not the word — the file explains in a comment
  // why there is no user_data, and a test that cannot tell an absence from a
  // description of the absence is a test that fails on its own documentation.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /user_data\s*:/, 'the relay builds a user_data block');
  assert.doesNotMatch(code, /\bem\s*:/, 'the relay sends a hashed email field');
  assert.doesNotMatch(code, /\bph\s*:/, 'the relay sends a hashed phone field');
  assert.match(src, /non_personalized_ads: true/);
  assert.match(src, /AbortSignal\.timeout/, 'an advertising network must not hang a webhook');
});

test('the published policy matches what the code does', () => {
  const privacy = read('privacy/page.tsx');
  // The site used to promise no advertising or cross-site tracking. Adding
  // the tags without correcting that would make the platform lie to members
  // and to any buyer reading it.
  assert.match(privacy, /Meta and\s*\n?\s*Google measurement tags/);
  assert.match(privacy, /never load for anyone under 18/);
  assert.doesNotMatch(read('policies/page.tsx'), /No advertising or cross-site tracking/);
});
