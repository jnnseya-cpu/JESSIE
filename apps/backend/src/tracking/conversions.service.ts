import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TRACKING_EVENTS, type TrackingEvent } from '@jessmove/shared';

/**
 * Signup and payment, counted server to server.
 *
 * These two events are the only ones worth real money to know about, and
 * both happen behind the login — where no advertising script may run. A
 * browser tag on the account would mean a Meta script present on the same
 * page as a food ledger and a falls score, which is the arrangement that has
 * cost health providers large fines and would give the wrong answer to the
 * question every link worker asks before they refer anybody.
 *
 * So the browser is never involved. Meta's Conversions API and Google's
 * Measurement Protocol both accept a server-to-server post, which means the
 * conversion is counted, the health surface stays clean, and the member's
 * browser is never introduced to either company at all.
 *
 * Three properties hold this in place.
 *
 * **It is off unless tokens exist.** No `META_CAPI_TOKEN`, no calls. This is
 * not a feature that half-works with half its configuration.
 *
 * **It sends an event and a value, never a person.** Meta will match on a
 * hashed email if you give it one; this deliberately does not. A hash is
 * still an identifier — it is exactly as useful to an advertising network as
 * the address it was made from — and matching a health platform's members to
 * an ad profile is not something to do for a slightly better attribution
 * number. What goes out is: this happened, it was worth this much.
 *
 * **It never blocks and never throws.** A conversion post that fails must
 * not fail a registration or a payment webhook. Failures are logged and
 * dropped, because the alternative is an advertising network being able to
 * take the product down by being slow.
 */

interface ConversionInput {
  readonly event: Extract<TrackingEvent, 'signed_up' | 'subscribed' | 'started_trial'>;
  /** Money, where there is any. Absent for a signup. */
  readonly valueGbp?: number;
  /** Plan key, e.g. 'premium'. Commercial, not clinical. */
  readonly plan?: string;
}

@Injectable()
export class ConversionsService {
  private readonly logger = new Logger(ConversionsService.name);

  private metaConfigured(): { pixelId: string; token: string } | null {
    const pixelId = (process.env.META_PIXEL_ID ?? '').trim();
    const token = (process.env.META_CAPI_TOKEN ?? '').trim();
    return pixelId && token ? { pixelId, token } : null;
  }

  private googleConfigured(): { measurementId: string; apiSecret: string } | null {
    const measurementId = (process.env.GOOGLE_TAG_ID ?? '').trim();
    const apiSecret = (process.env.GOOGLE_MP_API_SECRET ?? '').trim();
    return measurementId && apiSecret ? { measurementId, apiSecret } : null;
  }

  configured(): { meta: boolean; google: boolean } {
    return { meta: this.metaConfigured() !== null, google: this.googleConfigured() !== null };
  }

  /**
   * Record a conversion. Never awaited by a caller that matters.
   *
   * Deliberately returns void rather than a promise of success: there is no
   * useful thing a registration handler could do with the knowledge that
   * Meta was briefly unavailable, and offering the result invites somebody
   * to await it and put an advertising network on the critical path of
   * creating an account.
   */
  record(input: ConversionInput): void {
    void this.send(input).catch((error) => {
      this.logger.warn(`conversion not recorded: ${(error as Error).message}`);
    });
  }

  private async send(input: ConversionInput): Promise<void> {
    const names = TRACKING_EVENTS[input.event];
    await Promise.all([this.toMeta(input, names.meta), this.toGoogle(input, names.google)]);
  }

  /**
   * An opaque per-event id, so a retry cannot be counted twice.
   *
   * Derived from the event, the plan and the hour rather than from anything
   * about the person — enough for a network to deduplicate a repeated
   * delivery, useless for identifying anybody.
   */
  private eventId(input: ConversionInput, at: number): string {
    return createHash('sha256')
      .update(`${input.event}|${input.plan ?? ''}|${Math.floor(at / 1000)}`)
      .digest('hex')
      .slice(0, 32);
  }

  private async toMeta(input: ConversionInput, eventName: string): Promise<void> {
    const config = this.metaConfigured();
    if (!config) return;

    const at = Date.now();
    const body = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(at / 1000),
          event_id: this.eventId(input, at),
          action_source: 'website',
          // No user_data. Meta accepts a hashed email here and matches it to
          // an ad profile; a health platform handing over even a hash of who
          // its members are is the thing this whole design refuses.
          custom_data: {
            currency: 'GBP',
            ...(input.valueGbp !== undefined ? { value: input.valueGbp } : {}),
            ...(input.plan ? { content_name: input.plan } : {}),
          },
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(config.pixelId)}/events?access_token=${encodeURIComponent(config.token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) throw new Error(`meta ${res.status}`);
  }

  private async toGoogle(input: ConversionInput, eventName: string): Promise<void> {
    const config = this.googleConfigured();
    if (!config) return;

    const at = Date.now();
    const body = {
      // Measurement Protocol requires a client id. A per-event random one
      // means every conversion looks like a new visitor, which costs a
      // little attribution accuracy and buys the guarantee that Google
      // cannot stitch these events into one person's history.
      client_id: `${this.eventId(input, at)}.${Math.floor(at / 1000)}`,
      non_personalized_ads: true,
      events: [
        {
          name: eventName,
          params: {
            currency: 'GBP',
            ...(input.valueGbp !== undefined ? { value: input.valueGbp } : {}),
            ...(input.plan ? { items: [{ item_name: input.plan }] } : {}),
          },
        },
      ],
    };

    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(config.measurementId)}&api_secret=${encodeURIComponent(config.apiSecret)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(4000),
      },
    );
    // Measurement Protocol answers 204 on success and says nothing useful
    // about a malformed payload, which is a known and irritating property.
    if (!res.ok) throw new Error(`google ${res.status}`);
  }
}
