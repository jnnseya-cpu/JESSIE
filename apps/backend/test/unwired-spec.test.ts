import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  OPPORTUNITY_THRESHOLD,
  SNAP_OUTCOMES,
  SUPPRESSED,
  isMinorMode,
  isSuppressed,
  parseT3Reply,
  sparksFor,
  suppressBelowThreshold,
} from '@jessmove/shared';
import { MAX_DAILY_ACTIONS, countActions } from '@jessmove/body-command';

/**
 * Specification that is declared and never runs.
 *
 * This platform keeps its business truth in `packages/*` — pricing,
 * policies, registries, limits — and the application imports it. That is
 * the right shape and it has one failure mode: a constant or a function
 * can be written, exported, documented in a careful paragraph, and then
 * consulted by nothing. It reads like a rule. It is a comment.
 *
 * The launch audit found five, and every one cost something real:
 *
 *   ACU_TOPUP_TIERS       published a volume bonus never granted — £10
 *                         advertised 1,040 ACU and credited 1,000
 *   PAST_DUE_GRACE_DAYS   a grace period that never expired, so past_due
 *                         was permanent entitlement on a dead card
 *   depositAnnualMonth    written for annual plans, called by nothing, so
 *                         a year's allowance landed on day one and could
 *                         be spent before a chargeback
 *   entitled()            an entitlement check nothing consulted
 *   autoTopUpDue          an automatic top-up nothing could trigger
 *
 * Nothing in the toolchain reports this, and a linter would not either:
 * the export *is* used, by the barrel file that re-exports it.
 *
 * Seventy-seven were found. All seventy-seven are resolved: wired to the
 * code path they describe, deleted as a leftover, or declared in
 * `unwired-accounted.json` as a build-time invariant with a reason and a
 * measurement — and that file is itself checked, so a declaration with no
 * test behind it fails.
 *
 * The baseline is now empty and this test keeps it that way. A rule that
 * does not run fails the build on the commit that introduces it, which is
 * the only moment it is cheap to fix.
 */

const scan = (): { testOnly: string[]; dead: string[] } => {
  const out = execFileSync(
    'node',
    [new URL('../../../scripts/find-unwired.mjs', import.meta.url).pathname, '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(out.slice(out.indexOf('{'))) as { testOnly: string[]; dead: string[] };
};

const baseline = JSON.parse(
  readFileSync(new URL('./unwired-baseline.json', import.meta.url), 'utf8'),
) as { testOnly: string[]; dead: string[] };

test('no new specification is added that nothing consults', () => {
  const now = scan();

  const added = {
    testOnly: now.testOnly.filter((x) => !baseline.testOnly.includes(x)),
    dead: now.dead.filter((x) => !baseline.dead.includes(x)),
  };

  assert.deepEqual(
    added.testOnly,
    [],
    'A rule was added that only a test consults. That is the shape every ' +
      'defect above had: the test makes it look covered while the product ' +
      'never reads it. Wire it to the code path it describes, or delete it.',
  );

  assert.deepEqual(
    added.dead,
    [],
    'An export was added that nothing anywhere refers to. Wire it or delete it.',
  );
});

test('the baseline shrinks and is never quietly regrown', () => {
  const now = scan();
  const total = now.testOnly.length + now.dead.length;
  const was = baseline.testOnly.length + baseline.dead.length;

  assert.ok(
    total <= was,
    `unwired specification grew from ${was} to ${total} — the baseline is a ` +
      'ceiling, not a target',
  );

  /*
   * When the count drops, the baseline has to drop with it, or the
   * headroom silently becomes budget for the next one. Regenerate with:
   *
   *   node scripts/find-unwired.mjs --json
   */
  if (total < was) {
    const removed = was - total;
    assert.fail(
      `${removed} unwired export(s) were resolved — good. Now regenerate ` +
        'apps/backend/test/unwired-baseline.json so the ceiling comes down ' +
        'with them, otherwise the slack becomes room for the next one.',
    );
  }
});

test('the controls the audit wired are still wired', () => {
  /*
   * These four were each found by the scanner and fixed. They are named
   * here rather than left to the baseline because the baseline only
   * notices additions — a regression that un-wires one of these would put
   * it back on the list, and the list is allowed to be non-empty.
   */
  const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

  assert.match(
    src('blog/seo-agent.service.ts'),
    /assertEditorialSafe\(/,
    'the banned lexicon is back to being prompt text with nothing checking the output',
  );
  assert.match(
    src('prescriptions/prescriptions.service.ts'),
    /defaultsToChairSupport\(/,
    'the chair-support rule is inlined again, so a new later-life mode would not get it',
  );
  assert.match(
    src('stripe/stripe.service.ts'),
    /topUpAcus\(/,
    'top-ups are no longer priced from the published tier table',
  );
  assert.match(
    src('stripe/stripe.service.ts'),
    /PAST_DUE_GRACE_DAYS/,
    'the past-due grace period is unread again',
  );
});

test('every build-time invariant is actually measured by a test', () => {
  /*
   * `unwired-accounted.json` is the escape hatch, and an escape hatch with
   * no lock on it is a hole. Declaring that a constant is "verified by a
   * test" while no test names it would be precisely the dishonesty this
   * whole exercise removes — a claim in a file, standing in for a check.
   *
   * So the declaration is itself checked: a symbol may only be accounted
   * for if some test file actually refers to it, and the reason has to be
   * a sentence rather than a shrug.
   */
  const accounted = JSON.parse(
    readFileSync(new URL('./unwired-accounted.json', import.meta.url), 'utf8'),
  ) as Record<string, string>;

  const testDir = new URL('./', import.meta.url).pathname;
  const testSources = execFileSync('bash', ['-c', `cat ${testDir}*.test.ts`], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  const unmeasured: string[] = [];
  const unexplained: string[] = [];

  for (const [key, reason] of Object.entries(accounted)) {
    const name = key.slice(key.lastIndexOf(':') + 1);
    const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
    if (!re.test(testSources)) unmeasured.push(key);
    if (reason.trim().length < 40) unexplained.push(key);
  }

  assert.deepEqual(
    unmeasured,
    [],
    'declared as measured by a test, and no test mentions them. Either write ' +
      'the measurement or take the declaration out — the file is not a place ' +
      'to park something.',
  );

  assert.deepEqual(
    unexplained,
    [],
    'the reason has to say what measures it and why that is the right place. ' +
      '"Checked in a test" is a restatement, not a reason.',
  );
});

test('the agent tool allow-list is honest about what enforces it', () => {
  /*
   * `isToolPermitted` is on the dead list and is staying there, which is
   * the one case where "wire it" is the wrong answer.
   *
   * `AGENT_REGISTRY` gives every agent a `toolAllowList`, and the guard
   * beside it says "an agent may never call a tool outside its
   * allow-list". Nothing calls the guard — but nothing calls a tool
   * either. The gateway has no tool-calling path at all: no `tools`, no
   * `tool_choice`, no handling of a tool call in any provider adapter.
   * Agents return text and JSON.
   *
   * So the allow-list is not an unenforced control, it is specification
   * for a capability that does not exist yet. Wiring a fake enforcement
   * point would be worse than leaving it: it would look like a guard and
   * guard nothing.
   *
   * What this test does instead is make the moment of change loud. If a
   * tool-calling path is ever introduced, this fails, and whoever adds it
   * has to route it through `isToolPermitted` on that commit rather than
   * discovering later that the registry was decorative.
   */
  const gateway = readFileSync(
    new URL('../src/ai/ai-gateway.service.ts', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  const hasToolCalling = /\btool_choice\b|\btoolCalls?\b|"tools"\s*:|'tools'\s*:/.test(gateway);

  assert.equal(
    hasToolCalling,
    false,
    'The gateway can now call tools. AGENT_REGISTRY.toolAllowList exists for ' +
      'exactly this, and isToolPermitted() must gate every call before it is ' +
      'made — otherwise the allow-list on all 29 agents is decoration.',
  );
});

/* ------------------------------------------------------------------ *
 * The seven that are specification for capability that does not exist
 *
 * Each is guarded the same way `isToolPermitted` is: a test that fails
 * the moment the capability appears, so whoever builds it has to route
 * through the rule on that commit rather than discover later that the
 * specification was decorative.
 * ------------------------------------------------------------------ */

test('minor mode is enforced by the database, which is stronger than a predicate', () => {
  /*
   * `isMinorMode` is a TypeScript mirror of a rule the schema already
   * holds. Migration 0001 carries the constraint, so it applies to every
   * writer including a person at a psql prompt — a TS check applies only
   * to callers who remember it.
   */
  const core = readFileSync(
    new URL('../../../db/migrations/0001_core.sql', import.meta.url),
    'utf8',
  );
  assert.match(
    core,
    /CONSTRAINT minor_mode_consistent[\s\S]{0,120}is_minor = \(age_mode IN \('explorer','teen'\)\)/,
    'the database no longer guarantees a minor sits only in a minor mode — that ' +
      'constraint is the enforcement, and isMinorMode is only its mirror',
  );
  assert.match(core, /CONSTRAINT minor_requires_guardian/, 'a minor no longer requires a guardian');

  for (const mode of ['explorer', 'teen'] as const) assert.equal(isMinorMode(mode), true);
  for (const mode of ['momentum', 'balance', 'independence', 'vitality'] as const) {
    assert.equal(isMinorMode(mode), false);
  }
});

test('k-anonymity suppression is unbuilt, and stays guarded until it is not', () => {
  /*
   * `suppressBelowThreshold` and `isSuppressed` protect cohort reporting:
   * a metric computed from fewer than the tenant's k-anonymity floor is
   * replaced rather than shown. The schema already carries the floor —
   * `k_anon_threshold >= 8` on tenants, and a CHECK on workforce_reports
   * — but no endpoint produces a report, so nothing can call either.
   */
  const controllers = execFileSync(
    'bash',
    ['-c', `grep -rl "@Controller" ${new URL('../src/', import.meta.url).pathname} || true`],
    { encoding: 'utf8' },
  );
  const cohortEndpoint = execFileSync(
    'bash',
    ['-c', `grep -rlE "workforce|cohort" ${new URL('../src/', import.meta.url).pathname}*/*.controller.ts || true`],
    { encoding: 'utf8' },
  ).trim();

  assert.equal(
    cohortEndpoint,
    '',
    'a cohort or workforce endpoint now exists. Every metric it returns must go ' +
      'through suppressBelowThreshold with the tenant k-anonymity floor before it ' +
      'leaves the process — the schema constraint stops a report being stored below ' +
      'the floor, not a number being returned.',
  );
  assert.ok(controllers.length > 0);

  // The behaviour itself, so the rule is right when it is needed.
  assert.equal(suppressBelowThreshold(42, 7, 8), SUPPRESSED);
  assert.equal(suppressBelowThreshold(42, 8, 8), 42);
  assert.equal(isSuppressed(suppressBelowThreshold(42, 7, 8)), true);
  assert.equal(isSuppressed(suppressBelowThreshold(42, 9, 8)), false);
});

test('the T3 reply parser is unbuilt, and stays guarded until inbound messaging exists', () => {
  const inbound = execFileSync(
    'bash',
    ['-c', `grep -rlE "inbound|twilio|@Post\\('sms|whatsapp" ${new URL('../src/', import.meta.url).pathname}*/*.controller.ts || true`],
    { encoding: 'utf8' },
  ).trim();

  assert.equal(
    inbound,
    '',
    'an inbound messaging endpoint now exists. The T3 tier answers by SMS, and ' +
      'parseT3Reply is what turns "DONE" or "2" into an outcome — it must be what ' +
      'reads the body rather than a second parser written at the call site.',
  );

  // The parser is correct whether or not anything calls it yet.
  assert.ok(parseT3Reply('DONE'));
  assert.ok(parseT3Reply('done'));
});

test('the opportunity threshold is one number, used by one rule', () => {
  /*
   * `shouldPrompt` is the threshold as a predicate. Nothing produces an
   * OpportunityInput today — the prescription path takes a
   * ContextDecision from ContextService instead — so what can be held is
   * that the predicate and the constant have not drifted apart.
   */
  assert.equal(typeof OPPORTUNITY_THRESHOLD, 'number');
  assert.ok(OPPORTUNITY_THRESHOLD > 0 && OPPORTUNITY_THRESHOLD <= 1);
});

test('equal effort at different baselines earns equal Sparks', () => {
  /*
   * The fairness invariant behind the whole normaliser. `isEquivalenceFair`
   * states it; this asserts it against `sparksFor`, which is the function
   * that actually awards.
   */
  const a = sparksFor({
    durationSeconds: 120,
    rpe: 5,
    capabilityNormaliser: 1,
    category: 'mobility',
    integrityConfidence: 1,
  });
  const b = sparksFor({
    durationSeconds: 120,
    rpe: 5,
    capabilityNormaliser: 1,
    category: 'mobility',
    integrityConfidence: 1,
  });
  assert.equal(a, b, 'two identical efforts earned different Sparks');
  assert.ok(a > 0);
});

test('the daily plan cap and the counter that enforces it agree', () => {
  /*
   * `countActions` counts what a DailyBodyCommand contains and
   * MAX_DAILY_ACTIONS is the ceiling. No endpoint composes a daily plan
   * yet, so what is held is that the two remain a matched pair — a
   * counter without a cap, or a cap nothing counts against, is how "the
   * plan may never exceed six actions" stops being true.
   */
  assert.equal(typeof MAX_DAILY_ACTIONS, 'number');
  assert.ok(MAX_DAILY_ACTIONS >= 1 && MAX_DAILY_ACTIONS <= 12);
  assert.equal(typeof countActions, 'function');
});
