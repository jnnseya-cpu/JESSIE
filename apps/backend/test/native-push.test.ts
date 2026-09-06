import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  JWT_REFRESH_SECONDS,
  apnsHost,
  apnsJwt,
  apnsRequest,
  classifyApns,
} from '../src/push/apns.logic.ts';
import {
  FCM_SCOPE,
  TOKEN_ENDPOINT,
  classifyFcm,
  fcmMessage,
  fcmSendUrl,
  serviceAccountJwt,
} from '../src/push/fcm.logic.ts';

/*
 * APNs and FCM, checked where they can be.
 *
 * Neither can be delivered to from here — there is no Apple key, no
 * Google service account and no device — so what is asserted is
 * everything that is decided before the request leaves: the signatures
 * verify, the claims say what Apple and Google require, the collapse and
 * expiry behaviour is present, and a response is classified into the
 * right action. Getting a verdict wrong is the failure with the longest
 * tail: a token treated as retryable when it is dead means pushing at a
 * deleted app forever, and one treated as dead when it is fine silently
 * unsubscribes a member who did nothing.
 */

const NOW = 1_760_000_000;

/* ── APNs ───────────────────────────────────────────────────────────── */

const ec = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const APNS = {
  keyId: 'ABC1234DEF',
  teamId: 'TEAM123456',
  privateKey: ec.privateKey,
  topic: 'com.jessmove.app',
  production: true,
};

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

test('the APNs assertion is an ES256 JWT Apple will accept', () => {
  const jwt = apnsJwt(APNS, NOW);
  const [header, claims, signature] = jwt.split('.');

  // Apple requires the key id in the header and the team id as issuer.
  assert.deepEqual(decode(header!), { alg: 'ES256', kid: 'ABC1234DEF' });
  assert.deepEqual(decode(claims!), { iss: 'TEAM123456', iat: NOW });

  // The signature is raw r||s, not DER — a DER signature is a valid
  // ECDSA signature and an invalid JWT, and Apple answers that with a
  // 403 that says nothing about which of the two is wrong.
  const raw = Buffer.from(signature!, 'base64url');
  assert.equal(raw.length, 64, 'signature is not the 64-byte JOSE form');

  // And it verifies against the public half.
  const der = Buffer.concat([
    Buffer.from([0x30]),
    Buffer.from([0]),
    encodeInt(raw.subarray(0, 32)),
    encodeInt(raw.subarray(32)),
  ]);
  der[1] = der.length - 2;
  assert.ok(
    createVerify('SHA256')
      .update(`${header}.${claims}`)
      .verify(createPublicKey(ec.publicKey), der),
    'the JWT does not verify against its own key',
  );
});

/** r or s as a DER INTEGER, so the JOSE signature can be verified. */
function encodeInt(value: Buffer): Buffer {
  let v = value;
  while (v.length > 1 && v[0] === 0) v = v.subarray(1);
  const needsPad = (v[0]! & 0x80) !== 0;
  const body = needsPad ? Buffer.concat([Buffer.from([0]), v]) : v;
  return Buffer.concat([Buffer.from([0x02, body.length]), body]);
}

test('the assertion is refreshed inside the hour Apple allows', () => {
  // Apple rejects a JWT older than an hour and rate-limits one
  // regenerated too often, so the refresh has to sit strictly between.
  assert.ok(JWT_REFRESH_SECONDS < 3600, 'the cached JWT outlives what Apple accepts');
  assert.ok(JWT_REFRESH_SECONDS > 20 * 60, 'regenerating this often invites a 429');
});

test('a notification collapses onto the last one and expires with its window', () => {
  const request = apnsRequest('a'.repeat(64), { title: 'Seated twist', body: '2 minutes' },
    'jwt', APNS, 30 * 60, NOW);

  assert.equal(request.headers[':path'], `/3/device/${'a'.repeat(64)}`);
  assert.equal(request.headers['apns-topic'], 'com.jessmove.app');
  assert.equal(request.headers['apns-push-type'], 'alert');
  assert.equal(request.headers['apns-priority'], '10');

  // Collapsed, so a member who missed eleven o'clock does not find two
  // prompts at half past, the older describing a window that has closed.
  assert.equal(request.headers['apns-collapse-id'], 'jessmove-snap');

  // Expiring rather than stored and forwarded. Zero would discard it
  // immediately; absent would deliver it tomorrow morning.
  assert.equal(request.headers['apns-expiration'], String(NOW + 1800));

  const body = JSON.parse(request.body) as { aps: { alert: { title: string } } };
  assert.equal(body.aps.alert.title, 'Seated twist');
});

test('the notification carries a movement and a duration, and nothing else', () => {
  /*
   * Web Push encrypts to the device, so the push service relays bytes it
   * cannot read. APNs and FCM do not: the vendor can read the alert. The
   * payload shape is therefore a promise — a movement name, a duration
   * and a path. Anything a health reading could be inferred from would
   * be leaving the platform in clear text.
   */
  const content = { title: 'Seated twist', body: '2 minutes, seated.', url: '/account' };
  const apns = JSON.parse(apnsRequest('t'.repeat(64), content, 'jwt', APNS).body);
  const fcm = fcmMessage('t'.repeat(64), content) as {
    message: { notification: unknown; data: Record<string, string> };
  };

  assert.deepEqual(Object.keys(apns).sort(), ['aps', 'url']);
  assert.deepEqual(Object.keys(apns.aps).sort(), ['alert', 'sound', 'thread-id']);
  assert.deepEqual(Object.keys(fcm.message.data), ['url']);
  assert.equal(fcm.message.data.url, '/account');
});

test('the sandbox and production hosts are not interchangeable', () => {
  // A production token sent to sandbox comes back BadDeviceToken, which
  // this treats as dead — so the wrong host silently unsubscribes every
  // real device.
  assert.equal(apnsHost(true), 'https://api.push.apple.com');
  assert.equal(apnsHost(false), 'https://api.sandbox.push.apple.com');
});

test('a dead APNs token is deleted, a busy Apple is not', () => {
  assert.equal(classifyApns(200), 'delivered');
  assert.equal(classifyApns(410, 'Unregistered'), 'expired');
  assert.equal(classifyApns(400, 'BadDeviceToken'), 'expired');
  // Retryable, so the row survives an outage rather than the member being
  // quietly unsubscribed by Apple having a bad afternoon.
  assert.equal(classifyApns(503), 'retry');
  assert.equal(classifyApns(429), 'retry');
  // A malformed payload is ours to fix, not the device's fault.
  assert.equal(classifyApns(400, 'PayloadTooLarge'), 'failed');
  assert.equal(classifyApns(403, 'InvalidProviderToken'), 'failed');
});

/* ── FCM ────────────────────────────────────────────────────────────── */

const rsa = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const FCM = {
  projectId: 'jessmove-abc12',
  clientEmail: 'push@jessmove-abc12.iam.gserviceaccount.com',
  privateKey: rsa.privateKey,
};

test('the Google assertion is RS256, audience-bound and scoped to messaging alone', () => {
  const jwt = serviceAccountJwt(FCM, NOW);
  const [header, claims, signature] = jwt.split('.');

  assert.deepEqual(decode(header!), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(decode(claims!), {
    iss: FCM.clientEmail,
    scope: FCM_SCOPE,
    // Audience-bound: an assertion for the token endpoint cannot be
    // replayed against any other Google API.
    aud: TOKEN_ENDPOINT,
    iat: NOW,
    exp: NOW + 3600,
  });

  // One scope. A service account able to send a notification should not
  // be able to read the project's data as a side effect.
  assert.equal(FCM_SCOPE, 'https://www.googleapis.com/auth/firebase.messaging');

  assert.ok(
    createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(createPublicKey(rsa.publicKey), Buffer.from(signature!, 'base64url')),
    'the assertion does not verify against its own key',
  );
});

test('the message is one Android will actually display', () => {
  const message = fcmMessage('token-value-that-is-long-enough', {
    title: 'Seated twist',
    body: '2 minutes, seated.',
    url: '/account',
  }) as {
    message: {
      notification: { title: string };
      android: { priority: string; ttl: string; collapse_key: string; notification: { channel_id: string } };
    };
  };

  /*
   * A `notification` block rather than a data-only message. Data-only is
   * handed to the app to display, which shows nothing when the app has
   * been swiped away or the device is in Doze — precisely the moments
   * this exists for. With this, the platform posts it.
   */
  assert.equal(message.message.notification.title, 'Seated twist');
  assert.equal(message.message.android.priority, 'HIGH');
  assert.equal(message.message.android.ttl, '1800s');
  assert.equal(message.message.android.collapse_key, 'jessmove-snap');

  // Android 8+ drops a notification naming a channel the app never
  // created. This id must match the one the shell creates in index.ts.
  assert.equal(message.message.android.notification.channel_id, 'jessmove-snap');
});

test('the send URL is scoped to the project it was signed for', () => {
  assert.equal(
    fcmSendUrl('jessmove-abc12'),
    'https://fcm.googleapis.com/v1/projects/jessmove-abc12/messages:send',
  );
});

test('a dead FCM registration is deleted, a busy Google is not', () => {
  assert.equal(classifyFcm(200), 'delivered');
  assert.equal(classifyFcm(404), 'expired');
  assert.equal(classifyFcm(400, 'UNREGISTERED'), 'expired');
  // A token from another project never becomes valid by waiting.
  assert.equal(classifyFcm(400, 'INVALID_ARGUMENT'), 'expired');
  assert.equal(classifyFcm(503, 'UNAVAILABLE'), 'retry');
  assert.equal(classifyFcm(429), 'retry');
  // Ours to fix: a credential problem is not the device's fault and must
  // not delete every token on the platform.
  assert.equal(classifyFcm(401), 'failed');
  assert.equal(classifyFcm(403, 'PERMISSION_DENIED'), 'failed');
});
