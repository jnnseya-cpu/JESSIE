import {
  createECDH,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * Web Push, from the standards, with node:crypto and nothing else.
 *
 * Two pieces: RFC 8291 message encryption (ECDH on P-256 → HKDF →
 * AES-128-GCM, aes128gcm framing) and RFC 8292 VAPID (an ES256 JWT that
 * proves to the push service which server is allowed to wake this
 * subscription). The RFC 8291 test vector runs in CI — the encryption
 * either matches the spec byte-for-byte or the build fails.
 *
 * No SDK for the same reason as Stripe: the path that can wake a user's
 * phone at 3am should contain no code this repository cannot read.
 */

const b64u = (b: Buffer): string => b.toString('base64url');
const fromB64u = (s: string): Buffer => Buffer.from(s, 'base64url');

export interface PushSubscriptionKeys {
  /** The browser's P-256 public key, base64url, uncompressed point. */
  readonly p256dh: string;
  /** The browser's 16-byte authentication secret, base64url. */
  readonly auth: string;
}

export interface EncryptedPush {
  readonly body: Buffer;
  readonly headers: Record<string, string>;
}

/**
 * RFC 8291 encryption. The keypair and salt parameters exist so the test
 * vector can pin them; production callers omit both and get fresh ones.
 */
export function encryptPayload(
  plaintext: Buffer,
  keys: PushSubscriptionKeys,
  asPrivateKey?: Buffer,
  salt?: Buffer,
): Buffer {
  const uaPublic = fromB64u(keys.p256dh);
  const authSecret = fromB64u(keys.auth);

  const ecdh = createECDH('prime256v1');
  if (asPrivateKey) {
    ecdh.setPrivateKey(asPrivateKey);
  } else {
    ecdh.generateKeys();
  }
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const usedSalt = salt ?? randomBytes(16);

  // RFC 8291 §3.3–3.4: IKM ties the shared secret to both public keys.
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, usedSalt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, usedSalt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12),
  );

  // aes128gcm body: salt(16) | rs(4) | idlen(1) | keyid | records.
  // One record; 0x02 marks the final record's padding delimiter.
  const record = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  usedSalt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;

  return Buffer.concat([header, asPublic, ciphertext]);
}

/** The inverse, used by the round-trip test — never in production. */
export function decryptPayload(body: Buffer, uaPrivateKey: Buffer, authSecret: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivateKey);
  const uaPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(asPublic);

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12),
  );

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const record = Buffer.concat([decipher.update(data), decipher.final()]);

  // Strip the padding delimiter and anything after it.
  let end = record.length - 1;
  while (end >= 0 && record[end] === 0) end--;
  if (record[end] !== 0x02) throw new RangeError('bad padding delimiter');
  return record.subarray(0, end);
}

/* ------------------------------------------------------------------ *
 * VAPID — RFC 8292
 * ------------------------------------------------------------------ */

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point. */
  readonly publicKey: string;
  /** base64url, 32-byte private scalar. */
  readonly privateKey: string;
}

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

/** DER ECDSA signature → the raw r||s JOSE form JWTs use. */
function derToJose(der: Buffer): Buffer {
  let offset = 3;
  const rLen = der[offset]!;
  let r = der.subarray(offset + 1, offset + 1 + rLen);
  offset += 1 + rLen + 1;
  const sLen = der[offset]!;
  let s = der.subarray(offset + 1, offset + 1 + sLen);
  while (r.length > 32) r = r.subarray(1);
  while (s.length > 32) s = s.subarray(1);
  const out = Buffer.alloc(64);
  r.copy(out, 32 - r.length);
  s.copy(out, 64 - s.length);
  return out;
}

export function vapidAuthHeader(
  endpoint: string,
  subject: string,
  keys: VapidKeys,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const publicPoint = fromB64u(keys.publicKey);
  const x = b64u(publicPoint.subarray(1, 33));
  const y = b64u(publicPoint.subarray(33, 65));
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: keys.privateKey,
    x,
    y,
  };
  const privateKey = createPrivateKey({ key: jwk, format: 'jwk' });
  // Sanity: the JWK must round-trip to a valid public key.
  createPublicKey(privateKey);

  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: nowSeconds + 12 * 3600,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const der = createSign('SHA256').update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${b64u(derToJose(der))}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

/** Everything a POST to a push endpoint needs. */
export function buildPushRequest(
  endpoint: string,
  payload: object,
  keys: PushSubscriptionKeys,
  vapid: VapidKeys,
  subject: string,
  ttlSeconds = 3600,
): { body: Buffer; headers: Record<string, string> } {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), keys);
  return {
    body,
    headers: {
      authorization: vapidAuthHeader(endpoint, subject, vapid),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(ttlSeconds),
      urgency: 'normal',
    },
  };
}
