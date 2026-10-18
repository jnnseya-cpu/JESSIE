import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * The backend deployed nothing for eight weeks because the Vercel project
 * had no entry point and nothing said so. Every check here is a file that
 * has to exist for a deployment to serve anything at all; none of them
 * would have been noticed by a build, a typecheck or any other test,
 * because the application itself was always fine.
 *
 * Read as text rather than imported. Requiring the compiled handler would
 * make these assertions depend on `dist/`, and the point is to fail in the
 * one state where `dist/` is beside the point: the wiring is wrong.
 */

const root = join(import.meta.dirname, '..');
const repo = join(root, '..', '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

test('the Vercel function exists and re-exports the compiled handler', () => {
  const entry = read('api/index.js');
  assert.match(
    entry,
    /require\(['"]\.\.\/dist\/serverless['"]\)/,
    'api/index.js must require the compiled ../dist/serverless',
  );
  assert.match(entry, /\.handler\b/, 'it must take the handler export, not the module');
});

test('serverless.ts initialises without listening', () => {
  const source = read('src/serverless.ts');
  assert.match(source, /app\.init\(\)/, 'a serverless entry point must call init');
  assert.doesNotMatch(
    source,
    /app\.listen\(/,
    'nothing calls listen on a platform that never binds a socket',
  );
  assert.match(
    source,
    /configureApp\(app\)/,
    'both entry points must configure the app identically, or production drifts from local',
  );
  assert.match(
    source,
    /rawBody:\s*true/,
    'the Stripe signature is computed over the exact bytes Stripe sent',
  );
});

test('every path is routed to that one function', () => {
  const config = JSON.parse(read('vercel.json')) as {
    rewrites?: { source: string; destination: string }[];
    functions?: Record<string, unknown>;
    buildCommand?: string;
  };

  assert.ok(config.rewrites?.length, 'vercel.json must rewrite requests to the function');
  const catchAll = config.rewrites.find((r) => r.source === '/(.*)');
  assert.ok(catchAll, 'a catch-all rewrite is what carries /api/health to the function');
  assert.equal(catchAll.destination, '/api');

  assert.ok(
    config.functions && 'api/index.js' in config.functions,
    'the function Vercel builds must be the one api/index.js names',
  );
  assert.match(
    config.buildCommand ?? '',
    /@jessmove\/backend build/,
    'dist/ has to be built before the function is traced',
  );
});

/**
 * The one line that caused eight weeks of refused deployments.
 *
 * With a build command and no framework, Vercel treats the project as a
 * static build and refuses it with `STATIC_BUILD_NO_OUT_DIR` when no
 * output directory is found — it never reaches the function under `api/`.
 * Confirmed by running the platform's own builder locally: without this
 * key the build errors, with it the build completes and the function is
 * produced.
 *
 * Asserted as a pair. The key alone is not enough, because an output
 * directory Vercel cannot find is the same refusal, and the directory
 * alone does nothing.
 */
test('the output directory is declared and exists', () => {
  const config = JSON.parse(read('vercel.json')) as { outputDirectory?: string };
  const declared = config.outputDirectory;
  assert.ok(declared, 'vercel.json#outputDirectory must be set or the deployment is refused');

  const landing = readFileSync(join(root, declared, 'index.html'), 'utf8');
  assert.match(
    landing,
    /<html/i,
    'the declared directory must actually contain a page at deploy time',
  );
});

/**
 * The site's build command has to run the site's build script.
 *
 * It did not. `apps/frontend/vercel.json` ended in `next build`, skipping
 * `scripts/stamp-sw.mjs` — which is the only thing that writes
 * `public/sw.js` from its template, and that file is generated, not
 * committed. So every production build shipped a site whose service
 * worker registration asked for a file that was not there.
 */
test('the site build runs the site build script, not next directly', () => {
  const config = JSON.parse(
    readFileSync(join(repo, 'apps/frontend/vercel.json'), 'utf8'),
  ) as { buildCommand?: string };

  const command = config.buildCommand ?? '';
  assert.match(
    command,
    /@jessmove\/frontend build/,
    'the generated service worker and build stamp come from the package script',
  );
  assert.doesNotMatch(
    command,
    /&&\s*next build\s*$/,
    'ending in a bare next build is what skipped the stamp',
  );
});
