import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIGRATIONS } from '../src/db/embedded-sql.ts';

/**
 * Every table that holds a member must lose them when they are deleted.
 *
 * `/assurance` tells the public "Deleting an account deletes everything
 * derived from it", and for most of this schema's life that was false.
 * `deleteAccount` drops an in-memory profile, deletes two push tables and
 * deletes from `app_users` — which cascades to whatever has a foreign
 * key. Sixteen member-keyed tables had none.
 *
 * It was measured, not inferred: a member registered through the real
 * API, rows written as the services write them, `POST /auth/me/delete`
 * answering `{"deleted":true}` — and the member still present in all
 * seven tables that had been written, among them `member_energy_band`
 * (a kcal floor derived from weight and BMI), `member_food_constraints`
 * (a declared cuisine, which can reveal religion and is special-category
 * data under UK GDPR Article 9) and `member_activity`.
 *
 * Migration 0035 made it structural. This test is what stops it
 * regressing, because the failure mode is not a broken line of code — it
 * is a *new table*, added next quarter by someone who has never read
 * `deleteAccount`, holding a `user_id` and no constraint. Nothing else in
 * the toolchain notices that.
 *
 * Read from the embedded migration SQL rather than a live database so it
 * runs in CI with no Postgres, the same way `db.test.ts` does.
 */

const SQL = MIGRATIONS.map((m) => m.sql).join('\n');

/**
 * Tables retained on purpose when an account is deleted, each with the
 * reason it is lawful to keep.
 *
 * UK GDPR Article 17(3)(b) permits retention where it is needed to meet
 * a legal obligation, and UK company and tax law requires transaction
 * records for years after a relationship ends. Deleting these would
 * destroy the audit trail for money that actually moved.
 *
 * Adding to this list is a privacy decision, not a convenience: whatever
 * is named here must also be named on the public page, because an
 * exception stated is a policy and an exception unstated is a false
 * promise.
 */
const RETAINED: Record<string, string> = {
  app_wallets:
    'Accounting record, and polymorphic — subject_type is user, family or organisation, so subject_id cannot carry a foreign key to app_users at all.',
  annual_deposits:
    'Accounting record: what was paid for and what is still owed on an annual plan.',
  stripe_customers:
    'The link between an account and a payment that really happened. Reconciliation needs it.',
  stripe_subscriptions:
    'Accounting record of a subscription that was charged.',
  security_events:
    'Kept with the identity severed, not deleted — the foreign key is ON DELETE SET NULL. An audit trail that a deletion can erase is not an audit trail.',
};

/** Columns that name a member. */
const MEMBER_COLUMNS = ['user_id', 'subject_id'];

/**
 * Tables declaring a member-naming column of type `text`.
 *
 * Type matters. Ten tables declare `user_id uuid`, and `app_users.user_id`
 * is text holding values like `u_71cc93d4-00c` — a uuid column cannot
 * store that, so those tables cannot hold a real member and are left out
 * rather than counted as leaks. They are a dead identity scheme and are
 * recorded as such in docs/STATE-OF-PLAY.md.
 */
function memberKeyedTables(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const createRe = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/g;

  for (const match of SQL.matchAll(createRe)) {
    const table = match[1];
    const columns = match[2] ?? '';
    if (!table) continue;
    const named = MEMBER_COLUMNS.filter((c) =>
      new RegExp(`^\\s*${c}\\s+text\\b`, 'm').test(columns),
    );
    if (named.length === 0) continue;
    found.set(table, [...new Set([...(found.get(table) ?? []), ...named])]);
  }
  return found;
}

/** Tables given a cascading foreign key to app_users, inline or by ALTER. */
function cascadingTables(): Set<string> {
  const cascades = new Set<string>();

  // ALTER TABLE x ADD CONSTRAINT ... REFERENCES app_users ... ON DELETE CASCADE
  const alterRe =
    /ALTER TABLE\s+([a-z_]+)\s+ADD CONSTRAINT[\s\S]{0,200}?REFERENCES\s+app_users\s*\([^)]*\)\s*ON DELETE CASCADE/g;
  for (const m of SQL.matchAll(alterRe)) if (m[1]) cascades.add(m[1]);

  // Inline, inside a CREATE TABLE body.
  const createRe = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/g;
  for (const m of SQL.matchAll(createRe)) {
    const table = m[1];
    const columns = m[2] ?? '';
    if (table && /REFERENCES\s+app_users\s*\([^)]*\)\s*ON DELETE CASCADE/.test(columns)) {
      cascades.add(table);
    }
  }
  return cascades;
}

test('the scan parses the schema, and finds enough of it to mean anything', () => {
  /*
   * The failure mode of a schema-reading test is parsing nothing and
   * reporting a pass — which is exactly how the original deletion check
   * passed for months. There are well over forty tables and at least a
   * dozen member-keyed ones; a scan that finds a handful has stopped
   * parsing, not stopped finding defects.
   */
  const tables = memberKeyedTables();
  const cascades = cascadingTables();

  assert.ok(MIGRATIONS.length >= 35, `only ${MIGRATIONS.length} migrations embedded`);
  assert.ok(
    tables.size >= 12,
    `only ${tables.size} member-keyed tables parsed — the scanner has broken`,
  );
  assert.ok(
    cascades.size >= 12,
    `only ${cascades.size} cascading foreign keys parsed — the scanner has broken`,
  );
});

test('every member-keyed table either cascades on deletion or is retained with a reason', () => {
  const tables = memberKeyedTables();
  const cascades = cascadingTables();

  const unaccounted: string[] = [];
  for (const [table, columns] of [...tables].sort()) {
    // The member record itself. `DELETE FROM app_users` is the deletion;
    // it is the row every cascade below hangs off, not a dependent of it.
    if (table === 'app_users') continue;
    if (cascades.has(table)) continue;
    if (RETAINED[table]) continue;
    unaccounted.push(`${table} (${columns.join(', ')})`);
  }

  assert.deepEqual(
    unaccounted,
    [],
    'These hold a member and nothing removes them when the account is deleted.\n' +
      'Either add a foreign key to app_users with ON DELETE CASCADE in a new\n' +
      'migration, or add the table to RETAINED with the lawful basis for\n' +
      'keeping it — and then say so on /assurance, because the public page\n' +
      'states what deletion does:\n  ' +
      unaccounted.join('\n  '),
  );
});

test('nothing is retained without a reason somebody could defend', () => {
  for (const [table, reason] of Object.entries(RETAINED)) {
    assert.ok(
      reason.length > 40,
      `${table} is retained with a reason too short to be a reason: "${reason}"`,
    );
    /*
     * "Legacy", "for now" and "TODO" are how a retention list becomes a
     * place to put anything inconvenient. The reason has to say what the
     * record is for.
     */
    assert.doesNotMatch(
      reason,
      /\b(legacy|for now|TODO|temporar)/i,
      `${table}'s retention reason is a placeholder, not a basis`,
    );
  }
});

test('the retained tables are the financial ones and the audit trail, and nothing else', () => {
  /*
   * Pinned by name. The point of the list is that it stays short: the
   * moment a health or behavioural table appears in it, somebody has
   * decided not to delete a member's body data and this test is where
   * that decision has to be argued.
   */
  assert.deepEqual(Object.keys(RETAINED).sort(), [
    'annual_deposits',
    'app_wallets',
    'security_events',
    'stripe_customers',
    'stripe_subscriptions',
  ]);
});
