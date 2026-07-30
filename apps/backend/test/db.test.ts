import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTRAINT_SUITE, MIGRATIONS } from '../src/db/embedded-sql.ts';
import { EXPECTED_CHECKS, stripPsqlMetaCommands } from '../src/db/sql-text.ts';

const repoRoot = join(import.meta.dirname, '..', '..', '..');

/* ------------------------------------------------------------------ *
 * The embedded SQL must be the SQL. A migration edited in db/ but not
 * re-embedded would deploy an old schema while the repo shows a new
 * one — the exact failure this suite exists to make loud.
 * ------------------------------------------------------------------ */

test('embedded migrations match db/migrations byte for byte', () => {
  const files = readdirSync(join(repoRoot, 'db', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  assert.deepEqual(
    MIGRATIONS.map((m) => m.id),
    files.map((f) => f.replace(/\.sql$/, '')),
    'run: node apps/backend/scripts/embed-sql.mjs',
  );
  for (const file of files) {
    const disk = readFileSync(join(repoRoot, 'db', 'migrations', file), 'utf8');
    const embedded = MIGRATIONS.find((m) => m.id === file.replace(/\.sql$/, ''))!;
    assert.equal(embedded.sql, disk, `${file} drifted — run: node apps/backend/scripts/embed-sql.mjs`);
  }
});

test('the embedded constraint suite matches db/test/constraints.sql', () => {
  const disk = readFileSync(join(repoRoot, 'db', 'test', 'constraints.sql'), 'utf8');
  assert.equal(CONSTRAINT_SUITE, disk, 'run: node apps/backend/scripts/embed-sql.mjs');
});

test('the suite carries exactly the expected number of checks', () => {
  // Each must_reject() call and each literal ok-select emits one ok-line.
  const rejections = (CONSTRAINT_SUITE.match(/SELECT pg_temp\.must_reject\(/g) ?? []).length;
  const positives = (CONSTRAINT_SUITE.match(/SELECT 'ok/g) ?? []).length;
  assert.equal(rejections + positives, EXPECTED_CHECKS);
});

/* ------------------------------------------------------------------ *
 * psql meta-commands must not reach the server.
 * ------------------------------------------------------------------ */

test('meta-commands are stripped, SQL and dollar-quoted bodies are not', () => {
  const sql = '\\set QUIET on\nSELECT 1;\n  \\pset tuples_only on\nDO $$ BEGIN RETURN; END $$;';
  const stripped = stripPsqlMetaCommands(sql);
  assert.ok(!stripped.includes('\\set'));
  assert.ok(!stripped.includes('\\pset'));
  assert.ok(stripped.includes('SELECT 1;'));
  assert.ok(stripped.includes('DO $$ BEGIN RETURN; END $$;'));
});

test('the real suite strips down to server-safe SQL', () => {
  const stripped = stripPsqlMetaCommands(CONSTRAINT_SUITE);
  assert.ok(!stripped.split('\n').some((l) => l.trimStart().startsWith('\\')));
  assert.ok(stripped.includes('CREATE OR REPLACE FUNCTION pg_temp.must_reject'));
  assert.ok(stripped.trimEnd().endsWith('ROLLBACK;'));
});
