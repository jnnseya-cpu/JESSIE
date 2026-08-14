import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LINK_TARGETS, TOPIC_CLUSTERS } from '@jessmove/shared';
import {
  AUTOPILOT_INTERVAL_HOURS,
  MIN_INTERVAL_HOURS,
  intervalHours,
} from '../src/blog/seo-autopilot.logic.ts';

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

/* ── the editorial pipeline ────────────────────────────────────────── */

test('a published article has somewhere to live', () => {
  /*
   * The whole content strategy was a `new Map()`. The agent drafted, the
   * status machine refused to publish without a named reviewer, the audit
   * ran — and all of it happened in one process while the public blog
   * rendered from a TypeScript file the API cannot write to. A published
   * article did not survive a restart and never reached a reader under any
   * circumstances, which is why content has produced nothing.
   */
  const service = readFileSync(new URL('../src/blog/blog.service.ts', import.meta.url), 'utf8');
  assert.ok(
    !/private readonly posts = new Map/.test(service),
    'posts are back in memory, which means nothing published can be read',
  );
  assert.match(service, /INSERT INTO posts/);

  const sql = readFileSync(
    new URL('../../../db/migrations/0023_posts.sql', import.meta.url),
    'utf8',
  );
  // The editorial control, enforced by the database as well as the service.
  assert.match(sql, /posts_published_needs_reviewer/);
  assert.match(sql, /status <> 'published' OR \(reviewed_by IS NOT NULL/);
});

test('the public site can render an article the pipeline published', () => {
  const route = readFileSync(
    new URL('../../frontend/app/blog/[slug]/page.tsx', import.meta.url),
    'utf8',
  );
  /*
   * Without `dynamicParams` an article published this morning is a 404
   * until somebody runs a build — which is the state the blog was in for
   * its whole life, with a pipeline that could draft and review and had
   * nowhere to put the result.
   */
  assert.match(route, /export const dynamicParams = true/);
  assert.match(route, /publishedBySlug/);

  for (const [what, rel] of [
    ['the index', '../../frontend/app/blog/page.tsx'],
    ['the sitemap', '../../frontend/app/sitemap.ts'],
    ['the feed', '../../frontend/app/blog/feed.xml/route.ts'],
  ] as const) {
    const source = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.match(source, /publishedPosts/, `${what} does not include published articles`);
    assert.match(source, /export const revalidate/, `${what} is frozen at deploy time`);
  }
});

test('auto-linked prose reaches the reader as links, not as markdown', () => {
  /*
   * `withAutoLinks` returns markdown. Rendered straight into the page it
   * produced `[movement break](/micro-movement)` as visible text — and it
   * survived a check that grepped the whole page for the href, which
   * matched the navigation. Grepping a page for a link proves nothing
   * about where the link is.
   */
  const published = readFileSync(
    new URL('../../frontend/app/blog/published.ts', import.meta.url),
    'utf8',
  );
  assert.match(published, /function anchors\(/);
  assert.match(published, /anchors\(withAutoLinks\(/);
  // Escape first, link second: after escaping there is no markup left,
  // whatever the model wrote.
  assert.ok(
    published.indexOf('const safe = escape(') < published.indexOf('anchors(withAutoLinks('),
    'the body is linked before it is escaped, so model output could become markup',
  );
});

test('the audit sees the links the page will actually carry', () => {
  /*
   * Links are woven in at render, but the audit scores `internalLinks` on
   * the stored draft — so an article that renders with six links scored
   * zero and could never pass. The pipeline would have been rebuilt and
   * still unable to publish anything.
   */
  const service = readFileSync(new URL('../src/blog/blog.service.ts', import.meta.url), 'utf8');
  assert.match(service, /autoLinksFor\(draft\.body/);
  assert.match(service, /autoLinksFor\(post\.body/);
});

test('the content plan targets what a reader searches, not what a feature is called', () => {
  /*
   * The published corpus targets "database constraints" and "notification
   * timing" — what an engineer searches while building something, not what
   * a sixty-eight-year-old searches when they are worried about their
   * balance. Every subject in the plan is now a sentence somebody types.
   */
  const jargon = /\b(api|database|schema|constraint|postgres|typescript|deployment|architecture)\b/i;
  const offenders: string[] = [];
  for (const cluster of TOPIC_CLUSTERS) {
    for (const subject of cluster.supporting) {
      if (jargon.test(subject)) offenders.push(`${cluster.key}: ${subject}`);
    }
  }
  assert.deepEqual(offenders, [], 'these subjects are written for an engineer');

  assert.ok(TOPIC_CLUSTERS.length >= 10, `${TOPIC_CLUSTERS.length} clusters is not the platform`);
  const subjects = TOPIC_CLUSTERS.reduce((n, c) => n + c.supporting.length, 0);
  assert.ok(subjects >= 40, `${subjects} subjects`);

  for (const cluster of TOPIC_CLUSTERS) {
    assert.ok(
      LINK_TARGETS.some((t) => t.path === cluster.pillarPath),
      `${cluster.key} points at ${cluster.pillarPath}, which is not a page`,
    );
  }
});

test('publishing faster is possible and still has a floor', () => {
  // 55 subjects at one a week is a year, which is not a strategy. But a
  // new site producing a hundred pages a month is a site that gets
  // classified as one producing a hundred pages a month.
  assert.equal(intervalHours({}), AUTOPILOT_INTERVAL_HOURS);
  assert.equal(intervalHours({ SEO_AUTOPILOT_INTERVAL_HOURS: '24' }), 24);
  assert.equal(
    intervalHours({ SEO_AUTOPILOT_INTERVAL_HOURS: '1' }),
    MIN_INTERVAL_HOURS,
    'the floor can be argued past',
  );
  assert.equal(intervalHours({ SEO_AUTOPILOT_INTERVAL_HOURS: 'soon' }), AUTOPILOT_INTERVAL_HOURS);
});

test('something actually starts the autopilot', () => {
  /*
   * The gap this closes, and it is the shape of every other gap in this
   * file: a complete mechanism with nothing to trigger it.
   *
   * The autopilot's only door was an admin pressing a button, on a
   * serverless deployment with no scheduler. Setting the API keys and
   * switching autopilot on would have produced exactly nothing, silently,
   * and the obvious conclusion would have been that the agent does not
   * work rather than that nothing ever called it.
   */
  const vercel = JSON.parse(
    readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
  ) as { crons?: { path: string; schedule: string }[] };

  const crons = vercel.crons ?? [];
  assert.ok(crons.length > 0, 'nothing is scheduled, so the autopilot never runs');
  const autopilot = crons.find((c) => c.path.includes('autopilot'));
  assert.ok(autopilot, 'the autopilot has no schedule');
  assert.match(autopilot!.schedule, /^\S+ \S+ \S+ \S+ \S+$/, 'the schedule is not a cron expression');

  const controller = readFileSync(
    new URL('../src/blog/blog.controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(controller, /@Get\('agent\/autopilot\/cron'\)/, 'the scheduled path does not exist');
});

test('the scheduler’s door refuses everything without a secret', () => {
  /*
   * A scheduled job has no session, so this endpoint cannot sit behind the
   * admin guard — which leaves a route that starts paid model work
   * reachable by anybody who guesses the path.
   *
   * The dangerous default is to skip the check when nothing is
   * configured, so it "works out of the box". On an endpoint that spends
   * money that means a deployment which forgot the variable is an open
   * door, and it fails silently, because the job still runs.
   */
  const guard = readFileSync(new URL('../src/blog/cron.guard.ts', import.meta.url), 'utf8');
  assert.match(guard, /if \(expected\.length < 16\) throw flat/);
  assert.match(guard, /timingSafeEqual/, 'the secret is compared with ===, which leaks it');

  // One flat refusal, never a reason.
  const messages = [...guard.matchAll(/UnauthorizedException\('([^']*)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(messages)], ['not available']);
});

test('a scheduled run cannot publish', () => {
  const controller = readFileSync(
    new URL('../src/blog/blog.controller.ts', import.meta.url),
    'utf8',
  );
  const handler = controller.slice(
    controller.indexOf("@Get('agent/autopilot/cron')"),
    controller.indexOf("@Get('policy')"),
  );
  // No force, so the cadence still applies to anything automated.
  assert.ok(!/force/.test(handler), 'the scheduled run can skip the cadence check');
  assert.match(handler, /reachedThePublic: false/);
});

test('the autopilot remembers across a cold start', () => {
  /*
   * `lastRunAt` and the run history were fields on a service instance. On
   * serverless every cold start begins with an empty history and a null
   * last-run — which meant the console could never show a run, and the
   * cadence check read "never run" and ran again. The weekly interval was
   * enforced only for as long as one instance stayed warm.
   *
   * Verified by restarting the process between two calls: the second
   * skipped, having read the first from the database.
   */
  const service = readFileSync(
    new URL('../src/blog/seo-autopilot.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(service, /INSERT INTO autopilot_runs/);
  assert.match(service, /private async lastRun\(\)/);
  assert.match(service, /lastRunAt: await this\.lastRun\(\)/, 'the cadence still reads an in-memory field');

  // And `remember` does not call itself, which it did for one build.
  const remember = service.slice(
    service.indexOf('private async remember('),
    service.indexOf('private async lastRun('),
  );
  assert.ok(!/await this\.remember\(/.test(remember), 'remember() recurses');
});

test('an empty review queue says which kind of empty it is', () => {
  /*
   * An empty queue means two entirely different things: the agent has not
   * run, or it ran and every draft failed its own audit. Showing only the
   * queue makes those identical, which is how a working pipeline gets
   * written off as broken — and is the exact shape of every other failure
   * in this file.
   */
  const screen = readFileSync(
    new URL('../../frontend/app/account/editorial.tsx', import.meta.url),
    'utf8',
  );
  assert.match(screen, /agent\/autopilot/, 'the screen never asks what the autopilot did');
  assert.match(screen, /recentRuns/);
  assert.match(screen, /Autopilot is off/, 'a disabled autopilot looks the same as a quiet one');
  assert.match(screen, /not the same as nothing happening/i);
});

test('the providers check answers whether a key works, not whether one is set', () => {
  /*
   * `health()` reports `configured` — a key being present. A revoked key,
   * a key for the wrong project, and a key on an account with no credit
   * all read as configured and then fail on the first real call, inside a
   * scheduled job, where the only symptom is that nothing appeared.
   */
  const gateway = readFileSync(
    new URL('../src/ai/ai-gateway.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(gateway, /async probe\(billTo: string\)/);

  const probe = gateway.slice(gateway.indexOf('async probe('), gateway.indexOf('health(): AiProviderHealth'));
  // Each provider called directly. Through the chain, a working second
  // provider would report success for a broken first one — masking the
  // exact thing being asked.
  assert.match(probe, /provider\.complete\(request, controller\.signal\)/);
  assert.ok(!/this\.complete\(/.test(probe), 'the probe goes through the fallback chain');
  // Metered like everything else.
  assert.match(probe, /await this\.hold\(request, 1\)/);
  assert.match(probe, /await this\.settle\(/);
  assert.match(probe, /await this\.release\(/, 'a failed probe keeps the hold');
});

test('a provider error is classified rather than echoed', () => {
  /*
   * Provider errors quote request bodies and sometimes the first
   * characters of the key. This output is read in a browser and pasted
   * into messages.
   */
  const gateway = readFileSync(
    new URL('../src/ai/ai-gateway.service.ts', import.meta.url),
    'utf8',
  );
  const fn = gateway.slice(
    gateway.indexOf('function classifyProviderError'),
    gateway.indexOf('/** An ACU hold taken'),
  );
  assert.ok(!/\$\{raw\}/.test(fn), 'the raw provider error is returned to the browser');
  // The classes map onto what somebody would do next, which is the point.
  for (const expected of [/rejected the key/i, /rate limited/i, /no credit/i, /model name/i]) {
    assert.match(fn, expected);
  }
});
