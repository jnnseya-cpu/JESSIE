import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MIGRATIONS } from '../src/db/embedded-sql.ts';

/**
 * Why a profile picture used to upload and never appear.
 *
 * Two separate faults, either of which was enough on its own.
 *
 * **The bytes went nowhere durable.** With no Blob token the storage
 * service put them in a Map inside one instance. On serverless the next
 * request is a different instance, so the URL the upload had just returned
 * answered 404 — and after a restart there was nothing at all.
 *
 * **The URL was a path.** `/api/accounts/media/...` in an <img> resolves
 * against the site, not the API. On jessmove.com the browser asked www for
 * it and got the 404 page.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the media table ships with the schema', () => {
  const ids = MIGRATIONS.map((m) => m.id);
  assert.ok(ids.includes('0012_media_objects'), `0012 is embedded — got ${ids.join(', ')}`);
  const sql = MIGRATIONS.find((m) => m.id === '0012_media_objects')?.sql ?? '';
  assert.match(sql, /CREATE TABLE IF NOT EXISTS media_objects/);
  assert.match(sql, /bytes\s+bytea NOT NULL/);
});

test('storage prefers object storage, then the database, and only then memory', () => {
  const source = read('../src/storage/storage.service.ts');
  assert.match(
    source,
    /if \(this\.token\(\)\) return 'vercel-blob';\s*\n\s*return this\.pool \? 'database' : 'memory';/,
    'the order is blob, database, memory',
  );
  assert.match(source, /INSERT INTO media_objects/, 'the database driver actually writes bytes');
  assert.match(source, /SELECT content_type, bytes FROM media_objects/, 'and reads them back');
  assert.match(source, /durable: driver !== 'memory'/, 'status says whether anything survives');
});

test('the site resolves a stored picture against the API, not against itself', () => {
  const source = read('../../frontend/app/api-base.ts');
  assert.match(source, /export function mediaUrl/, 'the helper exists');
  assert.match(source, /if \(\/\^\(https\?:\)\?\\\/\\\/\/\.test\(url\)/, 'an absolute URL is left alone');

  const panel = read('../../frontend/app/account/account-panel.tsx');
  assert.match(panel, /src=\{mediaUrl\(me\.avatarUrl\)\}/, 'the avatar goes through it');
  assert.match(panel, /url\(\$\{mediaUrl\(me\.coverUrl\)\}\)/, 'so does the cover');
});
