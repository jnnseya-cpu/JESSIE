import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * The release has to be reproducible from a clean clone.
 *
 * It was not. `pnpm build` built shared, then the backend, then the
 * frontend — and never `@jessmove/body-command` or `@jessmove/foodlens`,
 * both of which the backend imports. From a fresh checkout it failed with
 * sixteen "cannot find module" errors, and so did `pnpm typecheck` and
 * `pnpm test`.
 *
 * It went unnoticed because nobody works from a clean clone. The dist
 * folders were always lying around from an earlier run, so every "the
 * build passes" and "types pass" claim was made against artefacts that
 * happened to exist rather than against the commit. The two `vercel.json`
 * files build all three packages explicitly, so deployment was never
 * affected — which is exactly why this could persist: the command that
 * ships is not the command anybody verifies with.
 *
 * These assertions are about the scripts rather than about a build,
 * because a test that runs the build would take minutes and would pass on
 * a dirty tree for the same reason the humans did.
 */

const root = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

const backendPkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const WORKSPACE_PACKAGES = ['@jessmove/shared', '@jessmove/body-command', '@jessmove/foodlens'];

test('every workspace package the backend depends on is built before it', () => {
  const deps = { ...backendPkg.dependencies, ...backendPkg.devDependencies };
  const needed = WORKSPACE_PACKAGES.filter((p) => p in deps);
  assert.ok(needed.length >= 2, `the backend declares only ${needed.length} workspace deps`);

  const prepare = root.scripts['build:packages'];
  assert.ok(prepare, 'there is no build:packages step');

  for (const pkg of needed) {
    assert.ok(
      prepare.includes(pkg),
      `${pkg} is imported by the backend and never built — a clean clone cannot compile`,
    );
  }
});

test('build, typecheck and test all prepare the packages first', () => {
  for (const script of ['build', 'typecheck', 'test'] as const) {
    const body = root.scripts[script];
    assert.ok(body, `there is no root ${script} script`);
    assert.ok(
      body.includes('build:packages'),
      `pnpm ${script} does not build the workspace packages, so it fails on a clean checkout`,
    );
  }
});

test('every pool handles the idle-client error that would otherwise end the process', () => {
  /*
   * node-postgres emits `error` on the Pool when an idle client loses its
   * connection — a restart, a failover, a maintenance window, any reset of
   * a socket nothing was using at the time. An `error` event with no
   * listener is not logged in Node; it is rethrown, and it takes the
   * process with it.
   *
   * Measured before the fix: stopping Postgres under a running API gave
   * `FATAL 57P01` and `[exited with code 1]`, after which every route
   * returned nothing — including /health, which touches no database. One
   * routine failover would have been a full outage rather than a degraded
   * one. After the fix the same test leaves /health, /system, /movements,
   * /acu/policy and /stripe/status all answering 200, and the pool
   * reconnects on its own when the database returns.
   *
   * Structural, because reproducing it needs a database to kill. What it
   * protects is that the listener exists and that nothing creates a pool
   * around `makePool` and misses it.
   */
  const pg = readFileSync(new URL('../src/db/pg.ts', import.meta.url), 'utf8');
  assert.match(pg, /\.on\?\.\('error'/, 'makePool no longer handles the pool error event');

  const sources = execFileSync(
    'grep',
    ['-rl', '--include=*.ts', "require('pg')", new URL('../src/', import.meta.url).pathname],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);

  assert.deepEqual(
    sources.map((p) => p.split('/').slice(-2).join('/')),
    ['db/pg.ts'],
    'a pool is being created outside makePool, so it has no error listener',
  );
});

test('the deploy commands build the same packages the verification commands do', () => {
  /*
   * The two vercel.json files were correct while the root scripts were
   * not, which is the shape of the original bug: what deploys and what is
   * checked have to be the same set, or checking proves nothing about
   * deploying.
   */
  const backendVercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  const frontendVercel = readFileSync(
    new URL('../../frontend/vercel.json', import.meta.url),
    'utf8',
  );

  for (const [name, config] of [
    ['backend', backendVercel],
    ['frontend', frontendVercel],
  ] as const) {
    for (const pkg of WORKSPACE_PACKAGES) {
      assert.ok(
        config.includes(pkg),
        `the ${name} deploy does not build ${pkg}`,
      );
    }
  }
});
