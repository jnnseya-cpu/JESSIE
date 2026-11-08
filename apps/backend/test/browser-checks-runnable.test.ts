/**
 * The browser-driven checks must be able to launch a browser.
 *
 * This exists because of a failure that produced no failing test. Eight
 * scripts each carried their own copy of
 * `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. The build image
 * later shipped chromium-1243 under a differently shaped directory, and
 * every one of those scripts lost the ability to start a browser. Nothing
 * went red. `check:contrast`, `check:layout` and `verify:journeys` simply
 * stopped being checks, which is the worse outcome, because a check that
 * cannot run is indistinguishable from a check that found nothing wrong.
 *
 * So: the path lives in `scripts/chromium.mjs` and nowhere else, and this
 * test fails if a second copy appears. It asserts the scan found the
 * scripts before it asserts the scripts are clean — the launch-audit
 * pattern, after five separate controls were found passing while testing
 * nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..', '..');
const RESOLVER = join(REPO, 'scripts', 'chromium.mjs');

/** Every `.mjs` under the two script directories, with its source. */
function scriptSources(): { path: string; rel: string; source: string }[] {
  const dirs = [
    join(REPO, 'scripts'),
    join(REPO, 'apps', 'frontend', 'scripts'),
  ];
  const out: { path: string; rel: string; source: string }[] = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.mjs')) continue;
      const path = join(dir, name);
      out.push({
        path,
        rel: path.slice(REPO.length + 1),
        source: readFileSync(path, 'utf8'),
      });
    }
  }
  return out;
}

/** A script that starts a browser, as opposed to one that does not. */
function launchesABrowser(source: string): boolean {
  return /chromium\.launch\(/.test(source);
}

test('the scan found the script directories and the launchers in them', () => {
  const scripts = scriptSources();
  assert.ok(
    scripts.length >= 15,
    `expected to find the repository's .mjs scripts, found ${scripts.length}`,
  );

  const launchers = scripts.filter((s) => launchesABrowser(s.source));
  assert.ok(
    launchers.length >= 8,
    'expected at least eight browser-driven scripts; found ' +
      `${launchers.length}. If the scripts moved, this scan is now ` +
      'measuring nothing and must be pointed at the new location.',
  );
});

test('the Chromium path is written down in exactly one place', () => {
  const offenders: string[] = [];
  for (const { rel, path, source } of scriptSources()) {
    if (path === RESOLVER) continue;
    // A version-numbered Playwright directory is never stable. The image
    // renumbers it, and the script silently stops working.
    if (/pw-browsers\/chromium-\d+/.test(source)) {
      offenders.push(`${rel} hard-codes a version-numbered Chromium path`);
    }
    // Even the stable symlink belongs behind the resolver, so there is one
    // place to change and one place that reports a missing browser.
    if (/executablePath:\s*['"`]/.test(source)) {
      offenders.push(`${rel} passes a literal executablePath`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'Chromium paths must come from scripts/chromium.mjs:\n' +
      offenders.map((o) => `  ${o}`).join('\n'),
  );
});

test('every browser-driven script resolves its browser through the resolver', () => {
  const missing: string[] = [];
  for (const { rel, path, source } of scriptSources()) {
    if (path === RESOLVER) continue;
    if (!launchesABrowser(source)) continue;
    if (!/chromium\.mjs['"]/.test(source)) {
      missing.push(rel);
    }
  }
  assert.deepEqual(
    missing,
    [],
    'these scripts launch a browser without importing scripts/chromium.mjs: ' +
      missing.join(', '),
  );
});

test('the resolver prefers the stable symlink and refuses to guess', () => {
  const source = readFileSync(RESOLVER, 'utf8');

  // The override comes first so CI or a developer can point elsewhere.
  const overrideAt = source.indexOf('process.env.CHROMIUM');
  const symlinkAt = source.indexOf("join(PW_ROOT, 'chromium')");
  const versionedAt = source.indexOf('chromium-\\d+');
  assert.ok(overrideAt > 0, 'the resolver must honour a CHROMIUM override');
  assert.ok(symlinkAt > 0, 'the resolver must try the stable symlink');
  assert.ok(
    versionedAt > symlinkAt,
    'the stable symlink must be tried before any version-numbered path',
  );

  // The whole point is that it fails loudly. A resolver that returns a
  // path it has not checked reproduces the original failure.
  assert.match(
    source,
    /throw new Error\(/,
    'the resolver must throw when no browser is found, not return a guess',
  );
  assert.match(
    source,
    /existsSync\(path\)/,
    'the resolver must check a path exists before returning it',
  );
});
