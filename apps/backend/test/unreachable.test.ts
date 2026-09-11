import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Features that exist and cannot be reached.
 *
 * `unwired-spec.test.ts` asks whether an export is consulted.
 * `admin-guard.test.ts` asks whether a route is guarded. Neither asks the
 * question that has cost the most here: can a member actually get to it?
 *
 * Three shipped or nearly shipped in this repository, each compiling,
 * typechecking and passing every test:
 *
 *   the native bridge   `installHost()` was exported and called from
 *                       nowhere and could not have been, because
 *                       `server.url` means the shell's bundle never loads.
 *                       Health, calendar, motion and push were all dead in
 *                       the installed app.
 *   calendar access     no code path ever requested the permission, so the
 *                       capability could not become true and the button
 *                       offering it was never rendered.
 *   payment             `/stripe/checkout`, `/topup` and `/portal` were
 *                       complete, guarded and covered by an idempotent
 *                       webhook — and nothing in the application called
 *                       any of them. The homepage advertised Premium at a
 *                       monthly price with a button reading "Start free".
 *                       The platform could not take money.
 *
 * The scanner is not clever and does not need to be. It lists every route
 * with no caller, grouped by guard, and a person decides. What this test
 * holds is the direction of travel: the list may shrink, and a new entry
 * fails the build on the commit that introduces it, which is the only
 * moment it is cheap to fix.
 */

const scan = (): Record<string, { method: string; path: string }[]> => {
  const out = execFileSync(
    'node',
    [new URL('../../../scripts/find-unreachable.mjs', import.meta.url).pathname, '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return (JSON.parse(out) as { byGuard: Record<string, { method: string; path: string }[]> }).byGuard;
};

const baseline = JSON.parse(
  readFileSync(new URL('./unreachable-baseline.json', import.meta.url), 'utf8'),
) as Record<string, string[]>;

const key = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

test('no new endpoint is added that nothing can reach', () => {
  const now = scan();

  for (const guard of Object.keys(baseline)) {
    const added = (now[guard] ?? []).map(key).filter((k) => !baseline[guard]!.includes(k));
    assert.deepEqual(
      added,
      [],
      `these ${guard} routes have no caller anywhere in the site:\n  ${added.join('\n  ')}\n` +
        'Wire a caller, publish it on /developers, or delete it. An endpoint nobody ' +
        'can reach is a feature that does not exist, and it will pass every other test.',
    );
  }
});

test('the member-facing list shrinks and is never quietly regrown', () => {
  /*
   * `self` is the category that matters. These are routes guarded with
   * `@SelfOnly` — which means they were built for a member to use — with
   * nothing in the application that uses them. Every one is a feature
   * somebody specified, built, guarded and then could not get to.
   */
  const now = (scan().self ?? []).map(key);
  const was = baseline.self ?? [];

  assert.ok(
    now.length <= was.length,
    `member-facing dead routes grew from ${was.length} to ${now.length}`,
  );

  if (now.length < was.length) {
    assert.fail(
      `${was.length - now.length} member-facing route(s) became reachable — good. Now ` +
        'regenerate apps/backend/test/unreachable-baseline.json so the ceiling comes ' +
        'down with them:\n  node scripts/find-unreachable.mjs --json',
    );
  }
});

test('the money path is reachable, because it was not', () => {
  /*
   * Named rather than left to the baseline. The baseline only notices
   * additions, and a regression here would put these back on a list that
   * is allowed to be non-empty — while the platform quietly stopped being
   * able to take a payment.
   */
  const panel = readFileSync(
    new URL('../../frontend/app/account/account-panel.tsx', import.meta.url),
    'utf8',
  );

  for (const route of ['/stripe/checkout', '/stripe/topup', '/stripe/portal']) {
    assert.ok(panel.includes(route), `nothing in the account panel calls ${route}`);
  }

  // The URL comes back from our own API, which got it from Stripe. A
  // checkout URL assembled on the client is one somebody else can
  // assemble too.
  assert.match(panel, /json\.data\?\.url/, 'the checkout URL is not taken from the API response');
  assert.doesNotMatch(panel, /checkout\.stripe\.com/, 'a Stripe URL is being built client-side');

  // And a deployment without the key says so rather than offering a
  // button that fails — the same honesty as the push `unconfigured` state.
  assert.match(panel, /secretKeyConfigured/);
  assert.match(panel, /Payments are not switched on/);
});
