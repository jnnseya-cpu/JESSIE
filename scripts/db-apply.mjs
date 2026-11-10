#!/usr/bin/env node
/**
 * Developer-side database tooling — no psql required.
 *
 *   node scripts/db-apply.mjs migrate   # apply db/migrations/*.sql
 *   node scripts/db-apply.mjs test      # run db/test/constraints.sql
 *
 * Wired as `pnpm db:migrate` / `pnpm db:test`. Needs DATABASE_URL and the
 * repo's installed dependencies (pg comes with the backend workspace).
 *
 * In deployment none of this is needed: the backend applies its own
 * schema on startup (apps/backend/src/db/db.service.ts) and reports at
 * /api/db/status and /api/db/verify. This script exists for developers
 * working against a local database, and it shares the same
 * schema_migrations bookkeeping so the two never fight.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Example:');
  console.error("  DATABASE_URL='postgres://user:pass@host/db' pnpm db:migrate");
  process.exit(1);
}

const mode = process.argv[2];
if (mode !== 'migrate' && mode !== 'test') {
  console.error('usage: node scripts/db-apply.mjs <migrate|test>');
  process.exit(1);
}

// pg is a backend dependency; resolve it from that workspace.
const require = createRequire(join(repoRoot, 'apps', 'backend', 'package.json'));
const { Pool } = require('pg');

const stripMeta = (sql) =>
  sql.split('\n').filter((line) => !line.trimStart().startsWith('\\')).join('\n');

const rowsOf = (result) =>
  (Array.isArray(result) ? result : [result]).flatMap((r) => r.rows ?? []);

// Same adoption rule as the backend's self-migration: a landmark table
// present without a record means the migration ran by hand — record it.
const ADOPTION_MARKERS = { '0001_core': 'tenants', '0002_identity': 'app_users' };
const LOCK_KEY = 724_700_121;

/**
 * How many promises db/test/constraints.sql makes.
 *
 * Read out of `sql-text.ts` rather than restated here. An earlier version
 * of this file kept its own copy of the number, which is two numbers that
 * must agree — and two numbers that must agree eventually do not. This is
 * a regex rather than an import because this script is plain JavaScript
 * run before anything is built.
 */
const EXPECTED_CHECKS = (() => {
  const source = readFileSync(
    join(repoRoot, 'apps', 'backend', 'src', 'db', 'sql-text.ts'),
    'utf8',
  );
  const found = /export const EXPECTED_CHECKS = (\d+);/.exec(source);
  if (!found) {
    throw new Error(
      'could not read EXPECTED_CHECKS from apps/backend/src/db/sql-text.ts. ' +
        'Refusing to guess: a wrong count here makes a missing constraint ' +
        'look like a passing suite.',
    );
  }
  return Number(found[1]);
})();

const pool = new Pool({
  connectionString: url,
  max: 1,
  ssl: url.includes('sslmode=require') || url.includes('vercel')
    ? { rejectUnauthorized: true }
    : undefined,
});

const client = await pool.connect();
let failed = false;
try {
  if (mode === 'migrate') {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id         text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now(),
         adopted    boolean NOT NULL DEFAULT false
       )`,
    );
    const done = new Set(rowsOf(await client.query('SELECT id FROM schema_migrations')).map((r) => r.id));

    const files = readdirSync(join(repoRoot, 'db', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const id = file.replace(/\.sql$/, '');
      if (done.has(id)) {
        console.log(`up to date — ${id}`);
        continue;
      }
      const marker = ADOPTION_MARKERS[id];
      const existing = marker
        ? rowsOf(await client.query('SELECT to_regclass($1) AS t', [`public.${marker}`]))[0]?.t
        : null;
      if (existing != null) {
        await client.query(
          'INSERT INTO schema_migrations (id, adopted) VALUES ($1, true) ON CONFLICT (id) DO NOTHING',
          [id],
        );
        console.log(`adopted    — ${id} (schema already present)`);
        continue;
      }
      await client.query(stripMeta(readFileSync(join(repoRoot, 'db', 'migrations', file), 'utf8')));
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id]);
      console.log(`applied    — ${id}`);
    }
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
  } else {
    const suite = readFileSync(join(repoRoot, 'db', 'test', 'constraints.sql'), 'utf8');
    const checks = rowsOf(await client.query(stripMeta(suite)))
      .flatMap((r) => Object.values(r))
      .filter((v) => typeof v === 'string' && v.startsWith('ok'));
    for (const line of checks) console.log(line);
    /*
     * The count is pinned so a rule cannot leave the suite quietly. A
     * check that stops running reports nothing: the suite still says
     * "all passed", with one fewer promise behind it. Raising this
     * number is ordinary work; lowering it means a constraint was
     * removed, and that should be argued for in the commit.
     */
    console.log(`\n${checks.length} checks passed (expected ${EXPECTED_CHECKS})`);
    if (checks.length !== EXPECTED_CHECKS) {
      failed = true;
      console.error('check count mismatch — a rule is missing or the suite changed without updating this count');
    }
  }
} catch (err) {
  failed = true;
  console.error(err.message);
} finally {
  client.release();
  await pool.end();
}
process.exit(failed ? 1 : 0);
