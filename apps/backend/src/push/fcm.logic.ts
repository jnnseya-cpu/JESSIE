import { createPrivateKey, createSign } from 'node:crypto';
import type { DeliveryVerdict, PushContent } from './apns.logic';

/**
 * Firebase Cloud Messaging, HTTP v1, without the SDK.
 *
 * Android has no alternative: FCM is how a notification reaches an
 * Android device, and Firebase is one of the two vendors this platform
 * has approved. What is avoided is the SDK, for the same reason as
 * everywhere else — this is a path that can wake somebody at night.
 *
 * The legacy `key=AAAA…` server-key API is gone, so v1 it is, and v1
 * authenticates with a Google service account: an RS256 JWT signed with
 * the account's private key, exchanged at Google's token endpoint for an
 * access token that lasts an hour. Two round trips rather than one, which
 * is why the token is cached.
 *
 * Only the alert reaches Google. The notification body is a movement name
 * and a duration, and nothing about a health reading, a symptom or a
 * wallet balance travels through it.
 */

const b64u = (b: Buffer): string => b.toString('base64url');

export interface FcmCredentials {
  /** From the service-account JSON: project_id. */
  readonly projectId: string;
  /** From the service-account JSON: client_email. */
  readonly clientEmail: string;
  /** From the service-account JSON: private_key, PEM. */
  readonly privateKey: string;
}

export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** The one scope FCM needs. Nothing else in the Google account is reachable. */
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/**
 * The assertion exchanged for an access token.
 *
 * One hour is the maximum Google accepts, and the token it returns lasts
 * the same, so this is minted about once an hour rather than per
 * notification.
 */
export function serviceAccountJwt(
  credentials: FcmCredentials,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const key = createPrivateKey({ key: credentials.privateKey, format: 'pem' });
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64u(
    Buffer.from(
      JSON.stringify({
        iss: credentials.clientEmail,
        scope: FCM_SCOPE,
        aud: TOKEN_ENDPOINT,
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key);
  return `${signingInput}.${b64u(signature)}`;
}

export function fcmSendUrl(projectId: string): string {
  return `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
}

/**
 * One notification, as FCM v1 takes it.
 *
 * `collapse_key` and `ttl` mirror the APNs headers for the same reason:
 * the later Snap replaces the earlier one, and a nudge whose window has
 * closed should stop being delivered rather than arrive tomorrow.
 *
 * `notification` rather than a data-only message, deliberately. A
 * data-only message is delivered to the app to display, which means it
 * shows nothing when the app has been swiped away or the device is in
 * Doze — exactly the moments this is for. The platform posts it instead.
 */
export function fcmMessage(
  deviceToken: string,
  content: PushContent,
  ttlSeconds = 30 * 60,
): object {
  return {
    message: {
      token: deviceToken,
      notification: { title: content.title, body: content.body },
      // Read by the tap handler in the shell to open the right screen.
      // A string map, because that is all FCM data will carry.
      data: content.url ? { url: content.url } : {},
      android: {
        priority: 'HIGH',
        ttl: `${ttlSeconds}s`,
        collapse_key: 'jessmove-snap',
        notification: {
          // Matches the channel the shell creates. Without it Android 8+
          // drops the notification into a default channel the member
          // cannot tune separately.
          channel_id: 'jessmove-snap',
          tag: 'jessmove-snap',
        },
      },
    },
  };
}

/**
 * What a response means, and what to do about it.
 *
 * FCM reports a dead registration as `UNREGISTERED`, and a token that was
 * never valid as `INVALID_ARGUMENT`. Both mean stop sending to it: the
 * first is an uninstall, the second is a token from another project or a
 * corrupted string, and neither becomes deliverable by waiting.
 */
export function classifyFcm(status: number, errorStatus?: string): DeliveryVerdict {
  if (status >= 200 && status < 300) return 'delivered';
  if (status === 404 || errorStatus === 'UNREGISTERED' || errorStatus === 'NOT_FOUND') {
    return 'expired';
  }
  if (status === 400 && errorStatus === 'INVALID_ARGUMENT') return 'expired';
  if (status === 429 || status >= 500 || errorStatus === 'UNAVAILABLE') return 'retry';
  return 'failed';
}

export type { DeliveryVerdict, PushContent };
