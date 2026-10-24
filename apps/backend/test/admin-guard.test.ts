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
 * A route "names a person" when it takes an account identifier from the
 * path, the query or the body. Such a route must carry `@SelfOnly`,
 * `@AdminOnly`, or be listed below with the reason it is safe without one.
 *
 * ── The allowlist is the part that failed ────────────────────────────
 *
 * This scanner worked. Two routes were open anyway, because both were on
 * `DELIBERATELY_OPEN` with a reason that read well and was wrong:
 *
 *   push.controller.ts:subscribe — "the endpoint attaches a device, and
 *   holds nothing readable back". It writes `user_id` into
 *   `push_subscriptions`, and the scheduler reads that column to decide
 *   whose Snaps go to an endpoint. The reason argued for anonymity, which
 *   is genuine, and quietly also permitted naming somebody else, which is
 *   not the same thing.
 *
 *   accounts.controller.ts:createAccount — "the identity table enforces
 *   the age and guardian rules on the insert itself". True, and about
 *   data validity rather than about who may call it. `POST /auth/register`
 *   is the real door and takes a credential first.
 *
 * An exemption with a plausible reason is harder to see than a missing
 * decorator, so two things changed: the reasons must now be about *who
 * may call the route*, and `the allowlist carries no stale exemptions`
 * below fails when an entry names a route that is guarded or gone. A
 * list that can quietly outlive its routes is a list nobody rereads.
 */

import { readdirSync, readFileSync } from 'node:fs';

/**
 * Controller source with its comments removed.
 *
 * Both scans below decide whether a guard is applied by looking for
 * `@SelfOnly(` or `@AdminOnly(` in the text around a route. A comment
 * that merely *mentions* one satisfies that, which means the scanner can
 * be silenced by writing prose — and the comment explaining why a route
 * needs its guard is exactly the prose somebody writes. The staleness
 * check found this by reporting a guarded route that is not guarded,
 * misled by the doc comment on the handler above it.
 *
 * Line comments are stripped first, so a block-comment terminator
 * written inside one cannot close a block that never opened.
 */
const withoutComments = (text: string): string =>
  text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

/** A controller split into one chunk per route, each starting at its verb. */
const routeChunks = (text: string): string[] =>
  text.split(/(?=@(?:Get|Post|Put|Delete|Patch)\()/);

/**
 * The decorators and body that actually belong to one route.
 *
 * Splitting on the route decorator gets the start of each route right and
 * the end of it wrong in both directions, and the second one is a
 * false negative — the dangerous kind:
 *
 *   @Post('unsubscribe')        ← no guard
 *   unsubscribe(...) { ... }
 *
 *   @SelfOnly('userId')         ← belongs to the NEXT route, and lands
 *   @Post('device')               in unsubscribe's chunk
 *
 * The chunk runs to the next verb, so it carries the following route's
 * guard, and an unguarded route followed by a guarded one reads as
 * guarded. Every route in this file but the last had that hole beneath
 * it. So a chunk is cut at the end of its own handler — the first line
 * that closes a method at the class's indentation — and the look-back for
 * decorators written above the verb takes only the previous chunk's
 * trailing run of decorator lines, never its body.
 */
function scopeFor(parts: readonly string[], index: number): string {
  const part = parts[index] ?? '';
  const end = part.indexOf('\n  }');
  const own = end === -1 ? part : part.slice(0, end + 4);

  const before = (parts[index - 1] ?? '').split('\n');
  const lead: string[] = [];
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const line = before[i] ?? '';
    if (line.trim() === '') continue;
    // A decorator, or a continuation line of a multi-line one.
    if (/^\s*@[A-Za-z]/.test(line) || /^\s*[)\]}],?$/.test(line)) {
      lead.unshift(line);
      continue;
    }
    break;
  }
  return lead.join('\n') + '\n' + own;
}

/**
 * Routes that take a user id and are deliberately open.
 *
 * Each needs a reason that survives somebody asking "why is this one
 * different" in six months. Adding to this list is a security decision.
 */
const DELIBERATELY_OPEN: Record<string, string> = {
  'push.controller.ts:unsubscribe':
    'Removes a subscription by its endpoint and names no account. Refusing without a session would strand devices whose session has expired, and an unsubscribe can only ever remove.',
};

test('every route that names a user id is guarded, or listed with a reason', () => {
  const root = new URL('../src/', import.meta.url);
  const controllers: { file: string; text: string }[] = [];

  const walk = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith('.controller.ts')) {
        controllers.push({ file: entry.name, text: withoutComments(readFileSync(next, 'utf8')) });
      }
    }
  };
  walk(root);
  assert.ok(controllers.length > 20, `only found ${controllers.length} controllers — the walk is wrong`);

  const unguarded: string[] = [];

  for (const { file, text } of controllers) {
    // One chunk per route, each examined with the decorators that apply
    // to it and no others — see `scopeFor`.
    const parts = routeChunks(text);
    for (let index = 0; index < parts.length; index += 1) {
      const scope = scopeFor(parts, index);
      if (!/^@(?:Get|Post|Put|Delete|Patch)\(/.test((parts[index] ?? '').trimStart())) continue;
      const part = scope;

      /*
       * Four spellings, not one.
       *
       * The scan covered `userId` only, which is the name eleven
       * controllers happen to use. `uid`, `memberId` and `accountId` name
       * the same thing and would have passed unread.
       */
      const namesUser =
        /@(?:Param|Query)\(\s*['"`](?:userId|uid|memberId|accountId)['"`]\s*\)/.test(part) ||
        /\bbody\.(?:userId|uid|memberId|accountId)\b/.test(part);
      if (!namesUser) continue;

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

/**
 * An exemption that no longer describes anything is deleted, not kept.
 *
 * Both of the routes this list used to excuse are guarded now. Left in
 * place the entries would still read as current policy — "subscribe is
 * deliberately open, here is why" — for a route where that is no longer
 * true, and the next person to open a hole in it would find the
 * justification already written and signed.
 */
test('the allowlist carries no stale exemptions', () => {
  const root = new URL('../src/', import.meta.url);
  const stale: string[] = [];

  for (const key of Object.keys(DELIBERATELY_OPEN)) {
    const [file, handler] = key.split(':');
    const found: string[] = [];
    const walk = (dir: URL) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        if (entry.isDirectory()) walk(next);
        else if (entry.name === file) found.push(withoutComments(readFileSync(next, 'utf8')));
      }
    };
    walk(root);

    if (found.length === 0) {
      stale.push(`${key} — ${file} no longer exists`);
      continue;
    }
    const parts = routeChunks(found[0] ?? '');
    const owns = new RegExp(`\\n\\s{2}(?:async\\s+)?${handler}\\s*\\(`);
    const index = parts.findIndex((p) => owns.test(p.slice(0, p.indexOf('\n  }') + 4 || undefined)));
    if (index === -1) {
      stale.push(`${key} — no handler named ${handler} in ${file}`);
      continue;
    }
    if (/@SelfOnly\(|@AdminOnly\(|assertScheduler\(/.test(scopeFor(parts, index))) {
      stale.push(`${key} — the route is guarded now, so the exemption is dead`);
    }
  }

  assert.deepEqual(
    stale,
    [],
    'remove these from DELIBERATELY_OPEN:\n  ' + stale.join('\n  '),
  );
});

/* ------------------------------------------------------------------ *
 * The two routes that were open, named
 *
 * The scan above is the general rule and would pass again if either fix
 * were replaced by a fresh exemption. These assert the fix itself,
 * because in both cases the reason it is needed is not visible in a diff.
 * ------------------------------------------------------------------ */

test('push/subscribe takes its owner from the session, never from the body', () => {
  const source = readFileSync(new URL('../src/push/push.controller.ts', import.meta.url), 'utf8');
  const after = source.slice(source.indexOf("@Post('subscribe')"));
  const handler = after.slice(0, after.indexOf('\n  }'));

  assert.match(
    handler,
    /userId:\s*session\?\.uid\s*\?\?\s*null/,
    'the stored owner must come from the verified session',
  );
  assert.doesNotMatch(
    handler,
    /userId:\s*body\.userId/,
    'a caller must not be able to name the member a push endpoint belongs to — ' +
      'the scheduler reads push_subscriptions.user_id to decide whose Snaps go there',
  );
});

test('account creation is not a second, open door past /auth/register', () => {
  const source = readFileSync(
    new URL('../src/accounts/accounts.controller.ts', import.meta.url),
    'utf8',
  );
  const before = source.slice(0, source.indexOf('create(@Body() body: CreateAccountDto)'));
  assert.match(
    before.slice(-500),
    /@AdminOnly\(\)/,
    'POST /accounts reaches createAccount with no credential; /auth/register takes one first, ' +
      'and createAccount refuses an id that exists — so an open door lets a stranger squat one',
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
