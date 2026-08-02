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
