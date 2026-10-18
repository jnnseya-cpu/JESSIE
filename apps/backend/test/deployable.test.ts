import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * The backend deployed nothing between 19 August and 18 October 2026, and
 * no test, build or typecheck noticed, because the application was always
 * fine. Only its deployment configuration was wrong.
 *
 * Every assertion here is one of the ways that configuration was wrong, or
 * was made wrong while guessing at it. They are written from the
 * platform's own build output — `npx vercel build --prod` with a
 * `.vercel/project.json` stub, which needs no account and no token — and
 * not from documentation.
 *
 * Read as text rather than imported. These are facts about files, and the
 * point is to fail in the one state where `dist/` is beside the point.
 */

const root = join(import.meta.dirname, '..');
const repo = join(root, '..', '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

/**
 * The project uses Vercel's backend framework preset for Nest, which
 * searches the **output directory** for `src/main.*`, `main.*`, `app.*` or
 * `server.*` and runs it as a listening server.
 *
 * `nest build` emits `dist/main.js`, so the output directory has to be
 * `dist`. Pointing it anywhere else is the whole outage:
 *
 *   [BUILD_FAILED] No entrypoint found in output directory: "public"
 *
 * Asserted as a pair, because the key naming a directory the compiler does
 * not write to fails exactly the same way.
 */
test('the output directory is where the compiler puts the server', () => {
  const config = JSON.parse(read('vercel.json')) as {
    outputDirectory?: string;
    buildCommand?: string;
  };

  assert.equal(
    config.outputDirectory,
    'dist',
    'the preset looks for the server entrypoint inside outputDirectory',
  );
  assert.match(
    config.buildCommand ?? '',
    /@jessmove\/backend build/,
    'and something has to compile dist/main.js before it looks',
  );
  assert.equal(
    JSON.parse(read('tsconfig.json')).compilerOptions.outDir,
    './dist',
    'if the compiler ever emits elsewhere, outputDirectory has to follow',
  );
});

/** The entrypoint the preset runs has to be a server that listens. */
test('main.ts listens, and on the port the platform gives it', () => {
  const source = read('src/main.ts');
  assert.match(source, /app\.listen\(/, 'the backend preset runs a listening server');
  assert.match(
    source,
    /process\.env\.PORT/,
    'the platform injects PORT; a hard-coded 4000 would never be reached',
  );
  assert.match(
    source,
    /configureApp\(app\)/,
    'the one entry point must apply the one configuration',
  );
});

/**
 * No `api/` directory, ever, in this project.
 *
 * A serverless handler was put there while the real fault was being hunted.
 * Its presence alone makes the builder emit
 *
 *   { "src": "^/api(/.*)?$", "status": 404 }
 *
 * **ahead of** the catch-all that reaches the server — a 404 over the
 * entire API, because every route here sits under the `api` global prefix.
 * It also builds a second 22 MB copy of the whole application.
 *
 * This is the most expensive kind of mistake available: the build goes
 * green and the deployment serves nothing.
 */
test('nothing lives in api/, which would 404 the whole API', () => {
  assert.equal(
    existsSync(join(root, 'api')),
    false,
    'an api/ directory makes the builder shadow every /api path with a 404',
  );
});

/**
 * No rewrites either, for a reason the build log states itself:
 *
 *   WARNING! Internal rewrites in backend framework projects now route
 *   requests using the rewritten destination path.
 *
 * A catch-all rewrite to `/api` therefore delivers every request to the
 * path `/api`, which this application answers with a 404.
 */
test('no rewrites, because this preset routes by the destination path', () => {
  const config = JSON.parse(read('vercel.json')) as { rewrites?: unknown[] };
  assert.equal(
    config.rewrites,
    undefined,
    'the preset already routes every path to the server, with the path preserved',
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
