import { createPrivateKey, createSign } from 'node:crypto';

/**
 * APNs, from Apple's documentation, with node:crypto and nothing else.
 *
 * The same rule as `webpush.logic.ts` and the Stripe client: the path
 * that can wake somebody's phone at three in the morning contains no code
 * this repository cannot read.
 *
 * iOS is reached directly rather than through Firebase. Android has no
 * alternative to FCM, but Apple publishes its own endpoint, so routing
 * iOS through a third party would put a vendor between this platform and
 * its members for no capability at all — and the ES256 signing it needs
 * is the same shape the VAPID path already does.
 *
 * Two things about APNs that are easy to get wrong and fail silently:
 *
 * **It is HTTP/2 only.** `fetch` in Node speaks HTTP/1.1, so a naive
 * implementation fails at connect with an error that reads like a network
 * problem. The transport lives in the service; this file is the pure half.
 *
 * **The token is not a bearer credential you hold.** The JWT is signed
 * per request window with a p8 key, and Apple rejects a JWT older than an
 * hour and rate-limits one regenerated too often. It is cached for
 * `JWT_REFRESH_SECONDS` rather than minted per notification.
 */

const b64u = (b: Buffer): string => b.toString('base64url');

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

export interface ApnsCredentials {
  /** The Key ID of the .p8, from the Apple developer console. */
  readonly keyId: string;
  /** The ten-character Team ID. */
  readonly teamId: string;
  /** The .p8 file's contents, PEM, including the BEGIN/END lines. */
  readonly privateKey: string;
  /** The app's bundle identifier — APNs calls this the topic. */
  readonly topic: string;
  /** Sandbox for a development build; production for TestFlight and the store. */
  readonly production: boolean;
}

/**
 * Apple rejects a JWT older than one hour and rate-limits regeneration,
 * so it is refreshed well inside the window and not per notification.
 */
export const JWT_REFRESH_SECONDS = 45 * 60;

export function apnsJwt(
  credentials: ApnsCredentials,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const key = createPrivateKey({ key: credentials.privateKey, format: 'pem' });
  const header = b64u(
    Buffer.from(JSON.stringify({ alg: 'ES256', kid: credentials.keyId })),
  );
  const claims = b64u(
    Buffer.from(JSON.stringify({ iss: credentials.teamId, iat: nowSeconds })),
  );
  const signingInput = `${header}.${claims}`;
  const der = createSign('SHA256').update(signingInput).sign(key);
  return `${signingInput}.${b64u(derToJose(der))}`;
}

export function apnsHost(production: boolean): string {
  return production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
}

export interface PushContent {
  readonly title: string;
  readonly body: string;
  readonly url?: string;
}

/**
 * One notification, as APNs takes it.
 *
 * `apns-collapse-id` is the reason a member who misses an eleven o'clock
 * prompt does not find two of them at half past. The later Snap replaces
 * the earlier one, which is right rather than merely tidy: the earlier
 * one described a window that has closed, and a prompt for a movement
 * that no longer fits is the exact thing this product exists not to send.
 *
 * `apns-expiration` is set from the same reasoning. A nudge that arrives
 * after its window is noise, so APNs is told to stop trying rather than
 * to store and forward it — the default of zero would have it discarded
 * immediately, and no expiry would have it delivered tomorrow morning.
 */
export function apnsRequest(
  deviceToken: string,
  content: PushContent,
  jwt: string,
  credentials: ApnsCredentials,
  ttlSeconds = 30 * 60,
  nowSeconds = Math.floor(Date.now() / 1000),
): { path: string; headers: Record<string, string>; body: string } {
  const payload = {
    aps: {
      alert: { title: content.title, body: content.body },
      sound: 'default',
      // Groups Snaps together in the notification centre rather than
      // interleaving them with anything else this app ever sends.
      'thread-id': 'jessmove-snap',
    },
    url: content.url,
  };

  return {
    path: `/3/device/${deviceToken}`,
    headers: {
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': credentials.topic,
      'apns-push-type': 'alert',
      // 10 is "deliver now". Correct for a time-boxed movement window and
      // required for an alert that plays a sound.
      'apns-priority': '10',
      'apns-expiration': String(nowSeconds + ttlSeconds),
      'apns-collapse-id': 'jessmove-snap',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

/**
 * What a response means, and what to do about it.
 *
 * `expired` is the one that matters: a device token stays in the table
 * forever unless something deletes it, and a member who deletes the app
 * would otherwise be pushed at daily until the row is noticed by a human.
 * Apple names the two cases precisely, so they are matched by reason
 * rather than inferred from the status.
 *
 * `retry` is separated from `failed` even though nothing retries yet,
 * because the difference is what a person reading `nudge_runs` needs:
 * "Apple was briefly unavailable" and "this notification was malformed"
 * have completely different responses and both arrive as a non-200.
 */
export type DeliveryVerdict = 'delivered' | 'expired' | 'retry' | 'failed';

export function classifyApns(status: number, reason?: string): DeliveryVerdict {
  if (status === 200) return 'delivered';
  // 410 Unregistered is the documented "this token is dead" answer;
  // BadDeviceToken arrives as a 400 and means the same thing in practice —
  // most often a sandbox token sent to production or the reverse.
  if (status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken') return 'expired';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}
