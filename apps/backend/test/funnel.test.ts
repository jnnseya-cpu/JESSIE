import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Can a stranger who wants this product actually buy it?
 *
 * The answer was no, for the entire life of the site, and nothing failed.
 * Registration worked — it returned 201 every time anybody tested it. It
 * was simply unreachable: the nav's primary button pointed at
 * `/get-started`, which described five onboarding steps and ended in
 * "Request access" pointing at `/contact`, which was a `mailto:` form.
 * Eleven marketing pages, and not one of them had a primary call to
 * action that reached the account.
 *
 * No test caught it because every test asked whether a thing worked, and
 * this thing worked. Nobody could get to it. That is the class of failure
 * these assertions exist for, and it is the expensive class: a broken
 * feature gets reported, an unreachable one just looks like nobody wanted
 * the product.
 */

const APP = new URL('../../frontend/app/', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, APP), 'utf8');

/** Every public marketing page — the ones a stranger can land on. */
function marketingPages(): string[] {
  const skip = new Set([
    'account', // the destination itself
    'console',
    'try',
    'offline',
    'blog', // handled separately: articles have their own rule
  ]);
  const dirs = readdirSync(new URL('.', APP), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('[') && !skip.has(d.name))
    .map((d) => `${d.name}/page.tsx`)
    .filter((rel) => {
      try {
        readFileSync(new URL(rel, APP));
        return true;
      } catch {
        return false;
      }
    });
  return ['page.tsx', ...dirs];
}

/** Where a page sends somebody who is convinced. */
function primaryCta(source: string): string | null {
  // The shared component always goes to the account.
  if (/<JoinCta\b/.test(source)) return '/account';
  const match = source.match(/className="btn btn--primary[^"]*"\s+href="([^"]+)"/);
  return match?.[1] ?? null;
}

test('every public page can be joined from', () => {
  const dead: string[] = [];
  for (const page of marketingPages()) {
    const source = read(page);
    if (!/btn--primary|JoinCta/.test(source)) continue; // a page with no ask is not a broken one
    const target = primaryCta(source);
    if (target !== '/account') dead.push(`${page} -> ${target ?? 'nothing'}`);
  }
  assert.deepEqual(
    dead,
    [],
    'these pages ask somebody to act and send them somewhere other than the account:\n' +
      dead.join('\n'),
  );
});

test('no primary call to action is an email address', () => {
  /*
   * "Request access" pointing at `mailto:` was the actual state of this
   * site. A mailto: link opens a mail client that many people do not have
   * configured, produces no record either side, and asks somebody to
   * compose an email to a stranger before they have seen the product. It
   * is a waitlist with extra steps and a worse conversion rate than no
   * button at all.
   */
  const offenders: string[] = [];
  for (const page of marketingPages()) {
    const source = read(page);
    if (/className="btn btn--primary[^"]*"\s+href="mailto:/.test(source)) offenders.push(page);
  }
  assert.deepEqual(offenders, [], 'a primary call to action opens an email client');
});

test('the site’s most-clicked button goes to the account, not to a page about it', () => {
  const nav = read('nav-session.tsx');
  const primary = nav.match(/className="btn btn--primary[^"]*"\s+href="([^"]+)"/g) ?? [];
  assert.ok(primary.length > 0, 'the nav has no primary action at all');
  for (const link of primary) {
    assert.match(
      link,
      /href="\/account"/,
      'the nav CTA points somewhere other than the account — that is one more step and it only loses people',
    );
  }
});

test('an article a stranger reads offers them a way in', () => {
  /*
   * Organic search lands on an article, not on the home page. A reader who
   * finished one of these could go to `/blog` or `/privacy` — that was the
   * complete set of destinations. Traffic that cannot convert is traffic
   * bought for nothing, however much of it there is.
   */
  const article = read('blog/[slug]/page.tsx');
  assert.ok(
    /<JoinCta\b/.test(article) || /href="\/account"/.test(article),
    'an article offers no route to an account',
  );
});

test('the join block states the price and the end of the free tier', () => {
  /*
   * Not a legal requirement and not a dark-pattern-avoidance box to tick:
   * a free tier that quietly stops is how a product earns refund requests
   * instead of customers, and saying so before signup costs nothing.
   */
  const ui = read('ui.tsx');
  const join = ui.slice(ui.indexOf('export function JoinCta'), ui.indexOf('export function SkipLink'));
  assert.match(join, /FREE_TIER\.acusPerMonth/);
  assert.match(join, /FREE_TIER\.months/);
  assert.match(join, /PLAN_DEFINITIONS\.premium_monthly\.gbp/);
  assert.match(join, /guardian confirms/i, 'the under-18 rule is not stated where somebody signs up');
});

/* ── the referral route ────────────────────────────────────────────── */

test('a referral code never reaches sign-in or password reset', () => {
  /*
   * The bug this pins, found by driving it rather than by reading it.
   *
   * The code was attached to the shared "prove you are a person" object,
   * which sign-in and password reset also use. Their shapes do not carry
   * it and the API rejects unknown properties outright, so somebody who
   * followed a falls group's link and then signed in — because they
   * already had an account, which is the common case when a link worker
   * hands a link to a room — got a flat 400 and could not get in.
   *
   * A referral is a fact about a registration and about nothing else.
   */
  const panel = readFileSync(
    new URL('../../frontend/app/account/account-panel.tsx', import.meta.url),
    'utf8',
  );
  const shared = panel.slice(panel.indexOf('const human = {'), panel.indexOf("if (mode === 'forgot')"));
  assert.ok(
    !/referrerCode/.test(shared),
    'the referral code is on the object shared with sign-in, which breaks signing in',
  );
  // And it is on the registration body, where it belongs. Sliced from
  // `const body =` forwards, because `const res = await api(` also appears
  // in the password-reset branch above it.
  const bodyStart = panel.indexOf('const body =');
  const body = panel.slice(bodyStart, panel.indexOf('const res = await api(', bodyStart));
  assert.match(body, /referrerCode/, 'a registration does not carry the code that credited it');
});

test('the page behind a referral link leads with what the platform will not do', () => {
  /*
   * The whole organic route depends on a link worker or a pharmacist
   * being willing to put their own credibility behind a link. They are
   * not deciding whether the product is good — they are deciding whether
   * it could hurt the person in front of them. So the refusals come
   * before the offer, and "nobody is paid for this" is on the page.
   */
  const landing = readFileSync(
    new URL('../../frontend/app/join/[code]/landing.tsx', import.meta.url),
    'utf8',
  );
  const refusals = landing.indexOf('What it will never do');
  const offer = landing.indexOf('Create your account');
  assert.ok(refusals > -1 && offer > refusals, 'the offer comes before the refusals');
  assert.match(landing, /noFee/, 'the page does not say that nobody is paid');
  assert.match(landing, /\/assurance/, 'nothing on the page can be checked');
});

test('nobody is paid for a referral, and the code says why', () => {
  const shared = readFileSync(
    new URL('../../../packages/shared/src/referrers.ts', import.meta.url),
    'utf8',
  );
  assert.match(shared, /no commission, no per-signup fee and no revenue share/i);
  assert.match(shared, /conflict/i);
  // There is no money field anywhere in the model.
  const sql = readFileSync(
    new URL('../../../db/migrations/0022_referrers.sql', import.meta.url),
    'utf8',
  );
  const columns = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf(');'));
  assert.ok(
    !/fee|commission|rate|gbp|pence|amount/i.test(columns),
    'the referrers table has somewhere to put a payment, which is how one gets made',
  );
});

test('a retired code still explains itself rather than 404ing', () => {
  /*
   * Somebody holding a leaflet printed two years ago did nothing wrong,
   * and an error page is a poor way to tell them so.
   */
  const controller = readFileSync(
    new URL('../src/growth/referrers.controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(controller, /found: false/);
  assert.ok(!/NotFoundException/.test(controller), 'an unknown code throws instead of explaining');
});

test('referral pages are not indexed', () => {
  // A link handed over in a room is not a search result, and a page per
  // organisation in an index is a directory of who works with us.
  const page = readFileSync(
    new URL('../../frontend/app/join/[code]/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(page, /robots:\s*\{\s*index:\s*false/);
});
