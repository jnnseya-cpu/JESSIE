import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CONSTRAINT_SUITE, MIGRATIONS } from './embedded-sql';
import { EXPECTED_CHECKS, stripPsqlMetaCommands } from './sql-text';

/**
 * The database migrates itself.
 *
 * The person deploying this platform clicks "create database" in the
 * Vercel dashboard and does not own a terminal. So the schema is not a
 * step they perform — it is something the backend does on startup:
 *
 *  1. When DATABASE_URL is set, `onModuleInit` applies every migration
 *     that has not been applied yet, recorded in `schema_migrations`.
 *  2. A Postgres advisory lock makes concurrent serverless instances
 *     take turns; whoever arrives second finds the work done.
 *  3. A schema that was applied by hand before this service existed is
 *     *adopted*, not re-run: if the migration's landmark table already
 *     exists, it is recorded as applied.
 *
 * GET /db/status reports what happened; GET /db/verify replays the
 * constraint suite (every statement inside BEGIN…ROLLBACK, so the data
 * is untouched) and reports how many safeguarding rules the live
 * database proved it refuses to violate. Both are browser-openable —
 * that is the point.
 */

// Arbitrary constant. All instances agree on it; that is its whole job.
const MIGRATION_LOCK_KEY = 724_700_121;

/**
 * A table each migration creates. If it exists but schema_migrations has
 * no record, the migration ran by hand (psql) before self-migration
 * existed — record it as applied instead of failing on CREATE TYPE.
 */
const ADOPTION_MARKERS: Record<string, string> = {
  '0001_core': 'tenants',
  '0002_identity': 'app_users',
};

interface PgClientLike {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
  release: () => void;
}

interface PgPoolLike {
  connect: () => Promise<PgClientLike>;
  end: () => Promise<void>;
}

interface QueryResultLike {
  rows: Record<string, unknown>[];
}

/** pg returns one result for a single statement, an array for several. */
function collectRows(result: unknown): Record<string, unknown>[] {
  const results = Array.isArray(result) ? result : [result];
  return results.flatMap((r) => (r as QueryResultLike).rows ?? []);
}

export interface MigrateOutcome {
  readonly applied: string[];
  readonly adopted: string[];
  readonly alreadyApplied: string[];
}

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool: PgPoolLike | null = null;
  private outcome: MigrateOutcome | null = null;
  private lastError: string | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      // Lazy so environments without the pg package still boot in memory mode.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg') as { Pool: new (o: object) => PgPoolLike };
      this.pool = new Pool({
        connectionString: url,
        max: 2, // serverless: many instances × small pools, not one big pool
        ssl: url.includes('sslmode=require') || url.includes('vercel')
          ? { rejectUnauthorized: true }
          : undefined,
      });
    }
  }

  configured(): boolean {
    return this.pool !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.warn('no DATABASE_URL — schema not applied, stores run in memory');
      return;
    }
    try {
      const outcome = await this.migrate();
      const summary = [
        outcome.applied.length && `applied ${outcome.applied.join(', ')}`,
        outcome.adopted.length && `adopted ${outcome.adopted.join(', ')}`,
        outcome.alreadyApplied.length && `up to date: ${outcome.alreadyApplied.join(', ')}`,
      ].filter(Boolean).join('; ');
      this.logger.log(`schema: ${summary || 'nothing to do'}`);
    } catch (err) {
      // The API still starts — /db/status carries the error instead of the
      // whole deployment failing on a schema problem.
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error(`schema migration failed: ${this.lastError}`);
    }
  }

  async migrate(): Promise<MigrateOutcome> {
    if (!this.pool) throw new Error('DATABASE_URL is not set');
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
      await client.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           id         text PRIMARY KEY,
           applied_at timestamptz NOT NULL DEFAULT now(),
           adopted    boolean NOT NULL DEFAULT false
         )`,
      );

      const done = new Set(
        collectRows(await client.query('SELECT id FROM schema_migrations')).map((r) => String(r.id)),
      );

      const outcome: MigrateOutcome = { applied: [], adopted: [], alreadyApplied: [] };
      for (const migration of MIGRATIONS) {
        if (done.has(migration.id)) {
          outcome.alreadyApplied.push(migration.id);
          continue;
        }

        const marker = ADOPTION_MARKERS[migration.id];
        const markerRows = marker
          ? collectRows(await client.query('SELECT to_regclass($1) AS t', [`public.${marker}`]))
          : [];
        if (marker && markerRows[0]?.t != null) {
          await client.query(
            'INSERT INTO schema_migrations (id, adopted) VALUES ($1, true) ON CONFLICT (id) DO NOTHING',
            [migration.id],
          );
          outcome.adopted.push(migration.id);
          continue;
        }

        await client.query(stripPsqlMetaCommands(migration.sql));
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [
          migration.id,
        ]);
        outcome.applied.push(migration.id);
      }

      this.outcome = outcome;
      this.lastError = null;
      return outcome;
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      } finally {
        client.release();
      }
    }
  }

  async status(): Promise<Record<string, unknown>> {
    if (!this.pool) {
      return {
        configured: false,
        note: 'DATABASE_URL is not set — connect a Postgres database in the Vercel Storage tab and redeploy.',
      };
    }
    let recorded: { id: string; appliedAt: string; adopted: boolean }[] = [];
    let readError: string | null = null;
    const client = await this.pool.connect();
    try {
      recorded = collectRows(
        await client.query('SELECT id, applied_at, adopted FROM schema_migrations ORDER BY id'),
      ).map((r) => ({
        id: String(r.id),
        appliedAt: r.applied_at instanceof Date ? r.applied_at.toISOString() : String(r.applied_at),
        adopted: Boolean(r.adopted),
      }));
    } catch (err) {
      readError = err instanceof Error ? err.message : String(err);
    } finally {
      client.release();
    }
    return {
      configured: true,
      migrationsExpected: MIGRATIONS.map((m) => m.id),
      migrationsApplied: recorded,
      upToDate: readError == null && MIGRATIONS.every((m) => recorded.some((r) => r.id === m.id)),
      lastError: this.lastError ?? readError,
      startupOutcome: this.outcome,
    };
  }

  /**
   * Replays db/test/constraints.sql against the live database. The suite
   * ends in ROLLBACK, so nothing it inserts survives; what comes back is
   * the list of safeguarding rules the database proved it enforces.
   */
  async verify(): Promise<Record<string, unknown>> {
    if (!this.pool) {
      return { configured: false, ran: false, note: 'DATABASE_URL is not set.' };
    }
    const client = await this.pool.connect();
    try {
      const rows = collectRows(await client.query(stripPsqlMetaCommands(CONSTRAINT_SUITE)));
      const checks = rows
        .flatMap((r) => Object.values(r))
        .filter((v): v is string => typeof v === 'string' && v.startsWith('ok'))
        .map((v) => v.replace(/^ok\s+—\s+/, ''));
      return {
        configured: true,
        ran: true,
        passed: checks.length,
        expected: EXPECTED_CHECKS,
        allEnforced: checks.length === EXPECTED_CHECKS,
        checks,
      };
    } catch (err) {
      return {
        configured: true,
        ran: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
