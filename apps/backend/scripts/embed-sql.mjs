import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generates src/db/embedded-sql.ts from the canonical SQL under db/.
 *
 * The schema's single source of truth stays in db/migrations and
 * db/test/constraints.sql, where psql and code review can see it. This
 * script copies those files into a TypeScript module so the compiled
 * backend carries them: a serverless bundle traces `require`s, not
 * loose .sql files, and a migration that silently failed to ship would
 * be worse than this small generation step.
 *
 * Runs as part of `pnpm --filter @jessmove/backend build`. The generated
 * file is committed; test/db.test.ts fails if it drifts from db/.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const migrationsDir = join(repoRoot, 'db', 'migrations');

/*
 * This script reads from the repository root, two levels above the app it
 * builds. On Vercel that only exists in the build when the project's
 * "Include files outside the Root Directory" setting is on, which every
 * pnpm workspace needs anyway.
 *
 * When it is off, the failure is a bare ENOENT stack trace in a build log,
 * pointing at `readdirSync` and naming no cause — which is a long way from
 * the one checkbox that fixes it. So the trace is replaced by the
 * sentence. The same reasoning as `adviceFor` in db.service.ts: an error
 * that only a person who already knows the answer can read is not an
 * error message.
 */
if (!existsSync(migrationsDir)) {
  console.error(
    [
      `Cannot read ${migrationsDir}.`,
      '',
      'The schema lives at the repository root, two levels above this app,',
      'so the build needs the whole workspace and not just apps/backend.',
      '',
      'On Vercel: Settings -> Build and Deployment -> turn on "Include files',
      'outside the Root Directory in the Build Step". A pnpm workspace needs',
      'it regardless of this script.',
      '',
      'Failing here on purpose. A backend built without its migrations would',
      'start, find a schema it has no record of, and be wrong about the',
      'database rather than unable to reach it.',
    ].join('\n'),
  );
  process.exit(1);
}

const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({
    id: f.replace(/\.sql$/, ''),
    sql: readFileSync(join(migrationsDir, f), 'utf8'),
  }));

const suite = readFileSync(join(repoRoot, 'db', 'test', 'constraints.sql'), 'utf8');

const out = `/**
 * GENERATED FILE — do not edit. Source of truth: db/migrations/*.sql and
 * db/test/constraints.sql. Regenerate with:
 *
 *   node apps/backend/scripts/embed-sql.mjs
 *
 * (runs automatically in the backend build). test/db.test.ts fails the
 * suite if this file drifts from the SQL it was generated from.
 */

export interface EmbeddedMigration {
  readonly id: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly EmbeddedMigration[] = [
${migrations.map((m) => `  { id: ${JSON.stringify(m.id)}, sql: ${JSON.stringify(m.sql)} },`).join('\n')}
];

export const CONSTRAINT_SUITE: string = ${JSON.stringify(suite)};
`;

const target = join(here, '..', 'src', 'db', 'embedded-sql.ts');
writeFileSync(target, out);
console.log(`embedded ${migrations.length} migrations + constraint suite -> ${target}`);
