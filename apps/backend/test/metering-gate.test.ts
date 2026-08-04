import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  METERING_RULE,
  PLATFORM_PAYERS,
  PLATFORM_PAYER_IDS,
  TRIAL_EXHAUSTED,
  isPlatformPayer,
  platformDailyAcu,
} from '@jessmove/shared';

/**
 * One rule: every AI action is metered and gated against an available ACU
 * balance, and there is no free path.
 *
 * What this replaced was not a weaker version of that rule — it was the
 * absence of one. The meter ran *after* the provider call and only wrote a
 * log line when the wallet refused, so a member with an empty balance got
 * unlimited AI. A call that named no payer skipped metering entirely, and
 * two of them did: the SEO agent and its repair pass. An unreachable wallet
 * also let the call through, which meant the free tap opened precisely when
 * the database was unhealthy.
 *
 * These tests are mostly structural, because the property being protected
 * is structural: there must exist no path from a caller to a provider that
 * does not pass the gate first.
 */

const src = (path: string): string =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const GATEWAY = src('ai/ai-gateway.service.ts');

/* ── the gate itself ───────────────────────────────────────────────── */

test('the hold is taken before the provider chain, not after it', () => {
  const holdAt = GATEWAY.indexOf('const hold = await this.hold(request, ceiling)');
  const chainAt = GATEWAY.indexOf('for (const provider of chain)');
  assert.ok(holdAt > 0, 'no hold is taken at all');
  assert.ok(chainAt > 0);
  assert.ok(holdAt < chainAt, 'the allowance is checked after the money is spent');
});

test('a call with nobody to bill does not run', () => {
  assert.match(GATEWAY, /const billTo = request\.billTo;\s*\n\s*if \(!billTo\) \{/);
  assert.match(GATEWAY, /there is no unbilled path/);
  // The old escape hatch, which made an unnamed payer a free action.
  assert.ok(
    !/if \(!billTo \|\| acu <= 0\) return;/.test(GATEWAY),
    'the unbilled-call early return is back',
  );
});

test('a refused wallet stops the call rather than logging about it', () => {
  const refusal = GATEWAY.slice(GATEWAY.indexOf('if (!result.allowed)'));
  assert.match(refusal.slice(0, 800), /throw new AllowanceExhaustedError/);
  // The old behaviour: warn, then return the answer anyway.
  assert.ok(
    !/allowance refused: \$\{refused\.reason\}`\);\s*\n\s*\}\s*\n\s*\} catch/.test(GATEWAY),
    'a refusal is being swallowed',
  );
});

test('an unreachable wallet is not a free pass', () => {
  /*
   * The old code caught every wallet error and let the call through, on
   * the reasonable-sounding grounds that a member should not lose an
   * answer to an infrastructure fault. The effect was an unbounded free
   * tap that opens exactly when the database is unhealthy — the worst
   * possible moment to be spending money nobody is counting.
   */
  const hold = GATEWAY.slice(
    GATEWAY.indexOf('private async hold('),
    GATEWAY.indexOf('private async settle('),
  );
  assert.ok(hold.length > 400, 'hold() was not found');
  assert.ok(!/catch \(/.test(hold), 'hold() swallows an error somewhere and continues');
});

test('nobody pays for an answer they did not get', () => {
  // Every provider failed: the whole hold goes back.
  const tail = GATEWAY.slice(GATEWAY.indexOf('Every configured AI provider failed') - 400);
  assert.match(tail, /await this\.release\(hold, request\.agent\)/);
  assert.match(GATEWAY, /private async release\(/);
});

test('the hold is settled to what was actually used', () => {
  assert.match(GATEWAY, /await this\.settle\(hold, result\.usage\.acu/);
  const settle = GATEWAY.slice(
    GATEWAY.indexOf('private async settle('),
    GATEWAY.indexOf('private async release('),
  );
  assert.match(settle, /if \(actual < hold\.acus\)/, 'the unused part comes back');
  assert.match(settle, /else if \(actual > hold\.acus\)/, 'and an overrun is charged, not absorbed');
});

test('a refund goes back to the grants it came from', () => {
  // Crediting a fresh promotional grant instead would quietly convert
  // allowance somebody paid for into one that expires.
  const wallet = src('acu/wallet.service.ts');
  assert.match(wallet, /async refund\(/);
  assert.match(wallet, /grants: \{ grantId: string; amount: number \}\[\];/);
  assert.match(wallet, /const room = grant\.amount - grant\.remaining;/, 'a refund cannot mint ACUs');
  assert.match(wallet, /wallet\.spentToday = Math\.max\(0, wallet\.spentToday - refunded\)/);
});

test('an agent that calls no provider is not charged for the privilege', () => {
  // A deterministic-rules agent has a zero ceiling and never reaches a
  // vendor. Holding against it would bill somebody for arithmetic.
  assert.match(GATEWAY, /if \(ceiling <= 0\) \{/);
});

/* ── no unbilled call sites ────────────────────────────────────────── */

test('every AI call site in the platform names a payer', () => {
  /*
   * The check that matters most, because the gate is only as good as the
   * absence of ways around it. Two call sites were unbilled when this was
   * written: the SEO agent's draft and its repair pass.
   */
  const roots = readdirSync(new URL('../src/', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const offenders: string[] = [];
  for (const root of roots) {
    let files: string[] = [];
    try {
      files = readdirSync(new URL(`../src/${root}/`, import.meta.url)).filter((f) =>
        f.endsWith('.ts'),
      );
    } catch {
      continue;
    }
    for (const file of files) {
      if (file === 'ai-gateway.service.ts') continue;
      const source = src(`${root}/${file}`);
      // Each `.complete({ ... })` object, up to its closing brace.
      for (const match of source.matchAll(/\.complete\(\{([\s\S]*?)\n {2,}\}\)/g)) {
        const body = match[1] ?? '';
        if (!/billTo/.test(body)) {
          offenders.push(`${root}/${file}: ${body.trim().slice(0, 60).replace(/\s+/g, ' ')}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `unbilled AI calls:\n${offenders.join('\n')}`);
});

test('the anonymous paths bill the platform rather than nobody', () => {
  assert.match(
    src('foodlens/foodlens.controller.ts'),
    /private payer\(req: Request\): string \{[\s\S]*?PLATFORM_PAYERS\.trial/,
    'an anonymous scan has no payer',
  );
  assert.match(
    src('mova/mova.controller.ts'),
    /private billTo\(req: Request\): string \{[\s\S]*?PLATFORM_PAYERS\.trial/,
    'an anonymous ask has no payer',
  );
  // The type is the guarantee: a payer that can be undefined is a payer
  // that will be undefined.
  assert.ok(!/private payer\(req: Request\): string \| undefined/.test(src('foodlens/foodlens.controller.ts')));
});

test('the editorial agent and the vision probe are billed too', () => {
  const seo = src('blog/seo-agent.service.ts');
  assert.equal(
    (seo.match(/billTo: PLATFORM_PAYERS\.editorial/g) ?? []).length,
    2,
    'the draft and its repair pass must both be billed',
  );
  assert.match(
    src('foodlens/foodlens.service.ts'),
    /billTo: PLATFORM_PAYERS\.editorial/,
    'a diagnostic that bypassed metering would be the first unbilled path back in',
  );
});

/* ── the platform payers ───────────────────────────────────────────── */

test('a platform payer is a real wallet with a real, exhaustible balance', () => {
  assert.equal(PLATFORM_PAYER_IDS.length, 2);
  for (const payer of PLATFORM_PAYER_IDS) {
    assert.ok(isPlatformPayer(payer));
    assert.ok(platformDailyAcu(payer) > 0, `${payer} has no budget`);
  }
  assert.equal(isPlatformPayer('u_someone'), false);
  assert.equal(isPlatformPayer('platform:anything-else'), false, 'the prefix alone is not a licence');
});

test('the daily budget is a number an operator sets', () => {
  assert.equal(
    platformDailyAcu(PLATFORM_PAYERS.trial, { PLATFORM_TRIAL_DAILY_ACU: '500' }),
    500,
  );
  assert.equal(
    platformDailyAcu(PLATFORM_PAYERS.editorial, { PLATFORM_EDITORIAL_DAILY_ACU: '0' }),
    0,
    'zero is a valid answer: it turns the trial off',
  );
  assert.equal(
    platformDailyAcu(PLATFORM_PAYERS.trial, { PLATFORM_TRIAL_DAILY_ACU: 'nonsense' }),
    2_000,
    'and rubbish falls back to the default rather than to zero or infinity',
  );
});

test('the daily grant cannot be issued twice in one day', () => {
  // A hundred concurrent visitors on the same morning must produce one
  // day's budget, not a hundred.
  assert.match(GATEWAY, /const reference = `\$\{billTo\}:\$\{today\}`/);
  assert.match(GATEWAY, /wallet\.grants\.some\(\(g\) => g\.sourceRef === reference\)/);
});

/* ── the refusal must survive the journey back ─────────────────────── */

test('no caller dresses an empty allowance up as an outage', () => {
  /*
   * The gate is worthless if the answer never reaches the member. Every
   * one of these services wraps its model call in a catch that returns a
   * friendly fallback, and each of those fallbacks said some version of
   * "the model is temporarily unavailable" — which told a member with an
   * empty wallet that nothing was wrong with their account and left them
   * waiting for a recovery that was never coming.
   */
  for (const file of [
    'mova/mova.service.ts',
    'blog/seo-agent.service.ts',
    'growth/growth-engine.service.ts',
    'foodlens/foodlens.service.ts',
  ]) {
    const source = src(file);
    assert.match(
      source,
      /instanceof AllowanceExhaustedError/,
      `${file} swallows an allowance refusal into a generic fallback`,
    );
  }
});

test('the coach in particular no longer says nothing is wrong', () => {
  const mova = src('mova/mova.service.ts');
  const rethrow = mova.indexOf('if (error instanceof AllowanceExhaustedError) throw error;');
  const fallback = mova.indexOf('coach unavailable');
  assert.ok(rethrow > 0 && fallback > rethrow, 'the rethrow must come before the fallback');
});

/* ── what the member is told ───────────────────────────────────────── */

test('an empty allowance is a 402 with an explanation, not a 500', () => {
  const filter = src('common/allowance.filter.ts');
  assert.match(filter, /@Catch\(AllowanceExhaustedError\)/);
  assert.match(filter, /response\.status\(402\)/);
  assert.match(filter, /stillWorks:/, 'it must say what is unaffected');
  assert.match(src('setup.ts'), /app\.useGlobalFilters\(new AllowanceFilter\(\)\)/);
});

test('a visitor is not told their ACUs have run out, because they have none', () => {
  const filter = src('common/allowance.filter.ts');
  assert.match(filter, /const trial = error\.detail\.payer === PLATFORM_PAYERS\.trial;/);
  assert.match(filter, /message: trial \? TRIAL_EXHAUSTED : error\.memberMessage/);
  assert.match(filter, /reason: trial \? 'trial_budget_spent'/);
  // And the sentence a visitor gets points at the thing that fixes it.
  assert.match(TRIAL_EXHAUSTED, /an account comes with its own allowance/i);
});

test('the rule is published rather than merely enforced', () => {
  assert.match(METERING_RULE, /Every AI action/i);
  assert.match(METERING_RULE, /no unbilled path/i);
  assert.match(METERING_RULE, /Nothing that is not AI is ever metered/i);
  // The promise that makes the whole thing tolerable: an empty wallet
  // degrades the product rather than breaking it.
  assert.match(TRIAL_EXHAUSTED, /Everything that is not AI still works/i);
});
