import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPushRequest,
  decryptPayload,
  encryptPayload,
  generateVapidKeys,
  vapidAuthHeader,
} from '../src/push/webpush.logic.ts';

/* ------------------------------------------------------------------ *
 * RFC 8291, Appendix A — the official test vector. If this passes, the
 * encryption is the spec's, not an approximation of it.
 * ------------------------------------------------------------------ */

const VECTOR = {
  plaintext: 'When I grow up, I want to be a watermelon',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlml' +
    'MoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4M' +
    'qgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('encryption reproduces the RFC 8291 test vector byte for byte', () => {
  const body = encryptPayload(
    Buffer.from(VECTOR.plaintext, 'utf8'),
    { p256dh: VECTOR.uaPublic, auth: VECTOR.auth },
    Buffer.from(VECTOR.asPrivate, 'base64url'),
    Buffer.from(VECTOR.salt, 'base64url'),
  );
  assert.equal(body.toString('base64url'), VECTOR.body);
});

test('the receiver can decrypt what the sender encrypts — with fresh keys too', () => {
  const body = encryptPayload(Buffer.from(VECTOR.plaintext, 'utf8'), {
    p256dh: VECTOR.uaPublic,
    auth: VECTOR.auth,
  });
  const opened = decryptPayload(
    body,
    Buffer.from(VECTOR.uaPrivate, 'base64url'),
    Buffer.from(VECTOR.auth, 'base64url'),
  );
  assert.equal(opened.toString('utf8'), VECTOR.plaintext);
});

test('a tampered body does not decrypt', () => {
  const body = encryptPayload(Buffer.from('hello', 'utf8'), {
    p256dh: VECTOR.uaPublic,
    auth: VECTOR.auth,
  });
  body[body.length - 1]! ^= 0xff;
  assert.throws(() =>
    decryptPayload(
      body,
      Buffer.from(VECTOR.uaPrivate, 'base64url'),
      Buffer.from(VECTOR.auth, 'base64url'),
    ),
  );
});

/* ------------------------------------------------------------------ *
 * VAPID
 * ------------------------------------------------------------------ */

test('generated VAPID keys have the right shapes', () => {
  const keys = generateVapidKeys();
  assert.equal(Buffer.from(keys.publicKey, 'base64url').length, 65);
  assert.equal(Buffer.from(keys.publicKey, 'base64url')[0], 0x04, 'uncompressed point');
  assert.equal(Buffer.from(keys.privateKey, 'base64url').length, 32);
});

test('the VAPID header carries an ES256 JWT scoped to the push origin', () => {
  const keys = generateVapidKeys();
  const header = vapidAuthHeader(
    'https://fcm.googleapis.com/fcm/send/abc123',
    'mailto:jess@jessmove.com',
    keys,
    1_760_000_000,
  );
  assert.match(header, /^vapid t=.+, k=.+$/);
  const jwt = header.slice('vapid t='.length, header.indexOf(', k='));
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h!, 'base64url').toString()), {
    typ: 'JWT',
    alg: 'ES256',
  });
  const claims = JSON.parse(Buffer.from(c!, 'base64url').toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:jess@jessmove.com');
  assert.equal(claims.exp, 1_760_000_000 + 12 * 3600);
  assert.equal(Buffer.from(s!, 'base64url').length, 64, 'raw r||s signature');
});

test('a complete push request has the encrypted body and required headers', () => {
  const vapid = generateVapidKeys();
  const { body, headers } = buildPushRequest(
    'https://updates.push.services.mozilla.com/wpush/v2/x',
    { title: 'Time to move', body: 'Your window opens now.' },
    { p256dh: VECTOR.uaPublic, auth: VECTOR.auth },
    vapid,
    'mailto:jess@jessmove.com',
  );
  assert.ok(body.length > 100);
  assert.equal(headers['content-encoding'], 'aes128gcm');
  assert.equal(headers.ttl, '3600');
  assert.match(headers.authorization, /^vapid /);
});
