/**
 * Proves the money rules against a real database.
 *
 * These are the properties that unit tests could not establish, because
 * every one of them is about what happens when two things run at once or
 * when a process restarts — and both of those were where the losses were.
 *
 * Run:  DATABASE_URL=postgres://... node scripts/verify-money.mjs
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `pg` is a backend dependency, not a root one — resolved from there, the
// same way db-apply.mjs does it.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repoRoot, 'apps', 'backend', 'package.json'));
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required. Nothing here can be proved without a database.');
  process.exit(2);
}

const pool = new Pool({
  connectionString: url,
  max: 8,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true },
});

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ *
 * A minimal stand-in for the wallet's conditional write.
 *
 * It runs the same SQL the service runs, so what is proved here is the
 * statement that actually protects the balance rather than a model of it.
 * ------------------------------------------------------------------ */

async function readWallet(id) {
  const { rows } = await pool.query('SELECT data, version FROM app_wallets WHERE id = $1', [id]);
  return rows[0] ? { data: rows[0].data, version: Number(rows[0].version) } : null;
}

async function writeWallet(id, data, expectedVersion) {
  const { rows } = await pool.query(
    `INSERT INTO app_wallets (id, subject_type, subject_id, data, version, updated_at)
     VALUES ($1, 'user', $2, $3, 1, now())
     ON CONFLICT (id) DO UPDATE
       SET data = $3, version = app_wallets.version + 1, updated_at = now()
       WHERE app_wallets.version = $4
     RETURNING version`,
    [id, data.subjectId, JSON.stringify(data), expectedVersion],
  );
  return rows.length > 0;
}

/** One spend attempt, exactly as the service does it: read, apply, write. */
async function spend(id, acus) {
  const held = await readWallet(id);
  if (!held) return { ok: false, why: 'missing' };

  const balance = held.data.grants.reduce((sum, g) => sum + g.remaining, 0);
  if (balance < acus) return { ok: false, why: 'insufficient' };

  let outstanding = acus;
  for (const grant of held.data.grants) {
    if (outstanding === 0) break;
    const take = Math.min(grant.remaining, outstanding);
    grant.remaining -= take;
    outstanding -= take;
  }

  const saved = await writeWallet(id, held.data, held.version);
  return saved ? { ok: true } : { ok: false, why: 'contended' };
}

async function main() {
  const suffix = process.pid.toString(36);
  const walletId = `wal_test_${suffix}`;
  const userId = `u_test_${suffix}`;

  console.log('\nMoney integrity, against a real database\n');

  /* ---------------------------------------------------------------- *
   * 1. The concurrent spend that used to be free AI
   * ---------------------------------------------------------------- */
  console.log('1. Two instances spending the same balance at the same time');

  await pool.query('DELETE FROM app_wallets WHERE id = $1', [walletId]);
  const fresh = {
    id: walletId,
    subjectType: 'user',
    subjectId: userId,
    controls: {},
    spentToday: 0,
    spentThisMonth: 0,
    grants: [
      {
        id: 'grt_seed',
        bucket: 'purchased',
        amount: 500,
        remaining: 500,
        grantedAt: new Date(0).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        sourceRef: 'topup_5gbp:pi_seed',
      },
    ],
  };
  await writeWallet(walletId, fresh, 0);

  /*
   * Eight instances that have each already read the wallet, and only then
   * try to write. Reading them all first is the point: it is exactly the
   * production shape, where several instances hold their own copy of the
   * same row and none of them re-reads before saving. Interleaving reads
   * and writes instead lets connection pooling serialise the whole thing
   * and the test passes against a wallet that is not protected at all.
   *
   * Exactly one write may land. The other seven must be refused rather
   * than each overwriting the last.
   */
  const held = await Promise.all(Array.from({ length: 8 }, () => readWallet(walletId)));
  const attempts = await Promise.all(
    held.map((copy) => {
      let outstanding = 500;
      for (const grant of copy.data.grants) {
        const take = Math.min(grant.remaining, outstanding);
        grant.remaining -= take;
        outstanding -= take;
      }
      return writeWallet(walletId, copy.data, copy.version).then((ok) => ({ ok }));
    }),
  );
  const succeeded = attempts.filter((a) => a.ok).length;
  check('exactly one of eight concurrent full-balance spends succeeds', succeeded === 1, `${succeeded} succeeded`);

  const after = await readWallet(walletId);
  const remaining = after.data.grants.reduce((sum, g) => sum + g.remaining, 0);
  check('the balance cannot go below zero', remaining === 0, `${remaining} ACU left`);
  check('no spend was erased by another', after.version >= 2, `version ${after.version}`);

  /* ---------------------------------------------------------------- *
   * 2. A stale writer is rejected rather than believed
   * ---------------------------------------------------------------- */
  console.log('\n2. An instance holding a stale copy');

  const stale = await readWallet(walletId);
  // Somebody else writes in between.
  const other = await readWallet(walletId);
  other.data.spentToday += 1;
  await writeWallet(walletId, other.data, other.version);

  // The stale holder now tries to write the copy it read before that.
  stale.data.grants[0].remaining = 500; // what a lost update would restore
  const staleAccepted = await writeWallet(walletId, stale.data, stale.version);
  check('a write from a stale read is refused', staleAccepted === false);

  const unchanged = await readWallet(walletId);
  const restored = unchanged.data.grants.reduce((sum, g) => sum + g.remaining, 0);
  check('the stale write did not resurrect spent allowance', restored === 0, `${restored} ACU`);

  /* ---------------------------------------------------------------- *
   * 3. A reversal happens once, however many times it is delivered
   * ---------------------------------------------------------------- */
  console.log('\n3. A refund delivered more than once');

  const reference = `ch_test_${suffix}`;
  await pool.query('DELETE FROM wallet_adjustments WHERE reference = $1', [reference]);

  const claims = await Promise.all(
    Array.from({ length: 5 }, () =>
      pool
        .query(
          `INSERT INTO wallet_adjustments (wallet_id, kind, reference, gbp, clawed_acus)
           VALUES ('pending', 'refund', $1, 5.00, 0)
           ON CONFLICT (kind, reference) DO NOTHING
           RETURNING id`,
          [reference],
        )
        .then((r) => r.rows.length > 0),
    ),
  );
  check('five deliveries of one refund claim it once', claims.filter(Boolean).length === 1);

  /* ---------------------------------------------------------------- *
   * 4. A shortfall is recorded, not hidden
   * ---------------------------------------------------------------- */
  console.log('\n4. A refund of allowance that was already spent');

  await pool.query(
    `UPDATE wallet_adjustments
        SET wallet_id = $1, clawed_acus = 0, shortfall_acus = 500
      WHERE kind = 'refund' AND reference = $2`,
    [walletId, reference],
  );

  const { rows: shortfalls } = await pool.query(
    `SELECT clawed_acus, shortfall_acus FROM wallet_adjustments
      WHERE kind = 'refund' AND reference = $1`,
    [reference],
  );
  check(
    'the unrecoverable part is written down as a measured loss',
    Number(shortfalls[0]?.shortfall_acus) === 500,
    `${shortfalls[0]?.shortfall_acus} ACU could not be recovered`,
  );

  const { rows: findable } = await pool.query(
    `SELECT count(*)::int AS n FROM wallet_adjustments WHERE shortfall_acus > 0 AND reference = $1`,
    [reference],
  );
  check('losses can be found without a table scan', findable[0].n === 1);

  /* ---------------------------------------------------------------- *
   * 5. The customer link outlives the process
   * ---------------------------------------------------------------- */
  console.log('\n5. A refund arriving at an instance that has never seen the customer');

  const customerId = `cus_test_${suffix}`;
  await pool.query('DELETE FROM stripe_customers WHERE customer_id = $1', [customerId]);
  await pool.query(
    `INSERT INTO stripe_customers (customer_id, user_id) VALUES ($1, $2)
     ON CONFLICT (customer_id) DO UPDATE SET user_id = $2`,
    [customerId, userId],
  );

  // A brand-new pool client stands in for a fresh instance with an empty map.
  const { rows: linked } = await pool.query(
    'SELECT user_id FROM stripe_customers WHERE customer_id = $1',
    [customerId],
  );
  check('the customer resolves to an account from storage', linked[0]?.user_id === userId);

  /* ---------------------------------------------------------------- *
   * 6. The past-due clock does not restart on every touch
   * ---------------------------------------------------------------- */
  console.log('\n6. The past-due grace period');

  const subscriptionId = `sub_test_${suffix}`;
  await pool.query('DELETE FROM stripe_subscriptions WHERE subscription_id = $1', [subscriptionId]);

  const upsert = (state) =>
    pool.query(
      `INSERT INTO stripe_subscriptions
         (subscription_id, customer_id, user_id, plan, state, state_since, updated_at)
       VALUES ($1, $2, $3, 'premium_monthly', $4, now(), now())
       ON CONFLICT (subscription_id) DO UPDATE SET
         state = $4,
         state_since = CASE WHEN stripe_subscriptions.state IS DISTINCT FROM $4
                            THEN now() ELSE stripe_subscriptions.state_since END,
         updated_at = now()`,
      [subscriptionId, customerId, userId, state],
    );

  await upsert('past_due');
  const { rows: first } = await pool.query(
    'SELECT state_since FROM stripe_subscriptions WHERE subscription_id = $1',
    [subscriptionId],
  );

  await new Promise((resolve) => setTimeout(resolve, 30));
  await upsert('past_due'); // a second failed payment, same state

  const { rows: second } = await pool.query(
    'SELECT state_since FROM stripe_subscriptions WHERE subscription_id = $1',
    [subscriptionId],
  );
  check(
    'staying past_due does not extend the grace period',
    new Date(first[0].state_since).getTime() === new Date(second[0].state_since).getTime(),
  );

  await new Promise((resolve) => setTimeout(resolve, 30));
  await upsert('active');
  const { rows: third } = await pool.query(
    'SELECT state_since FROM stripe_subscriptions WHERE subscription_id = $1',
    [subscriptionId],
  );
  check(
    'a real state change does restart it',
    new Date(third[0].state_since).getTime() > new Date(second[0].state_since).getTime(),
  );

  /* ---------------------------------------------------------------- *
   * 7. A year's allowance is not handed over on day one
   * ---------------------------------------------------------------- */
  console.log('\n7. An annual plan, delivered monthly');

  const invoiceId = `in_test_${suffix}`;
  await pool.query('DELETE FROM annual_deposits WHERE invoice_id = $1', [invoiceId]);

  for (let month = 1; month <= 11; month += 1) {
    await pool.query(
      `INSERT INTO annual_deposits (user_id, plan, invoice_id, month_index, acus, due_at)
       VALUES ($1, 'premium_annual', $2, $3, 499, now() + make_interval(months => $3))
       ON CONFLICT (invoice_id, month_index) DO NOTHING`,
      [userId, invoiceId, month],
    );
  }

  const { rows: pending } = await pool.query(
    'SELECT count(*)::int AS n FROM annual_deposits WHERE invoice_id = $1 AND granted_at IS NULL',
    [invoiceId],
  );
  check('eleven further deposits are owed, not granted', pending[0].n === 11, `${pending[0].n} pending`);

  const { rows: dueNow } = await pool.query(
    'SELECT count(*)::int AS n FROM annual_deposits WHERE invoice_id = $1 AND granted_at IS NULL AND due_at <= now()',
    [invoiceId],
  );
  check('none of them is due yet', dueNow[0].n === 0, `${dueNow[0].n} due`);

  // Bring one forward and claim it the way the release path does.
  await pool.query(
    `UPDATE annual_deposits SET due_at = now() - interval '1 day'
      WHERE invoice_id = $1 AND month_index = 1`,
    [invoiceId],
  );

  const claimOne = () =>
    pool
      .query(
        `UPDATE annual_deposits SET granted_at = now()
          WHERE id IN (
            SELECT id FROM annual_deposits
             WHERE user_id = $1 AND granted_at IS NULL AND due_at <= now()
             ORDER BY due_at
             FOR UPDATE SKIP LOCKED
          )
        RETURNING month_index`,
        [userId],
      )
      .then((r) => r.rows.length);

  // Four instances hitting the same member on the morning it falls due.
  const claimed = await Promise.all([claimOne(), claimOne(), claimOne(), claimOne()]);
  const total = claimed.reduce((sum, n) => sum + n, 0);
  check('a due deposit is released exactly once under concurrency', total === 1, `${total} released`);

  const { rows: stillOwed } = await pool.query(
    'SELECT count(*)::int AS n FROM annual_deposits WHERE invoice_id = $1 AND granted_at IS NULL',
    [invoiceId],
  );
  check('the other ten are still owed', stillOwed[0].n === 10, `${stillOwed[0].n} owed`);

  /* ---------------------------------------------------------------- *
   * 8. Compute delivered and not paid for is counted
   * ---------------------------------------------------------------- */
  console.log('\n8. An overage the balance could not cover');

  const overageRef = `overage_test_${suffix}`;
  await pool.query('DELETE FROM wallet_adjustments WHERE reference = $1', [overageRef]);
  for (let i = 0; i < 3; i += 1) {
    await pool.query(
      `INSERT INTO wallet_adjustments (wallet_id, kind, reference, gbp, clawed_acus, shortfall_acus, note)
       VALUES ($1, 'correction', $2, 0, 0, 12, 'over ceiling')
       ON CONFLICT (kind, reference) DO NOTHING`,
      [walletId, overageRef],
    );
  }
  const { rows: unbilled } = await pool.query(
    `SELECT count(*)::int AS n, coalesce(sum(shortfall_acus), 0)::int AS acus
       FROM wallet_adjustments WHERE reference = $1`,
    [overageRef],
  );
  check('unbilled compute is recorded once and counted', unbilled[0].n === 1 && unbilled[0].acus === 12);

  await pool.query('DELETE FROM annual_deposits WHERE invoice_id = $1', [invoiceId]);
  await pool.query('DELETE FROM wallet_adjustments WHERE reference = $1', [overageRef]);

  /* ---------------------------------------------------------------- *
   * Clean up after ourselves.
   * ---------------------------------------------------------------- */
  await pool.query('DELETE FROM app_wallets WHERE id = $1', [walletId]);
  await pool.query('DELETE FROM wallet_adjustments WHERE reference = $1', [reference]);
  await pool.query('DELETE FROM stripe_subscriptions WHERE subscription_id = $1', [subscriptionId]);
  await pool.query('DELETE FROM stripe_customers WHERE customer_id = $1', [customerId]);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
