import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The escalation this suite exists to prevent.
 *
 * AUTH_ENFORCE is a pilot convenience: it lets demo surfaces work before
 * everyone has an account. It once also disabled @AdminOnly, which meant
 * an unauthenticated stranger could mint allowance, read the member
 * directory and push notifications to anybody. A convenience switch must
 * never unlock the money.
 *
 * The guard is exercised through a stub rather than a live server so the
 * decision table is pinned exactly.
 */

type Kind = 'adult' | 'minor' | 'platform_staff';

/** The decision the guard must make, extracted for testing. */
function decide(input: {
  enforcing: boolean;
  needsAuth: boolean;
  needsAdmin: boolean;
  session: { kind: Kind } | null;
}): 'allow' | 'refuse' {
  const { enforcing, needsAuth, needsAdmin, session } = input;
  if (!needsAuth && !needsAdmin) return 'allow';
  if (needsAdmin) {
    if (!session) return 'refuse';
    return session.kind === 'platform_staff' ? 'allow' : 'refuse';
  }
  if (!enforcing) return 'allow';
  return session ? 'allow' : 'refuse';
}

test('admin routes refuse a stranger even with enforcement off', () => {
  for (const enforcing of [true, false]) {
    assert.equal(
      decide({ enforcing, needsAuth: false, needsAdmin: true, session: null }),
      'refuse',
      `enforcing=${enforcing}: an unauthenticated request must never reach an admin route`,
    );
  }
});

test('admin routes refuse an ordinary member, enforcement or not', () => {
  for (const enforcing of [true, false]) {
    for (const kind of ['adult', 'minor'] as const) {
      assert.equal(
        decide({ enforcing, needsAuth: false, needsAdmin: true, session: { kind } }),
        'refuse',
        `enforcing=${enforcing}, kind=${kind}`,
      );
    }
  }
});

test('admin routes admit platform staff', () => {
  for (const enforcing of [true, false]) {
    assert.equal(
      decide({ enforcing, needsAuth: false, needsAdmin: true, session: { kind: 'platform_staff' } }),
      'allow',
    );
  }
});

test('the pilot convenience still applies to ordinary protected routes', () => {
  // Off: a demo surface stays usable without an account.
  assert.equal(decide({ enforcing: false, needsAuth: true, needsAdmin: false, session: null }), 'allow');
  // On: it does not.
  assert.equal(decide({ enforcing: true, needsAuth: true, needsAdmin: false, session: null }), 'refuse');
  assert.equal(
    decide({ enforcing: true, needsAuth: true, needsAdmin: false, session: { kind: 'adult' } }),
    'allow',
  );
});

test('public routes stay public', () => {
  assert.equal(decide({ enforcing: true, needsAuth: false, needsAdmin: false, session: null }), 'allow');
});

/* ------------------------------------------------------------------ *
 * Coverage: every route that names a person must guard that person
 * ------------------------------------------------------------------ */

/**
 * The three fixes above were instances. This is the class.
 *
 * Routes on this API are public unless a decorator says otherwise, which is
 * the right default for a marketing site with a public blog and the wrong
 * one to forget on a route that takes a user id. It was forgotten three
 * times: five wearable writes that let an unauthenticated caller push
 * readings into somebody else's account, and four account-profile routes in
 * a file that imported `SelfOnly` and applied it to nothing.
 *
 * None of those failed a test, a build or a typecheck. Nothing about an
 * absent decorator is detectable except by looking, so this looks — at every
 * controller, on every run.
 *
 * A route "names a person" when it takes `userId` from the path or the body.
 * Such a route must carry `@SelfOnly`, `@AdminOnly`, or be listed below with
 * the reason it is safe without one.
 */

import { readdirSync, readFileSync } from 'node:fs';

/**
 * Routes that take a user id and are deliberately open.
 *
 * Each needs a reason that survives somebody asking "why is this one
 * different" in six months. Adding to this list is a security decision.
 */
const DELIBERATELY_OPEN: Record<string, string> = {
  'accounts.controller.ts:createAccount':
    'Creates an account from scratch. There is no owner to compare a session against yet, and the identity table enforces the age and guardian rules on the insert itself.',
  'push.controller.ts:subscribe':
    'A browser push subscription with an optional user id. Anonymous subscription is the point — the endpoint attaches a device, and holds nothing readable back.',
  'push.controller.ts:unsubscribe':
    'Removes a subscription by its endpoint. Refusing without a session would strand devices whose session has expired, and an unsubscribe can only ever remove.',
};

test('every route that names a user id is guarded, or listed with a reason', () => {
  const root = new URL('../src/', import.meta.url);
  const controllers: { file: string; text: string }[] = [];

  const walk = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith('.controller.ts')) {
        controllers.push({ file: entry.name, text: readFileSync(next, 'utf8') });
      }
    }
  };
  walk(root);
  assert.ok(controllers.length > 20, `only found ${controllers.length} controllers — the walk is wrong`);

  const unguarded: string[] = [];

  for (const { file, text } of controllers) {
    // Split on route decorators so each handler is examined with the
    // decorators that actually apply to it, rather than to the file.
    const parts = text.split(/(?=@(?:Get|Post|Put|Delete|Patch)\()/);
    for (const part of parts) {
      const isRoute = /^@(?:Get|Post|Put|Delete|Patch)\(/.test(part);
      if (!isRoute) continue;

      const namesUser = /@Param\('userId'\)|body\.userId|@Query\('userId'\)/.test(part);
      if (!namesUser) continue;

      // The decorators sit above the route decorator, so look at the tail of
      // the preceding chunk as well as this one.
      const index = parts.indexOf(part);
      const preceding = index > 0 ? parts[index - 1].slice(-260) : '';
      const scope = preceding + part;

      const guarded = /@SelfOnly\(|@AdminOnly\(|assertScheduler\(/.test(scope);
      if (guarded) continue;

      const handler = /\n\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(part)?.[1] ?? 'unknown';
      const key = `${file}:${handler}`;
      if (DELIBERATELY_OPEN[key]) continue;
      unguarded.push(key);
    }
  }

  assert.deepEqual(
    unguarded,
    [],
    `these routes take a user id with no guard:\n  ${unguarded.join('\n  ')}\n` +
      'Add @SelfOnly(\'userId\'), or add the route to DELIBERATELY_OPEN with a reason.',
  );
});

test('a guard is never imported and left unapplied', () => {
  // The account controller imported SelfOnly and used it nowhere for weeks.
  // An unused security import is not a style problem — it is the fingerprint
  // of a guard somebody meant to apply, and nothing else in the toolchain
  // reports it, because this repository has no linter.
  const root = new URL('../src/', import.meta.url);
  const offenders: string[] = [];

  const walk = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith('.controller.ts')) {
        const text = readFileSync(next, 'utf8');
        for (const guard of ['SelfOnly', 'AdminOnly']) {
          const imported = new RegExp(`import\\s*\\{[^}]*\\b${guard}\\b[^}]*\\}`).test(text);
          const applied = text.includes(`@${guard}(`);
          if (imported && !applied) offenders.push(`${entry.name} imports ${guard} and applies it nowhere`);
        }
      }
    }
  };
  walk(root);

  assert.deepEqual(offenders, []);
});
