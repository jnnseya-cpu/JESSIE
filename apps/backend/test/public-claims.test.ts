import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOBILE_APP_RELEASED,
  ON_DEVICE_REQUIRES,
  PROVIDERS,
  PROVIDER_AVAILABILITY,
  PROVIDER_DEFINITIONS,
} from '@jessmove/shared';

/*
 * Claims the public site makes, checked against what the platform can do.
 *
 * These are not style tests. Each guards a sentence that was on
 * jessmove.com and was not true, and the failure mode they share is that
 * nothing breaks when the claim rots — a status page full of invented
 * uptime compiles, typechecks, renders beautifully and passes every other
 * test in this repository.
 */

const page = (path: string) =>
  readFileSync(new URL(`../../../apps/frontend/app/${path}`, import.meta.url), 'utf8');

test('the status page publishes no availability history it did not measure', () => {
  /*
   * It used to publish thirty days of it. Twelve services, each with a
   * hardcoded `history` array built from `up(30)` with a few invented
   * `degraded` days, under a heading that read "Live availability for
   * every part of the platform" — and three incident write-ups with
   * dates, durations and detail ("Partner has acknowledged; we will
   * update daily") describing events that had never happened.
   *
   * A status page is the page somebody opens when deciding whether to
   * rely on this, and the page they open during an outage. Invented
   * uptime there is worse than having no status page, because a missing
   * page tells you nothing and a false one tells you something wrong
   * with confidence.
   */
  const status = page('status/page.tsx');

  assert.doesNotMatch(status, /\bup\(\d+\)/, 'a synthetic uptime history is back');
  assert.doesNotMatch(
    status,
    /(is-degraded|is-down)/,
    'the day-by-day availability bars are back, and nothing is recording days',
  );
  // A written-up incident carries a date. None can be published until one
  // has happened and somebody has written it.
  assert.doesNotMatch(
    status,
    /\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/,
    'a dated incident report is back on the status page',
  );
  assert.doesNotMatch(status, /Resolved in \d/, 'an invented incident resolution time is back');

  // And it reads its state from somewhere rather than declaring it.
  assert.match(status, /readLiveStatus/, 'the status page no longer checks anything live');
});

test('the site does not offer a wearable connection nobody can make', () => {
  /*
   * `/wearables` published a table of seven providers with columns for
   * scopes, transport, privacy and lag, and no column for whether any of
   * them could be connected — so all seven read as live integrations
   * while not one of them was. The API agreed with the page: on-device
   * providers reported `ready: true`, which was true about the server and
   * false about the world, because reading Apple Health or Health Connect
   * needs a shell that is in neither store.
   */
  for (const provider of PROVIDERS) {
    assert.equal(
      typeof PROVIDER_AVAILABILITY[provider],
      'string',
      `${provider} is advertised with nothing said about whether it can be connected`,
    );
    assert.ok(PROVIDER_AVAILABILITY[provider].length > 10);
  }

  const wearables = page('wearables/page.tsx');
  assert.match(wearables, /PROVIDER_AVAILABILITY/, 'the availability column is gone from the table');

  // The server's readiness answer and the page's sentence come from the
  // same fact, so the two cannot tell somebody different things.
  const service = readFileSync(
    new URL('../src/wearables/wearables.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    service,
    /ready: MOBILE_APP_RELEASED/,
    'on-device providers report ready without reference to whether the app exists',
  );
});

test('what the on-device wording says depends on the app actually being released', () => {
  // The point of the constant is that one edit at store release corrects
  // the API, the wearables table and the copy together. If the sentence
  // stopped depending on it, they would drift on the day it matters.
  const expected = MOBILE_APP_RELEASED
    ? 'Available in the Jess Move app.'
    : 'Needs the Jess Move app, which is not in the stores yet.';
  assert.equal(ON_DEVICE_REQUIRES, expected);

  for (const provider of PROVIDERS) {
    if (PROVIDER_DEFINITIONS[provider].transport !== 'on_device') continue;
    if (provider === 'samsung_health') {
      // The exception, and the reason it is written down: it shares the
      // transport but not the dependency. No SDK integration exists, so
      // shipping the app would not unblock it.
      assert.doesNotMatch(PROVIDER_AVAILABILITY[provider], /Jess Move app/);
      continue;
    }
    assert.equal(PROVIDER_AVAILABILITY[provider], ON_DEVICE_REQUIRES);
  }
});

test('an organisation-facing number is labelled as an example unless it was measured', () => {
  // "This week — 68% of enrolled employees completed at least one movement
  // break" sat on the B2B page with nothing marking it as illustrative.
  // No organisation has run a cohort; a buyer would have carried that
  // figure into a procurement document.
  const industries = page('industries/page.tsx');
  assert.doesNotMatch(industries, /k="This week"/, 'an unlabelled current-period figure is back');
  assert.match(industries, /Illustrative — not a measured result/);
});
