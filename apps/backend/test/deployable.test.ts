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
