/**
 * How this platform connects to Postgres — decided once, here.
 *
 * Every store used to carry its own copy of
 *
 *     ssl: url.includes('sslmode=require') || url.includes('vercel') ? … : undefined
 *
 * which is a guess about the connection string rather than a fact about
 * the server. A perfectly ordinary hosted URL with no `sslmode` parameter
 * in it got no SSL, the provider refused the connection, and all eleven
 * pools failed at once: login, registration, activity, drafts, wallets,
 * groups, challenges, media. Everything except the static pages, which is
 * indistinguishable from the platform being down.
 *
 * The rule is now the other way round, which is the only safe default:
 * **anything that is not on this machine gets SSL.** A managed Postgres
 * requires it; a local one does not have a certificate. `sslmode=disable`
 * is honoured for the rare deployment that terminates TLS elsewhere.
 *
 * There is a connection timeout too. On serverless, a pool pointed at an
 * unreachable host without one holds the request open until the platform
 * kills it, so a wrong host reads as "slow" instead of "wrong".
 */

export interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

export interface PoolOptions {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  ssl?: { rejectUnauthorized: boolean };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** True when the database is on this machine, and so has no certificate. */
export function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LOCAL_HOSTS.has(host);
  } catch {
    // An unparseable URL is not something to assume is local.
    return false;
  }
}

export function needsSsl(url: string): boolean {
  if (/sslmode=disable/i.test(url)) return false;
  return !isLocalDatabase(url);
}

export function poolOptions(url: string, max = 2): PoolOptions {
  return {
    connectionString: url,
    // Serverless: many instances each holding a small pool, never one big one.
    max,
    connectionTimeoutMillis: 8_000,
    ...(needsSsl(url) ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

/**
 * A pool, or null when there is no DATABASE_URL.
 *
 * `pg` is required lazily so a deployment without a database — or without
 * the package — still boots and runs in memory rather than failing at
 * import time.
 *
 * **Every pool gets an `error` listener, and that listener is the reason
 * this function exists rather than each store calling `new Pool`.**
 *
 * `node-postgres` emits `error` on the Pool when a client that is sitting
 * idle loses its connection — a Postgres restart, a failover, a
 * maintenance window, a network reset, anything that closes a socket the
 * application was not using at the time. In Node, an `error` event with no
 * listener is not an error that gets logged; it is rethrown, and it takes
 * the process with it.
 *
 * Measured, not theorised. Stopping Postgres under a running API produced
 * `FATAL 57P01: terminating connection due to administrator command` and
 * then `[exited with code 1]`, after which every route returned nothing —
 * including `/health`, which touches no database, and including the
 * static reads the platform promises keep working when the database is
 * unhappy. One routine failover would have been a full outage rather than
 * a degraded one.
 *
 * The listener does nothing but record it. That is the whole fix: the
 * pool already discards the broken client and opens a new one on the next
 * query, and it was only ever the missing listener that turned a recovery
 * into a crash.
 */
export function makePool<T = PgPoolLike>(url: string | undefined, max = 2): T | null {
  if (!url) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg') as { Pool: new (o: PoolOptions) => T };
  const pool = new Pool(poolOptions(url, max));

  const emitter = pool as unknown as { on?: (event: string, fn: (err: Error) => void) => void };
  emitter.on?.('error', (err: Error) => {
    // eslint-disable-next-line no-console
    console.error(
      `[pg] idle client error, connection discarded and the pool continues: ${err.message}`,
    );
  });

  return pool;
}
