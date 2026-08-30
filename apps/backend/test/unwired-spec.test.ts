import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

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
 * Seventy-seven remain. Fixing them in one commit would be a large
 * untested change to reach a tidier number, which is the wrong trade on a
 * platform about to launch. So the current set is frozen in
 * `unwired-baseline.json` and this test enforces one direction: the list
 * may shrink, and may never grow. A new rule that does not run fails the
 * build on the commit that introduces it, which is the only moment it is
 * cheap to fix.
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
