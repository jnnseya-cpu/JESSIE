import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The session token: a compact signed payload, verified statelessly.
 *
 * Stateless on purpose. On Vercel, function instances neither persist nor
 * share memory, so a server-side session table would need the database on
 * every request. An HMAC-signed token needs only the secret — any instance
 * can verify any token — and revocation-by-expiry (30 days, rolling) is
 * the honest trade at this stage.
 *
 *   base64url(json payload) + "." + base64url(hmac-sha256(payload, secret))
 *
 * Not JWT: no header, no algorithm field, no algorithm negotiation — the
 * verifier accepts exactly one construction, which removes the classic
 * "alg: none" class of bugs rather than defending against it.
 */

export interface SessionPayload {
  /** User id. */
  readonly uid: string;
  /** Account kind, so guards can gate without a store lookup. */
  readonly kind: string;
  /** Verified age — the safeguarding rules need it on every request. */
  readonly age: number;
  /** Unix seconds. */
  readonly exp: number;
  /** Token schema version. */
  readonly v: 1;
}

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueToken(
  payload: Omit<SessionPayload, 'exp' | 'v'>,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const full: SessionPayload = { ...payload, exp: nowSeconds + SESSION_TTL_SECONDS, v: 1 };
  const body = b64url(JSON.stringify(full));
  return `${body}.${sign(body, secret)}`;
}

export function verifyToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sign(body, secret);

  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }

  if (payload.v !== 1) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;
  if (typeof payload.uid !== 'string' || !payload.uid) return null;
  if (typeof payload.age !== 'number') return null;
  return payload;
}
