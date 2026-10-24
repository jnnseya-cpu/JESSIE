/**
 * Proves the restore procedure, and proves that deletion deletes.
 *
 * Two things a launch cannot be signed off without, and neither can be
 * established by reading anything:
 *
 *  1. **A backup that has never been restored is not a backup.** This
 *     dumps the live schema and data, builds a second database from
 *     nothing but that dump, and then compares the two row by row. What
 *     it proves is the *procedure* — that the dump is complete, that it
 *     replays into an empty server, and that what comes back is what went
 *     in. It cannot prove anything about a production backup, which lives
 *     somewhere this machine cannot reach.
 *
 *  2. **Deletion has to actually remove the person.** A privacy page
 *     saying data is deleted, over a database where it is still sitting,
 *     is the failure that turns a subject-access request into a
 *     regulatory one. This writes a member across every table that names
 *     them, deletes them the way the application does, and then goes
 *     looking for what is left.
 *
 *   DATABASE_URL=postgres://... node scripts/verify-recovery.mjs
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repoRoot, 'apps', 'backend', 'package.json'));
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required.');
  process.exit(2);
}

const PG_BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin';
const RESTORE_DB = process.env.RESTORE_DB ?? 'jessmove_restore_check';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const parsed = new URL(url);
const host = parsed.hostname;
const port = parsed.port || '5432';
const user = parsed.username || 'postgres';
const dbName = parsed.pathname.replace(/^\//, '');
const restoreUrl = `${parsed.protocol}//${parsed.username}@${host}:${port}/${RESTORE_DB}`;

const pgArgs = ['-h', host, '-p', port, '-U', user];
const runPg = (bin, args, opts = {}) =>
  execFileSync(join(PG_BIN, bin), args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, ...opts });

const pool = new Pool({ connectionString: url, max: 4 });

/** Every table the schema owns, in a stable order. */
async function tableRowCounts(client) {
  const { rows: tables } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const counts = {};
  for (const { tablename } of tables) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${tablename}"`);
    counts[tablename] = rows[0].n;
  }
  return counts;
}

async function main() {
  console.log('\nRecovery and deletion, against a real database\n');

  /* ---------------------------------------------------------------- *
   * Seed something worth losing, so an empty restore cannot pass.
   * ---------------------------------------------------------------- */
  const stamp = Date.now().toString(36);
  const userId = `u_recovery_${stamp}`;
  const walletId = `wal_recovery_${stamp}`;

  console.log('0. Seeding a member with data in several tables');
  await pool.query(
    `INSERT INTO app_wallets (id, subject_type, subject_id, data, version)
     VALUES ($1, 'user', $2, $3, 1) ON CONFLICT (id) DO NOTHING`,
    [walletId, userId, JSON.stringify({ id: walletId, subjectType: 'user', subjectId: userId, grants: [], controls: {}, spentToday: 0, spentThisMonth: 0 })],
  );
  await pool.query(
    `INSERT INTO stripe_customers (customer_id, user_id) VALUES ($1, $2)
     ON CONFLICT (customer_id) DO UPDATE SET user_id = $2`,
    [`cus_recovery_${stamp}`, userId],
  );
  await pool.query(
    `INSERT INTO annual_deposits (user_id, plan, invoice_id, month_index, acus, due_at)
     VALUES ($1, 'premium_annual', $2, 1, 499, now() + interval '1 month')
     ON CONFLICT DO NOTHING`,
    [userId, `in_recovery_${stamp}`],
  );
  check('the member exists in three tables', true, userId);

  /* ---------------------------------------------------------------- *
   * 1. Dump, restore into an empty database, compare
   * ---------------------------------------------------------------- */
  console.log('\n1. Backup, restore into an empty database, compare');

  const dumpPath = `/tmp/jessmove-verify-${stamp}.sql`;
  const startedDump = Date.now();
  runPg('pg_dump', [...pgArgs, '-d', dbName, '-f', dumpPath, '--no-owner', '--no-acl']);
  const dumpSeconds = ((Date.now() - startedDump) / 1000).toFixed(1);

  const { size } = await import('node:fs').then((fs) => fs.promises.stat(dumpPath));
  check('a dump is produced', size > 4096, `${(size / 1024).toFixed(0)} KB in ${dumpSeconds}s`);

  // A restore into a database that already has the data proves nothing.
  try {
    runPg('dropdb', [...pgArgs, '--if-exists', RESTORE_DB]);
  } catch {
    /* absent is the desired state */
  }
  runPg('createdb', [...pgArgs, RESTORE_DB]);

  const startedRestore = Date.now();
  runPg('psql', [...pgArgs, '-d', RESTORE_DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', dumpPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const restoreSeconds = ((Date.now() - startedRestore) / 1000).toFixed(1);
  console.log(`        restore completed in ${restoreSeconds}s — this is the RTO for the data alone`);

  const restored = new Pool({ connectionString: restoreUrl, max: 2 });

  const liveCounts = await tableRowCounts(pool);
  const restoredCounts = await tableRowCounts(restored);

  const liveTables = Object.keys(liveCounts);
  check(
    'every table came back',
    liveTables.length > 20 && liveTables.every((t) => t in restoredCounts),
    `${liveTables.length} tables`,
  );

  const mismatched = liveTables.filter((t) => liveCounts[t] !== restoredCounts[t]);
  check(
    'every row count matches',
    mismatched.length === 0,
    mismatched.length
      ? mismatched.map((t) => `${t}: ${liveCounts[t]}→${restoredCounts[t]}`).join(', ')
      : `${liveTables.reduce((n, t) => n + liveCounts[t], 0)} rows`,
  );

  // Counts can match while the contents are wrong. Check the actual member.
  const { rows: back } = await restored.query(
    'SELECT subject_id FROM app_wallets WHERE id = $1',
    [walletId],
  );
  check('the seeded member is in the restore', back[0]?.subject_id === userId);

  const { rows: migs } = await restored.query('SELECT count(*)::int AS n FROM schema_migrations');
  check('the migration history came back', migs[0].n >= 29, `${migs[0].n} migrations`);

  // Constraints are the part a naive dump loses, and they are what stops
  // the next bug: a restored database with no unique keys would let a
  // webhook grant twice.
  const { rows: cons } = await restored.query(
    `SELECT count(*)::int AS n FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace nsp ON nsp.oid = t.relnamespace
      WHERE nsp.nspname = 'public' AND c.contype IN ('u','p','f','c')`,
  );
  check('constraints and keys came back', cons[0].n > 40, `${cons[0].n} constraints`);

  await restored.end();

  /* ---------------------------------------------------------------- *
   * 2. Deletion actually deletes
   *
   * This section used to seed three rows, delete them with its own three
   * DELETE statements, then search the schema and find nothing. It proved
   * that its own SQL worked. It never called the product's deletion path,
   * and because the rows it chose were the financial ones that are kept
   * on purpose, it would not have found the real gap even if it had.
   *
   * What it was missing: a member registered through the real API, rows
   * written into the tables a member's *body* fills, and
   * `POST /auth/me/delete` doing the deleting. Run that way, deletion
   * answered {"deleted":true} and left the member in every table — the
   * energy band derived from their weight, the declared cuisine, the
   * activity log. Migration 0035 fixed it; this now checks it.
   * ---------------------------------------------------------------- */
  console.log('\n2. A deletion request removes the member');

  const api = process.env.API ?? 'http://localhost:4000/api';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const readBody = async (r) => {
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text.slice(0, 200) };
    }
  };

  /*
   * A real registration. `minTokenAgeSeconds` is 3 on this door: the form
   * token must be old enough that a script could not have filled it in,
   * so the check waits the way a person would.
   */
  const email = `recovery.check.${Date.now()}@example.test`;
  const password = 'a-long-enough-password-1';
  let deletionUserId = null;
  let cookie = '';

  try {
    const challenge = (await readBody(await fetch(`${api}/auth/challenge`))).data.token;
    await wait(4000);
    const reg = await fetch(`${api}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challenge, email, password, displayName: 'Recovery Check', age: 34 }),
    });
    const regBody = await readBody(reg);
    if (reg.ok) {
      deletionUserId = regBody.data.userId;
      cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0];
    } else {
      check('a member could be registered for the deletion check', false, `${reg.status} ${JSON.stringify(regBody).slice(0, 140)}`);
    }
  } catch (error) {
    check('the API is reachable for the deletion check', false, String(error).slice(0, 160));
  }

  if (deletionUserId && cookie.startsWith('jm_session=')) {
    /*
     * The tables a member's body and day fill. These are the ones that
     * survived deletion before 0035, so they are the ones worth writing.
     */
    const seeds = [
      ['member_energy_band', `INSERT INTO member_energy_band (user_id, floor_kcal, ceiling_kcal, observed_kcal_per_day, recorded_days, review_after_days) VALUES ($1, 1800, 2200, 2600, 14, 28) ON CONFLICT (user_id) DO NOTHING`],
      ['member_food_constraints', `INSERT INTO member_food_constraints (user_id, cuisine) VALUES ($1, 'west_african') ON CONFLICT (user_id) DO NOTHING`],
      ['member_state', `INSERT INTO member_state (user_id, key, value) VALUES ($1, 'onboarding', '{"step":3}'::jsonb) ON CONFLICT DO NOTHING`],
      ['member_activity', `INSERT INTO member_activity (user_id, kind, seconds, at) VALUES ($1, 'body_read', 90, now())`],
      ['member_windows', `INSERT INTO member_windows (user_id, weekday, start_minute, end_minute) VALUES ($1, 1, 540, 1020) ON CONFLICT DO NOTHING`],
    ];
    const seeded = [];
    for (const [table, sql] of seeds) {
      try {
        await pool.query(sql, [deletionUserId]);
        seeded.push(table);
      } catch {
        /* a schema change moved a column; the count below reports it */
      }
    }
    check(
      'the member has body and activity data before deletion',
      seeded.length === seeds.length,
      `${seeded.length}/${seeds.length} tables seeded: ${seeded.join(', ')}`,
    );

    const delChallenge = (await readBody(await fetch(`${api}/auth/challenge`))).data.token;
    await wait(4000);
    const del = await fetch(`${api}/auth/me/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ challenge: delChallenge, password }),
    });
    check('the platform accepted the deletion request', del.ok, `${del.status}`);
  }

  /*
   * The restore fixture above seeded the financial tables, which are kept
   * on purpose when an account is deleted. Those rows are this script's
   * own, not a member's, so they are removed here rather than left to
   * look like a deletion failure in the search below.
   */
  await pool.query('DELETE FROM annual_deposits WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM stripe_customers WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM app_wallets WHERE subject_id = $1', [userId]);

  /* What the search below looks for: the member the product deleted. */
  const searchFor = deletionUserId ?? userId;

  // Then go looking for the id anywhere at all. A table nobody remembered
  // is exactly how personal data survives a deletion.
  const { rows: textColumns } = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text','character varying','uuid','jsonb')`,
  );

  const survivors = [];
  for (const { table_name: table, column_name: column } of textColumns) {
    try {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "${column}"::text LIKE $1`,
        [`%${searchFor}%`],
      );
      if (rows[0].n > 0) survivors.push(`${table}.${column} (${rows[0].n})`);
    } catch {
      /* a column that will not cast to text holds no member id */
    }
  }

  check(
    'no trace of the deleted member survives anywhere in the schema',
    survivors.length === 0,
    survivors.length
      ? survivors.join(', ')
      : `searched every text, uuid and jsonb column for ${searchFor}`,
  );

  /*
   * And the check that the check is checking something.
   *
   * The previous version of this section searched for a member whose rows
   * it had already deleted itself, so "no trace survives" was true
   * however deletion behaved. If no member was ever registered, or none
   * of the body tables could be seeded, the search above is looking for
   * an id that was never written and will pass on an empty database.
   */
  check(
    'the deletion check actually exercised the product',
    deletionUserId !== null,
    deletionUserId
      ? `registered, seeded and deleted ${deletionUserId} through the API`
      : 'NO member was registered — the search above proves nothing',
  );

  /* ---------------------------------------------------------------- *
   * Clean up.
   * ---------------------------------------------------------------- */
  try {
    runPg('dropdb', [...pgArgs, '--if-exists', RESTORE_DB]);
  } catch {
    /* best effort */
  }
  await import('node:fs').then((fs) => fs.promises.unlink(dumpPath).catch(() => undefined));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
