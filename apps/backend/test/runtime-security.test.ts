import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  NODE_SECURITY_FLOOR,
  NODE_UNSUPPORTED_MAJORS,
  runtimeReport,
} from '../src/health/runtime.logic.ts';

/**
 * The October 2026 Node fixes, and the floor this platform holds.
 *
 * 22.23.4, 24.22.1 and 26.12.1 carry fixes for several high-severity
 * faults, the worst allowing code execution on the server. 20 and
 * earlier are end of life and will not be fixed.
 */

test('an end-of-life line is never reported as patched', () => {
  for (const major of NODE_UNSUPPORTED_MAJORS) {
    const r = runtimeReport(`v${major}.99.99`);
    assert.equal(r.patched, false, `Node ${major} is end of life however high its patch number`);
    assert.match(
      r.says ?? '',
      /no longer receives security fixes/,
      'and the reason has to say so rather than pointing at a patch release that does not exist',
    );
  }
});

test('a supported line below its patched release is not patched', () => {
  // The version this container happens to run, which is itself below the
  // floor — the check has to be true of the machine writing it.
  assert.equal(runtimeReport('v22.22.2').patched, false);
  assert.equal(runtimeReport('v24.22.0').patched, false);
  assert.equal(runtimeReport('v26.12.0').patched, false);

  const r = runtimeReport('v22.22.2');
  assert.match(r.says ?? '', /22\.23\.4/, 'the fix has to name the version that fixes it');
});

test('a patched release, and anything above it, passes', () => {
  for (const [major, floor] of Object.entries(NODE_SECURITY_FLOOR)) {
    assert.equal(runtimeReport(`v${floor}`).patched, true, `exactly ${floor} is patched`);
    const [a, b, c] = floor.split('.').map(Number);
    assert.equal(
      runtimeReport(`v${a}.${b}.${(c ?? 0) + 1}`).patched,
      true,
      `a later patch of ${major} is patched`,
    );
    assert.equal(
      runtimeReport(`v${a}.${(b ?? 0) + 1}.0`).patched,
      true,
      `a later minor of ${major} is patched`,
    );
  }
});

/**
 * Comparison by number, never by string.
 *
 * `'22.9.0' > '22.23.4'` is true as text and false as a version, and that
 * is the defect that makes a security floor silently stop working on the
 * tenth patch release.
 */
test('versions compare numerically, not lexically', () => {
  assert.equal(runtimeReport('v22.9.0').patched, false, '22.9.0 is older than 22.23.4');
  assert.equal(runtimeReport('v22.100.0').patched, true, '22.100.0 is newer');
});

test('a line nobody assessed is not given the benefit of the doubt', () => {
  const r = runtimeReport('v28.0.0');
  assert.equal(r.patched, false, 'an unknown line is reported, not assumed safe');
  assert.match(r.says ?? '', /newer than anything this build was checked against/);
});

test('the version is accepted with or without the v prefix', () => {
  assert.deepEqual(runtimeReport('v22.23.4'), runtimeReport('22.23.4'));
});

/**
 * The declared floor and the enforced floor have to be the same number.
 *
 * `engines.node` is what a tool reads to decide whether this project may
 * be installed. If it drifts below the patched release then the
 * repository is simultaneously reporting a runtime as unpatched and
 * declaring that runtime acceptable.
 */
test('engines.node is not below the patched release it reports against', () => {
  const root = join(import.meta.dirname, '..', '..', '..');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    engines?: { node?: string };
  };

  const declared = (pkg.engines?.node ?? '').replace(/^[^\d]*/, '');
  assert.ok(declared, 'engines.node must declare a floor');
  assert.equal(
    runtimeReport(declared).patched,
    true,
    `engines.node declares ${declared}, which this build would report as unpatched`,
  );
});
