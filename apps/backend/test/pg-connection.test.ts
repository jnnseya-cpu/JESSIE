import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isLocalDatabase, needsSsl, poolOptions } from '../src/db/pg.ts';

/**
 * The outage this exists to prevent.
 *
 * Eleven stores each carried their own copy of
 *
 *     ssl: url.includes('sslmode=require') || url.includes('vercel') ? … : undefined
 *
 * which is a guess about the *text of the connection string* rather than a
 * fact about the server. A perfectly ordinary managed Postgres URL with no
 * sslmode parameter got no SSL, the provider refused every connection, and
 * all eleven pools failed at once — login, registration, activity, drafts,
 * wallets, groups, challenges, media. From outside that is indistinguishable
 * from the platform being down, and it starts the moment DATABASE_URL is set.
 *
 * The rule is now the safe way round: anything not on this machine gets SSL.
 */

test('a managed database gets SSL even with no sslmode in the URL', () => {
  for (const url of [
    'postgres://user:pw@ep-cool-name-123.eu-west-2.aws.neon.tech/neondb',
    'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
    'postgres://user:pw@some-host.internal:5432/app',
    'postgres://user:pw@my-db.rds.amazonaws.com/prod',
  ]) {
    assert.equal(needsSsl(url), true, url);
    assert.deepEqual(poolOptions(url).ssl, { rejectUnauthorized: true }, url);
  }
});

test('the old substring heuristics still work, because they were not wrong — only incomplete', () => {
  assert.equal(needsSsl('postgres://u:p@host/db?sslmode=require'), true);
  assert.equal(needsSsl('postgres://u:p@x.vercel-storage.com/db'), true);
});

test('a database on this machine has no certificate and is not asked for one', () => {
  for (const url of [
    'postgres://jess@127.0.0.1:5433/jessmove',
    'postgres://jess@localhost:5432/jessmove',
    'postgres://jess@[::1]:5432/jessmove',
  ]) {
    assert.equal(isLocalDatabase(url), true, url);
    assert.equal(needsSsl(url), false, url);
    assert.equal(poolOptions(url).ssl, undefined, url);
  }
});

test('sslmode=disable is honoured for a deployment terminating TLS elsewhere', () => {
  assert.equal(needsSsl('postgres://u:p@internal-proxy:5432/db?sslmode=disable'), false);
});

test('an unreachable host fails fast rather than hanging the request', () => {
  const options = poolOptions('postgres://u:p@nowhere.example/db');
  assert.equal(typeof options.connectionTimeoutMillis, 'number');
  assert.ok(options.connectionTimeoutMillis > 0 && options.connectionTimeoutMillis <= 10_000);
});

test('an unparseable URL is not assumed to be local', () => {
  assert.equal(isLocalDatabase('this is not a url'), false);
  assert.equal(needsSsl('this is not a url'), true);
});

/* ------------------------------------------------------------------ *
 * Two more ways a launch goes wrong quietly.
 * ------------------------------------------------------------------ */

test('the site can always call its own API, whatever CORS_ORIGINS says', () => {
  // The default was localhost alone. On a real deployment with the
  // variable unset, that means the live site cannot call its own API and
  // every signed-in screen is broken — with a browser console error
  // nobody outside the browser ever sees.
  const setup = readFileSync(new URL('../src/setup.ts', import.meta.url), 'utf8');
  assert.match(setup, /https:\/\/www\.jessmove\.com/);
  assert.match(setup, /https:\/\/jessmove\.com/);
  assert.match(setup, /jessmove\\\.com\$/, 'a preview subdomain is matched, not listed');
  assert.match(setup, /credentials: true/);
});

test('a reset link stops working the moment the password changes', () => {
  const service = readFileSync(new URL('../src/auth/auth.service.ts', import.meta.url), 'utf8');
  assert.match(service, /function passwordFingerprint/);
  assert.match(service, /f: passwordFingerprint\(user\.passwordHash\)/, 'the link carries it');
  assert.match(service, /data\.f !== passwordFingerprint\(current\.passwordHash\)/, 'and checks it');
  assert.match(service, /has already been used/);
});

test('a duplicate signup is a conflict, not a five hundred', () => {
  const store = readFileSync(new URL('../src/auth/user-store.ts', import.meta.url), 'utf8');
  assert.match(store, /'23505'/, 'the unique violation is caught');
  assert.match(store, /ConflictException/);
});
