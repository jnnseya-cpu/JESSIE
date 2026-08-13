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
