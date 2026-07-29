import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CHANNEL_DEFINITIONS,
  EVENT_CATALOGUE,
  EVENT_CATEGORIES,
  deliveryCostGbp,
  eventByKey,
  renderSubject,
  resolveDelivery,
  tokensIn,
  type DeliveryRecord,
  type DeliveryStatus,
  type MessageChannel,
  type Recipient,
  type TemplateToken,
} from '@jessmove/shared';

/**
 * The communication router.
 *
 * `send` does not decide anything — `resolveDelivery` in the shared package
 * does, and this service records what happened. Keeping the decision in a
 * pure function is what makes it possible to assert the age and presence
 * rules in a unit test rather than by reading log output.
 *
 * Nothing here actually talks to a provider. With no provider key set, a
 * send is recorded as `sandbox`: the resolution, the rendered subject, the
 * channel set and the cost are all real, and only the network call is
 * absent. That means the whole flow is testable on a laptop and a missing
 * key produces a recorded outcome rather than a thrown exception at three
 * in the morning.
 */

const LOG_LIMIT = 500;

@Injectable()
export class CommsService {
  private log: DeliveryRecord[] = [];

  /** Which channels have a live provider key. None, in this environment. */
  private configured(channel: MessageChannel): boolean {
    const env: Partial<Record<MessageChannel, string | undefined>> = {
      email: process.env.EMAIL_API_KEY,
      sms: process.env.SMS_API_KEY,
      push: process.env.PUSH_API_KEY,
      whatsapp: process.env.WHATSAPP_API_KEY,
    };
    // In-app needs no provider — it is a row in our own database.
    return channel === 'in_app' || Boolean(env[channel]);
  }

  catalogue() {
    return {
      size: EVENT_CATALOGUE.length,
      categories: EVENT_CATEGORIES.map((category) => ({
        category,
        events: EVENT_CATALOGUE.filter((e) => e.category === category),
      })),
    };
  }

  /** Resolve without sending. The dry run behind every "why did I not get this?" */
  preview(key: string, to: Recipient, values: Partial<Record<TemplateToken, string>> = {}) {
    const event = eventByKey(key);
    if (!event) throw new NotFoundException(`no event with key "${key}"`);

    const plan = resolveDelivery(event, to);
    const missing = tokensIn(event.subject).filter((t) => !(t in values));

    return {
      event,
      plan,
      subject: renderSubject(event.subject, values),
      missingTokens: missing,
      costGbp: deliveryCostGbp(plan),
      channels: plan.deliver.map((c) => ({
        ...CHANNEL_DEFINITIONS[c],
        providerConfigured: this.configured(c),
      })),
    };
  }

  /**
   * Resolve, render, record. Every channel produces a row — including the
   * ones that were suppressed, because "we decided not to send this and
   * here is why" is the more useful record.
   */
  send(key: string, to: Recipient, values: Partial<Record<TemplateToken, string>> = {}) {
    const event = eventByKey(key);
    if (!event) throw new NotFoundException(`no event with key "${key}"`);

    let subject: string;
    try {
      subject = renderSubject(event.subject, values);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const plan = resolveDelivery(event, to);
    const at = new Date().toISOString();
    const written: DeliveryRecord[] = [];

    const write = (
      channel: MessageChannel,
      status: DeliveryStatus,
      detail?: string,
    ): void => {
      const record: DeliveryRecord = {
        id: randomUUID(),
        event: event.key,
        channel,
        recipient: to.userId,
        status,
        provider: CHANNEL_DEFINITIONS[channel].provider,
        at,
        costGbp: status === 'sent' ? CHANNEL_DEFINITIONS[channel].unitCostGbp : 0,
        detail,
      };
      written.push(record);
      this.log.unshift(record);
    };

    if (plan.deliver.length === 0) {
      // One row against the first channel the event names, carrying the reason.
      write(event.channels[0]!, 'suppressed', plan.explanation);
    } else {
      for (const channel of plan.deliver) {
        if (channel === 'in_app') write(channel, 'logged');
        else if (this.configured(channel)) write(channel, 'sent');
        else write(channel, 'sandbox', 'no provider key set — resolution and render are real');
      }
    }

    for (const d of plan.dropped) write(d.channel, 'suppressed', d.reason);

    this.log = this.log.slice(0, LOG_LIMIT);

    return {
      event: event.key,
      subject,
      plan,
      guardianCopy: plan.guardianCopy,
      costGbp: deliveryCostGbp(plan),
      records: written,
    };
  }

  deliveries(limit = 40): readonly DeliveryRecord[] {
    return this.log.slice(0, Math.min(limit, LOG_LIMIT));
  }

  stats() {
    const attempted = this.log.length;
    const byStatus = this.log.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      catalogueSize: EVENT_CATALOGUE.length,
      categories: EVENT_CATEGORIES.length,
      attempted,
      byStatus,
      spentGbp: Number(this.log.reduce((n, r) => n + r.costGbp, 0).toFixed(4)),
      providersConfigured: Object.fromEntries(
        (Object.keys(CHANNEL_DEFINITIONS) as MessageChannel[]).map((c) => [
          c,
          this.configured(c),
        ]),
      ),
    };
  }
}
