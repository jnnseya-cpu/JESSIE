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
 */
export function makePool<T = PgPoolLike>(url: string | undefined, max = 2): T | null {
  if (!url) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg') as { Pool: new (o: PoolOptions) => T };
  return new Pool(poolOptions(url, max));
}
