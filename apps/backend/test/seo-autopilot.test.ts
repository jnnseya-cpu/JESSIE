import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SEED_POSTS, TOPIC_CLUSTERS, type SeoAudit } from '@jessmove/shared';
import {
  AUTOPILOT_INTERVAL_HOURS,
  MAX_QUEUE_DEPTH,
  decide,
  nextCommission,
  verdict,
  type AutopilotState,
} from '../src/blog/seo-autopilot.logic.ts';

/**
 * Autopilot, and the thing it must never become.
 *
 * "The SEO agent runs on autopilot" is how every organisation that put
 * unreviewed machine-written health copy on a public site described it
 * beforehand. The tests here are in two halves: the scheduling, which is
 * ordinary logic, and the ceiling — that nothing in this feature can reach
 * a published page without a person.
 */

const state = (over: Partial<AutopilotState> = {}): AutopilotState => ({
  enabled: true,
  lastRunAt: null,
  queueDepth: 0,
  ...over,
});

const NOW = new Date('2026-08-03T09:00:00.000Z');
const hoursAgo = (n: number): string => new Date(NOW.getTime() - n * 3_600_000).toISOString();

const audit = (over: Partial<SeoAudit> = {}): SeoAudit => ({
  score: 92,
  passes: true,
  findings: [],
  measured: {
    titleLength: 48,
    descriptionLength: 130,
    words: 900,
    headings: 4,
    internalLinks: 5,
    keywordDensity: 0.008,
    readingMinutes: 4,
  },
  ...over,
});

/* ── the schedule ──────────────────────────────────────────────────── */

test('off means off, whatever else is true', () => {
  const d = decide(state({ enabled: false }), NOW, 5);
  assert.equal(d.run, false);
  assert.equal(d.reason, 'disabled');
});

test('a first run goes ahead', () => {
  const d = decide(state(), NOW, 3);
  assert.equal(d.run, true);
  assert.equal(d.reason, 'due');
});

test('it commissions weekly, not daily', () => {
  assert.equal(AUTOPILOT_INTERVAL_HOURS, 168);
  assert.equal(decide(state({ lastRunAt: hoursAgo(24) }), NOW, 3).reason, 'too_soon');
  assert.equal(decide(state({ lastRunAt: hoursAgo(167) }), NOW, 3).reason, 'too_soon');
  assert.equal(decide(state({ lastRunAt: hoursAgo(169) }), NOW, 3).run, true);
});

test('a full review queue stops the writing, because the queue is the constraint', () => {
  const d = decide(state({ queueDepth: MAX_QUEUE_DEPTH }), NOW, 5);
  assert.equal(d.run, false);
  assert.equal(d.reason, 'queue_full');
  assert.match(d.says, /waiting for review/i);
});

test('with nothing left uncovered it writes nothing rather than a near-duplicate', () => {
  const d = decide(state(), NOW, 0);
  assert.equal(d.run, false);
  assert.equal(d.reason, 'no_gap');
  assert.match(d.says, /near-duplicate|already answers/i);
});

test('the next due time is reported so an operator does not have to work it out', () => {
  const d = decide(state({ lastRunAt: hoursAgo(24) }), NOW, 3);
  assert.equal(d.nextDueAt, new Date(NOW.getTime() + 144 * 3_600_000).toISOString());
});

/* ── what gets written next ────────────────────────────────────────── */

test('the thinnest cluster wins, not the most recent', () => {
  // Every micro-movement subject is covered; nothing else is.
  const covered = TOPIC_CLUSTERS.find((c) => c.key === 'micro-movement')!;
  const commission = nextCommission(
    Array(covered.supporting.length).fill('micro-movement'),
    [...covered.supporting],
  );
  assert.ok(commission);
  assert.notEqual(commission.clusterKey, 'micro-movement');
  assert.match(commission.because, /thinnest on the site/);
});

test('a subject already written about is not a gap, whatever its status', () => {
  const cluster = TOPIC_CLUSTERS[0]!;
  const first = cluster.supporting[0]!;
  const commission = nextCommission([], [first]);
  assert.ok(commission);
  assert.notEqual(commission.topic, first, 'the drafted subject is skipped');
});

test('the children and later-life clusters get the strict lexicon', () => {
  for (const key of ['children', 'later-life']) {
    const cluster = TOPIC_CLUSTERS.find((c) => c.key === key)!;
    // Force this cluster to be thinnest by covering everything else.
    const others = TOPIC_CLUSTERS.filter((c) => c.key !== key);
    const commission = nextCommission(
      others.flatMap((c) => Array(c.supporting.length).fill(c.key)),
      others.flatMap((c) => [...c.supporting]),
    );
    assert.ok(commission);
    assert.equal(commission.clusterKey, key);
    assert.equal(commission.strict, true, `${key} must use the strict lexicon`);
    assert.ok(cluster.supporting.includes(commission.topic));
  }
});

test('with the whole site covered there is nothing to commission', () => {
  const everything = nextCommission(
    TOPIC_CLUSTERS.flatMap((c) => Array(c.supporting.length).fill(c.key)),
    TOPIC_CLUSTERS.flatMap((c) => [...c.supporting]),
  );
  assert.equal(everything, null);
});

test('the reason a subject was chosen is stated, not just logged', () => {
  const commission = nextCommission([], []);
  assert.ok(commission);
  assert.match(commission.because, /\d+ of \d+ subjects covered/);
  assert.ok(commission.because.includes(commission.topic));
});

/* ── what happens to the draft ─────────────────────────────────────── */

test('a draft with a blocker is never put in front of an editor', () => {
  const call = verdict(
    audit({
      score: 55,
      passes: false,
      findings: [
        { rule: 'links.dead', severity: 'blocker', detail: '/invented', fix: 'link to a real page' },
      ],
    }),
  );
  assert.equal(call.queue, false);
  assert.match(call.says, /teaches the editor to stop reading the audit/);
});

test('a draft that merely scores badly is also not queued', () => {
  const call = verdict(audit({ score: 71, passes: false }));
  assert.equal(call.queue, false);
  assert.match(call.says, /below the 80 pass mark/);
});

test('a passing draft is queued, and the message says a person decides', () => {
  const call = verdict(audit());
  assert.equal(call.queue, true);
  assert.match(call.says, /A person publishes it or does not/);
  assert.match(call.says, /5 internal links/);
});

/* ── the ceiling ───────────────────────────────────────────────────── */

test('autopilot never transitions a post to published', () => {
  const source = readFileSync(
    new URL('../src/blog/seo-autopilot.service.ts', import.meta.url),
    'utf8',
  );
  const transitions = [...source.matchAll(/transition\([^)]*/g)].map((m) => m[0]);
  assert.ok(transitions.length > 0, 'it does move drafts along');
  for (const call of transitions) {
    assert.match(call, /'in_review'/, `autopilot calls ${call}`);
    assert.ok(!/published/.test(call));
  }
  // `transition(slug, to, reviewer)` — a third argument is the platform
  // naming a reviewer on somebody's behalf, which is the whole gate.
  for (const call of transitions) {
    assert.equal(call.split(',').length, 2, `a reviewer was passed: ${call}`);
  }
  assert.ok(!/\.publish\(/.test(source), 'and it never calls publish at all');
});

test('the status endpoint publishes what it will not do', () => {
  const source = readFileSync(
    new URL('../src/blog/seo-autopilot.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /neverDoes: \[/);
  assert.match(source, /buy, exchange or generate external backlinks/);
  assert.match(source, /no draft-to-published edge/);
});

test('both autopilot routes are staff-only', () => {
  const source = readFileSync(new URL('../src/blog/blog.controller.ts', import.meta.url), 'utf8');
  for (const route of ["@Get('agent/autopilot')", "@Post('agent/autopilot/run')"]) {
    const at = source.indexOf(route);
    assert.ok(at > 0, `${route} is missing`);
    assert.match(
      source.slice(Math.max(0, at - 120), at),
      /@AdminOnly\(\)/,
      `${route} is not behind the admin guard`,
    );
  }
});

test('it is off unless a deployment turns it on', () => {
  const source = readFileSync(
    new URL('../src/blog/seo-autopilot.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /process\.env\.SEO_AUTOPILOT === 'on'/, 'opt-in, and exact-match');
});

test('the agent is handed the real page list rather than left to invent one', () => {
  const source = readFileSync(new URL('../src/blog/seo-agent.service.ts', import.meta.url), 'utf8');
  assert.match(source, /LINK_TARGETS\.filter\(\(t\) => !t\.noIndex\)/, 'the whole registry goes in the prompt');
  assert.match(source, /never to a path that is not in this list/);
  assert.match(source, /realLinksOnly/, 'and anything invented anyway is dropped');
  assert.match(source, /withAutoLinks/, 'the prose gains its links deterministically');
});

test('the corpus the autopilot reasons about is the one the site ships', () => {
  // Cheap, and it catches the seeded list drifting from the clusters.
  for (const post of SEED_POSTS) {
    if (!post.clusterKey) continue;
    assert.ok(
      TOPIC_CLUSTERS.some((c) => c.key === post.clusterKey),
      `"${post.slug}" claims cluster "${post.clusterKey}", which does not exist`,
    );
  }
});
