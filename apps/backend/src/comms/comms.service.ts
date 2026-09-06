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

  /**
   * Whether this channel has somewhere to send to. It does not.
   *
   * This used to read `EMAIL_API_KEY`, `SMS_API_KEY`, `PUSH_API_KEY` and
   * `WHATSAPP_API_KEY` and record `status: 'sent'` when one of them was a
   * non-empty string. There is no HTTP call to any provider anywhere in
   * this module and never has been, so setting any of those four turned a
   * simulation into a delivery record claiming a message had gone out.
   * A false positive on a delivery ledger is worse than an honest
   * `sandbox`: it is the record somebody consults when a member says
   * "I never got the breach notice".
   *
   * The four variables are gone rather than left unread, because a
   * variable named for a capability the code does not have is a promise
   * to whoever deploys it.
   *
   * What is real: `in_app` is a row in our own database. Everything else
   * resolves and renders here and transmits nowhere. The platform's only
   * live transports are `MailService` over SMTP and `PushService` over
   * VAPID, and neither is reached from this module — nothing in the
   * backend calls `CommsService` at all. It is the event catalogue's
   * dry run, and it should look like one.
   */
  private hasTransport(channel: MessageChannel): boolean {
    return channel === 'in_app';
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
        transportPresent: this.hasTransport(c),
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
        if (this.hasTransport(channel)) write(channel, 'logged');
        else {
          write(
            channel,
            'sandbox',
            `resolved and rendered, not transmitted — this module has no ${channel} transport`,
          );
        }
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
      /* Renamed from `providersConfigured`, which asked the wrong
         question: a configured provider and a transport that exists in
         this codebase are not the same thing, and only the second one
         puts a message on a wire. */
      transportPresent: Object.fromEntries(
        (Object.keys(CHANNEL_DEFINITIONS) as MessageChannel[]).map((c) => [
          c,
          this.hasTransport(c),
        ]),
      ),
    };
  }
}
