import { createHmac, timingSafeEqual } from 'node:crypto';
import { SIGNATURE_TOLERANCE_SECONDS, WebhookVerificationError } from '@jessmove/shared';

/**
 * Stripe webhook signature verification.
 *
 * Implemented directly rather than through the SDK, for two reasons: it is
 * about thirty lines, and doing it here means it can be unit-tested
 * offline with a known secret instead of being taken on trust.
 *
 * The scheme:
 *   header  Stripe-Signature: t=<unix>,v1=<hex>,v1=<hex>
 *   payload `${t}.${rawBody}`
 *   digest  HMAC-SHA256(payload, secret), hex
 *
 * Three things this gets right that naive implementations do not:
 *   - it hashes the RAW body, so JSON.parse/stringify never touches it;
 *   - it compares in constant time, so the comparison does not leak;
 *   - it refuses old timestamps, so a captured request cannot be replayed.
 */

export interface ParsedSignature {
  timestamp: number;
  signatures: string[];
}

export function parseSignatureHeader(header: string): ParsedSignature {
  let timestamp = Number.NaN;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (!key || value === undefined) continue;
    if (key.trim() === 't') timestamp = Number(value.trim());
    if (key.trim() === 'v1') signatures.push(value.trim());
  }

  if (!Number.isFinite(timestamp)) {
    throw new WebhookVerificationError('no valid timestamp in the signature header');
  }
  if (signatures.length === 0) {
    throw new WebhookVerificationError('no v1 signature in the signature header');
  }

  return { timestamp, signatures };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak
  // length. Compare lengths first and still run the comparison.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function expectedSignature(rawBody: string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

/**
 * Verifies and returns the parsed event. Throws rather than returning
 * false, so a caller cannot forget to check the result.
 */
export function verifyWebhook(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): Record<string, unknown> {
  if (!secret) {
    throw new WebhookVerificationError('STRIPE_WEBHOOK_SECRET is not configured');
  }
  if (!header) {
    throw new WebhookVerificationError('no Stripe-Signature header');
  }

  const { timestamp, signatures } = parseSignatureHeader(header);

  const age = nowSeconds - timestamp;
  if (Math.abs(age) > toleranceSeconds) {
    throw new WebhookVerificationError(
      `timestamp is ${age}s away from now, outside the ${toleranceSeconds}s tolerance`,
    );
  }

  const expected = expectedSignature(rawBody, timestamp, secret);
  const matched = signatures.some((candidate) => constantTimeEquals(candidate, expected));
  if (!matched) {
    throw new WebhookVerificationError('no signature matched');
  }

  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new WebhookVerificationError('the body is not valid JSON');
  }
}
