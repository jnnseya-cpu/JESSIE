import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  FREE_TIER,
  METERING_RULE,
  NO_ACCOUNT_NO_AI,
  PLATFORM_PAYERS,
  PLATFORM_PAYER_IDS,
  freeGrantReference,
  freeGrantsDue,
  freeTierState,
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
  assert.match(GATEWAY, /There is no anonymous AI at all/);
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

test('there is no anonymous AI anywhere', () => {
  // The only free allowance is on an account, so an anonymous call has no
  // payer by design and the gateway refuses it.
  for (const file of ['foodlens/foodlens.controller.ts', 'mova/mova.controller.ts']) {
    const source = src(file);
    assert.ok(!/PLATFORM_PAYERS\.trial/.test(source), `${file} still funds an anonymous call`);
    assert.ok(!/guardAnonymous|assertAnonymousAllowance/.test(source), `${file} still meters strangers`);
  }
  // And the platform no longer has a trial payer to fund one with.
  assert.ok(!(PLATFORM_PAYERS as Record<string, string>).trial, 'the trial payer is gone');
  /*
   * The platform pays for exactly two things it does on its own behalf:
   * the editorial agent that drafts the blog, and the security agent that
   * reads the refusal queue. Neither is a member-facing feature, and
   * neither is a way for a stranger to get free AI — that is what this
   * count is guarding, not the number itself.
   */
  assert.deepEqual([...PLATFORM_PAYER_IDS].sort(), ['platform:editorial', 'platform:security']);
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
  assert.equal(PLATFORM_PAYER_IDS.length, 2, 'editorial and security, and nothing else');
  for (const payer of PLATFORM_PAYER_IDS) {
    assert.ok(isPlatformPayer(payer));
    assert.ok(platformDailyAcu(payer) > 0, `${payer} has no budget`);
  }
  assert.equal(isPlatformPayer('u_someone'), false);
  assert.equal(isPlatformPayer('platform:anything-else'), false, 'the prefix alone is not a licence');
});

test('the security agent draws its own budget, and a small one', () => {
  /*
   * Separate from editorial on purpose. An attacker who works out that
   * attacking us makes us spend hits a cap that is not shared with the
   * thing that writes the blog, so a flood cannot silently stop editorial
   * — and the security budget is small because triage is a paragraph
   * about a queue, not an investigation.
   */
  assert.ok(platformDailyAcu(PLATFORM_PAYERS.security) > 0);
  assert.ok(
    platformDailyAcu(PLATFORM_PAYERS.security) < platformDailyAcu(PLATFORM_PAYERS.editorial),
    'the security agent has more allowance than the one that writes articles',
  );
  assert.equal(platformDailyAcu(PLATFORM_PAYERS.security, { PLATFORM_SECURITY_DAILY_ACU: '10' }), 10);
  assert.equal(
    platformDailyAcu(PLATFORM_PAYERS.security, { PLATFORM_SECURITY_DAILY_ACU: '0' }),
    0,
    'zero stops the agent; the queue is still blocked and still waiting for a person',
  );
  // And the two budgets do not read each other's variable.
  assert.equal(
    platformDailyAcu(PLATFORM_PAYERS.editorial, { PLATFORM_SECURITY_DAILY_ACU: '7' }),
    200,
  );
});

test('the editorial budget is a number an operator sets', () => {
  assert.equal(platformDailyAcu(PLATFORM_PAYERS.editorial, { PLATFORM_EDITORIAL_DAILY_ACU: '500' }), 500);
  assert.equal(
    platformDailyAcu(PLATFORM_PAYERS.editorial, { PLATFORM_EDITORIAL_DAILY_ACU: '0' }),
    0,
    'zero is a valid answer: it stops the agent without a deploy',
  );
  assert.equal(
    platformDailyAcu(PLATFORM_PAYERS.editorial, { PLATFORM_EDITORIAL_DAILY_ACU: 'nonsense' }),
    200,
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
  assert.match(src('setup.ts'), /useGlobalFilters\([^)]*new AllowanceFilter\(\)/);
});

test('somebody with no account is told what an account gives them', () => {
  assert.match(GATEWAY, /throw new AllowanceExhaustedError\('no_account', NO_ACCOUNT_NO_AI/);
  assert.match(NO_ACCOUNT_NO_AI, /AI features need an account/i);
  assert.match(NO_ACCOUNT_NO_AI, /50 ACUs a month for 2 months/);
  // Honest about the ending. A free tier described as free and then
  // withdrawn without warning is the thing people rightly resent.
  assert.match(NO_ACCOUNT_NO_AI, /it does not renew/i);
  assert.match(NO_ACCOUNT_NO_AI, /works without an account and always will/i);
});

test('the rule is published rather than merely enforced', () => {
  assert.match(METERING_RULE, /Every AI action/i);
  assert.match(METERING_RULE, /no unbilled path/i);
  assert.match(METERING_RULE, /Nothing that is not AI is ever metered/i);
  // The rule now carries the one free allowance, so a member reading it
  // learns the shape of the thing rather than only its enforcement.
  assert.match(METERING_RULE, /50 ACUs a month for 2 months on a new account/);
  assert.match(METERING_RULE, /does not renew/i);
});

/* ── the free tier ─────────────────────────────────────────────────── */

test('the free tier is fifty a month for two months, and nothing else', () => {
  assert.equal(FREE_TIER.acusPerMonth, 50);
  assert.equal(FREE_TIER.months, 2);
});

test('month one is due immediately and month two is not', () => {
  const created = new Date('2026-08-01T09:00:00.000Z');
  const uid = 'u_free';
  assert.deepEqual(freeGrantsDue(created, created, [], uid), [0]);
  assert.deepEqual(
    freeGrantsDue(created, new Date('2026-08-20T09:00:00.000Z'), [freeGrantReference(uid, 0)], uid),
    [],
    'nineteen days in, month two is not owed',
  );
});

test('month two arrives after thirty days and never comes twice', () => {
  const created = new Date('2026-08-01T09:00:00.000Z');
  const uid = 'u_free';
  const after = new Date('2026-09-05T09:00:00.000Z');
  assert.deepEqual(freeGrantsDue(created, after, [freeGrantReference(uid, 0)], uid), [1]);
  assert.deepEqual(
    freeGrantsDue(created, after, [freeGrantReference(uid, 0), freeGrantReference(uid, 1)], uid),
    [],
  );
});

test('there is no third month, however long somebody waits', () => {
  const created = new Date('2026-01-01T00:00:00.000Z');
  const uid = 'u_free';
  const issued = [freeGrantReference(uid, 0), freeGrantReference(uid, 1)];
  for (const when of ['2026-06-01', '2027-01-01', '2030-01-01']) {
    assert.deepEqual(
      freeGrantsDue(created, new Date(`${when}T00:00:00.000Z`), issued, uid),
      [],
      `a grant was owed on ${when}`,
    );
  }
});

test('coming back after both months are due hands over both, not a stream', () => {
  // Somebody who signs up, disappears for three months and returns is owed
  // the two months they never took — and only those two.
  const created = new Date('2026-01-01T00:00:00.000Z');
  const due = freeGrantsDue(created, new Date('2026-04-01T00:00:00.000Z'), [], 'u_free');
  assert.deepEqual(due, [0, 1]);
});

test('a reference is unique per account, so one member cannot claim another', () => {
  assert.notEqual(freeGrantReference('u_a', 0), freeGrantReference('u_b', 0));
  assert.deepEqual(
    freeGrantsDue(new Date(), new Date(), [freeGrantReference('u_b', 0)], 'u_a'),
    [0],
    'somebody else’s grant does not count against yours',
  );
});

test('the member can see how much of the free tier is left', () => {
  const uid = 'u_free';
  assert.equal(freeTierState([], uid).monthsLeft, 2);
  assert.match(freeTierState([], uid).says, /first free month/i);

  const one = freeTierState([freeGrantReference(uid, 0)], uid);
  assert.equal(one.monthsLeft, 1);
  assert.equal(one.exhausted, false);

  const done = freeTierState([freeGrantReference(uid, 0), freeGrantReference(uid, 1)], uid);
  assert.equal(done.exhausted, true);
  assert.match(done.says, /does not renew/i);
  assert.match(done.says, /Everything that is not AI carries on unchanged/i);
});

test('the grant is issued on use rather than at signup', () => {
  // An account that never touches AI never spends its second month, and a
  // member returning in week five finds an allowance rather than an
  // expired one and no explanation.
  assert.match(GATEWAY, /private async grantFreeTier\(/);
  assert.match(GATEWAY, /await this\.grantFreeTier\(wallet\.id, billTo\)/);
  const walletFor = GATEWAY.slice(GATEWAY.indexOf('private async walletFor('));
  assert.ok(
    walletFor.indexOf('grantFreeTier') < walletFor.indexOf('isPlatformPayer(billTo)') + 400,
    'the free tier is topped up before the hold is taken',
  );
});

/* ── where an allowance came from ──────────────────────────────────── */

test('nothing in the wallet can create allowance out of a refund', () => {
  /*
   * Reported as "the ACUs are increasing instead of reducing", which would
   * be a serious bug if the ledger could mint. It cannot: `refund` caps
   * what it returns at `grant.amount - grant.remaining`, so even a double
   * refund is absorbed rather than adding allowance that was never
   * granted. Asserted here because the reasoning is the reassurance.
   */
  const wallet = readFileSync(
    new URL('../src/acu/wallet.service.ts', import.meta.url),
    'utf8',
  );
  const refund = wallet.slice(wallet.indexOf('async refund('), wallet.indexOf('async spendControls') > -1
    ? wallet.indexOf('async spendControls')
    : wallet.length);
  assert.match(refund, /const room = grant\.amount - grant\.remaining/);
  assert.match(refund, /Math\.min\(room, line\.amount\)/);
  // And a grant is only ever created by a named deposit, never by settling.
  const gateway = readFileSync(
    new URL('../src/ai/ai-gateway.service.ts', import.meta.url),
    'utf8',
  );
  const settle = gateway.slice(gateway.indexOf('private async settle('), gateway.indexOf('async complete('));
  assert.ok(
    !/depositAllowance|promotionalGrant|depositTopup/.test(settle),
    'settling a call creates a grant, which would mint allowance on every call',
  );
});

test('a balance says where it came from', async () => {
  /*
   * The complaint underneath the bug report was that a number moved and
   * there was no way to see why. A free month, a top-up, a staff grant and
   * a platform budget all land in the same total and read identically —
   * which makes an ordinary increase indistinguishable from a fault.
   */
  const { grantSourceLabel, FREE_TIER } = await import('@jessmove/shared');

  assert.match(grantSourceLabel('free:u_abc:m0'), /month 1 of 2/);
  assert.match(grantSourceLabel('free:u_abc:m0'), new RegExp(`${FREE_TIER.acusPerMonth} ACU`));
  assert.match(grantSourceLabel('free:u_abc:m0'), /does not renew/);
  assert.match(grantSourceLabel('topup_5gbp'), /Top-up of £5/);
  assert.match(grantSourceLabel('monthly_subscription'), /plan’s monthly allowance/);
  assert.match(grantSourceLabel('admin_grant'), /platform staff/);
  assert.match(grantSourceLabel('platform:editorial:2026-08-14'), /Platform budget/);

  // An unknown reference is shown rather than hidden, and an absent one is
  // admitted — a blank line in a money list is where trust goes.
  assert.match(grantSourceLabel('something_new'), /something_new/);
  assert.match(grantSourceLabel(''), /Unrecorded/);
  assert.match(grantSourceLabel(undefined), /Unrecorded/);
});

test('the account page can show the breakdown', () => {
  const panel = readFileSync(
    new URL('../../frontend/app/account/account-panel.tsx', import.meta.url),
    'utf8',
  );
  assert.match(panel, /grantSourceLabel/);
  assert.match(panel, /Where did this come from/);
  // The remaining figure as well as the original, because a grant half
  // spent is the thing somebody is actually asking about.
  assert.match(panel, /g\.remaining\.toLocaleString/);
  assert.match(panel, /g\.amount\.toLocaleString/);
});
