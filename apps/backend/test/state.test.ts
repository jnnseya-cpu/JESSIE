import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_DOCUMENT_BYTES,
  STATE_KEYS,
  checkDocument,
  isAllowedKey,
} from '../src/state/state.logic.ts';

test('only the platform\'s own draft keys may be saved', () => {
  for (const key of STATE_KEYS) assert.equal(isAllowedKey(key), true, key);
  assert.equal(isAllowedKey('anything.else'), false);
  assert.equal(isAllowedKey('consent.marketing'), false);
  assert.equal(isAllowedKey('../../etc/passwd'), false);
});

test('consent cannot be smuggled into a draft', () => {
  const smuggled = checkDocument('ui.preferences', { theme: 'dark', consent: true });
  assert.equal(smuggled.ok, false);
  assert.match(smuggled.why ?? '', /consent/);

  const clinical = checkDocument('body.inputs', { heightCm: '170', clinical: false });
  assert.equal(clinical.ok, false);
});

test('a draft is a draft, not an archive', () => {
  const huge = { list: Array.from({ length: 5000 }, (_, i) => ({ barcode: String(i), name: 'x'.repeat(20) })) };
  const check = checkDocument('scanner.list', huge);
  assert.equal(check.ok, false);
  assert.match(check.why ?? '', /too large/);

  // Something a real trolley would produce still fits comfortably.
  const trolley = {
    list: Array.from({ length: 30 }, (_, i) => ({
      barcode: `500000000000${i}`,
      name: 'Wholemeal bread 800g',
      per100g: { fatG: 1.5, saturatesG: 0.3, sugarsG: 3.1, saltG: 0.9 },
    })),
  };
  assert.equal(checkDocument('scanner.list', trolley).ok, true);
  assert.ok(Buffer.byteLength(JSON.stringify(trolley)) < MAX_DOCUMENT_BYTES);
});

test('ordinary drafts save without ceremony', () => {
  assert.equal(checkDocument('body.inputs', { heightCm: '170', weightKg: '90' }).ok, true);
  assert.equal(checkDocument('mova.thread', [{ q: 'my back aches', a: 'stand up…' }]).ok, true);
  assert.equal(checkDocument('body.inputs', undefined).ok, false);
});
