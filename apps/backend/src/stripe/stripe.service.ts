import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PLAN_DEFINITIONS,
  assertStripeChargeable,
  fromMinorUnits,
  isEntitled,
  isHandled,
  toMinorUnits,
  type BillingPlan,
  type SubscriptionState,
} from '@jessmove/shared';
import { WalletService } from '../acu/wallet.service';
import { PRICE_CACHE_MS, matchPricesByPlan, type StripePriceLike } from './prices.logic';

/**
 * Stripe, over `fetch`.
 *
 * No SDK. The three calls this platform makes — create a Checkout session,
 * create a Billing Portal session, read a subscription — are ordinary form
 * posts, and not taking the dependency means the webhook path has no
 * third-party code in it at all.
 *
 * Nothing here throws when the key is missing. `configured()` is false, the
 * endpoints say so plainly, and the rest of the API keeps working. A
 * platform that will not start because a payment key is absent cannot be
 * developed against.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

/**
 * The slice of the fetch Response this service reads, declared locally.
 * Which global `Response` type the compiler resolves varies by toolchain
 * (Vercel's NestJS builder resolves Express's, which has none of these);
 * naming the shape here makes the build independent of that choice.
 */
interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

interface DedupePool {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SubscriptionRecord {
  subscriptionId: string;
  customerId: string;
  userId: string;
  plan: BillingPlan | null;
  state: SubscriptionState;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  /** Prices discovered from Stripe by their `plan` metadata. */
  private priceCache: { at: number; byPlan: Map<BillingPlan, string> } | null = null;

  /**
   * Processed event ids. Stripe retries for days; every event is
   * idempotent. The set is the fast path; with DATABASE_URL set, ids
   * also land in processed_events so a replay finds them whichever
   * instance receives it, however long after.
   */
  private readonly seenEvents = new Set<string>();
  private pool: DedupePool | null = null;
  private readonly subscriptions = new Map<string, SubscriptionRecord>();
  private readonly customerToUser = new Map<string, string>();

  constructor(
    private readonly config: ConfigService,
    private readonly wallets: WalletService,
  ) {
    const url = process.env.DATABASE_URL;
    if (url) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg') as { Pool: new (o: object) => DedupePool };
      this.pool = new Pool({
        connectionString: url,
        max: 2,
        ssl: url.includes('sslmode=require') || url.includes('vercel')
          ? { rejectUnauthorized: true }
          : undefined,
      });
    }
  }

  /** Fast path memory, durable path processed_events. */
  private async wasSeen(id: string): Promise<boolean> {
    if (this.seenEvents.has(id)) return true;
    if (!this.pool) return false;
    try {
      const result = await this.pool.query('SELECT 1 FROM processed_events WHERE event_id = $1', [id]);
      return result.rows.length > 0;
    } catch (err) {
      this.logger.warn(`event dedupe read failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Recorded only after processing, so a crash mid-event lets Stripe retry. */
  private async recordSeen(id: string, type: string): Promise<void> {
    this.seenEvents.add(id);
    if (!this.pool) return;
    try {
      await this.pool.query(
        'INSERT INTO processed_events (event_id, kind) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING',
        [id, type],
      );
    } catch (err) {
      this.logger.warn(`event dedupe write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private secretKey(): string {
    return this.config.get<string>('STRIPE_SECRET_KEY') ?? '';
  }

  webhookSecret(): string {
    return this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
  }

  configured(): boolean {
    return this.secretKey().startsWith('sk_');
  }

  async status() {
    const discovered = await this.discoverPrices();
    const prices = Object.entries(PLAN_DEFINITIONS).map(([plan, def]) => {
      const envId = this.config.get<string>(def.priceEnvVar);
      const found = envId ?? discovered.get(plan as BillingPlan) ?? null;
      return {
        plan,
        priceId: found,
        source: envId ? 'env_override' : found ? 'stripe_metadata' : null,
      };
    });

    return {
      secretKeyConfigured: this.configured(),
      webhookSecretConfigured: this.webhookSecret().startsWith('whsec_'),
      mode: this.secretKey().startsWith('sk_live') ? 'live' : this.configured() ? 'test' : 'none',
      prices,
      missingPriceIds: prices.filter((p) => !p.priceId).map((p) => p.plan),
      pricesManagedIn:
        'Stripe. Set metadata plan=<key> on each price (Products → price → Edit metadata); ' +
        'discovery refreshes within five minutes. STRIPE_PRICE_* env variables remain as optional overrides.',
      eventsProcessed: this.seenEvents.size,
      subscriptions: this.subscriptions.size,
      note: this.configured()
        ? 'Ready. The webhook still needs STRIPE_WEBHOOK_SECRET to accept anything.'
        : 'No key set. Checkout returns 400 with an explanation; everything else keeps working.',
    };
  }

  /** Env override first, then discovery by metadata. Null means neither. */
  private async priceIdFor(plan: BillingPlan): Promise<string | null> {
    const envId = this.config.get<string>(PLAN_DEFINITIONS[plan].priceEnvVar);
    if (envId) return envId;
    return (await this.discoverPrices()).get(plan) ?? null;
  }

  private async discoverPrices(): Promise<Map<BillingPlan, string>> {
    if (!this.configured()) return new Map();
    if (this.priceCache && Date.now() - this.priceCache.at < PRICE_CACHE_MS) {
      return this.priceCache.byPlan;
    }
    try {
      const json = await this.call('/prices', { active: 'true', limit: '100' }, 'GET');
      const byPlan = matchPricesByPlan((json.data as StripePriceLike[]) ?? []);
      this.priceCache = { at: Date.now(), byPlan };
      return byPlan;
    } catch (err) {
      this.logger.warn(
        `price discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.priceCache?.byPlan ?? new Map();
    }
  }

  /** Form-encoded, because that is what the Stripe API takes. */
  private async call(
    path: string,
    params: Record<string, string>,
    method: 'POST' | 'GET' = 'POST',
  ): Promise<Record<string, unknown>> {
    if (!this.configured()) {
      throw new BadRequestException(
        'STRIPE_SECRET_KEY is not set on this deployment — see docs/BACKEND-RUNBOOK.md',
      );
    }

    const body = new URLSearchParams(params).toString();
    const url = method === 'GET' ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;

    const response = (await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey()}`,
        'content-type': 'application/x-www-form-urlencoded',
        // Stripe deduplicates retries of the same idempotency key for 24h.
        'idempotency-key': `${path}:${body}`.slice(0, 255),
      },
      body: method === 'POST' ? body : undefined,
    })) as unknown as FetchResponse;

    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const error = json.error as { message?: string } | undefined;
      throw new BadRequestException(`Stripe: ${error?.message ?? response.statusText}`);
    }
    return json;
  }

  async createCheckoutSession(opts: {
    userId: string;
    plan: BillingPlan;
    quantity?: number;
    successUrl: string;
    cancelUrl: string;
  }) {
    const definition = PLAN_DEFINITIONS[opts.plan];
    const priceId = await this.priceIdFor(opts.plan);
    if (!priceId) {
      throw new BadRequestException(
        `No active Stripe price carries metadata plan=${opts.plan}. Set it in Stripe ` +
          `(Products → the price → Edit metadata), or set ${definition.priceEnvVar} as an override.`,
      );
    }

    const quantity = Math.max(1, opts.quantity ?? 1);
    assertStripeChargeable(definition.gbp * quantity);

    const session = await this.call('/checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': String(quantity),
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      client_reference_id: opts.userId,
      'metadata[userId]': opts.userId,
      'metadata[plan]': opts.plan,
      'subscription_data[metadata][userId]': opts.userId,
      'subscription_data[metadata][plan]': opts.plan,
    });

    return {
      sessionId: session.id,
      url: session.url,
      plan: opts.plan,
      quantity,
      amountGbp: Number((definition.gbp * quantity).toFixed(2)),
    };
  }

  async createTopUpSession(opts: { userId: string; amountGbp: number; successUrl: string; cancelUrl: string }) {
    assertStripeChargeable(opts.amountGbp);

    const session = await this.call('/checkout/sessions', {
      mode: 'payment',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][unit_amount]': String(toMinorUnits(opts.amountGbp)),
      'line_items[0][price_data][product_data][name]': 'Adaptive Coaching Units',
      'line_items[0][quantity]': '1',
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      client_reference_id: opts.userId,
      'metadata[userId]': opts.userId,
      'metadata[kind]': 'acu_topup',
      'payment_intent_data[metadata][userId]': opts.userId,
      'payment_intent_data[metadata][kind]': 'acu_topup',
    });

    return { sessionId: session.id, url: session.url, amountGbp: opts.amountGbp };
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    const session = await this.call('/billing_portal/sessions', {
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  /* ---------------- webhook ---------------- */

  subscriptionFor(userId: string): SubscriptionRecord | null {
    return [...this.subscriptions.values()].find((s) => s.userId === userId) ?? null;
  }

  entitled(userId: string): boolean {
    const record = this.subscriptionFor(userId);
    return record ? isEntitled(record.state) : false;
  }

  private userFor(event: Record<string, unknown>, object: Record<string, unknown>): string | null {
    const metadata = (object.metadata ?? {}) as Record<string, string>;
    if (metadata.userId) return metadata.userId;
    const customer = typeof object.customer === 'string' ? object.customer : null;
    if (customer && this.customerToUser.has(customer)) return this.customerToUser.get(customer)!;
    const reference = object.client_reference_id;
    return typeof reference === 'string' ? reference : null;
  }

  /**
   * Applies one verified event.
   *
   * Returns a description of what it did rather than void, because "the
   * webhook returned 200" tells you nothing about whether the entitlement
   * moved. Unknown types are `ignored`, never an error — a 4xx makes
   * Stripe retry forever and then disable the endpoint.
   */
  async applyEvent(event: Record<string, unknown>): Promise<{
    id: string;
    type: string;
    outcome: 'applied' | 'duplicate' | 'ignored';
    detail: string;
  }> {
    const id = String(event.id ?? '');
    const type = String(event.type ?? '');

    if (!id) throw new BadRequestException('the event has no id');

    if (await this.wasSeen(id)) {
      return { id, type, outcome: 'duplicate', detail: 'Already processed. Nothing repeated.' };
    }

    if (!isHandled(type)) {
      // Recorded as seen so a retry of the same unknown event is cheap.
      await this.recordSeen(id, type);
      return { id, type, outcome: 'ignored', detail: 'Not an event this platform acts on.' };
    }

    const data = (event.data ?? {}) as Record<string, unknown>;
    const object = (data.object ?? {}) as Record<string, unknown>;
    const userId = this.userFor(event, object);
    const customerId = typeof object.customer === 'string' ? object.customer : null;
    if (customerId && userId) this.customerToUser.set(customerId, userId);

    let detail = '';

    switch (type) {
      case 'checkout.session.completed': {
        detail = userId
          ? `Linked customer ${customerId ?? 'unknown'} to ${userId}. No entitlement granted yet — that waits for invoice.paid.`
          : 'No userId on the session; nothing linked.';
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscriptionId = String(object.id ?? '');
        const state = String(object.status ?? 'incomplete') as SubscriptionState;
        const endsAt =
          typeof object.current_period_end === 'number'
            ? new Date(object.current_period_end * 1000).toISOString()
            : null;
        const metadata = (object.metadata ?? {}) as Record<string, string>;

        this.subscriptions.set(subscriptionId, {
          subscriptionId,
          customerId: customerId ?? '',
          userId: userId ?? '',
          plan: (metadata.plan as BillingPlan) ?? null,
          state: type === 'customer.subscription.deleted' ? 'canceled' : state,
          currentPeriodEnd: endsAt,
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
          updatedAt: new Date().toISOString(),
        });

        detail = `Subscription ${subscriptionId} is ${type === 'customer.subscription.deleted' ? 'canceled' : state}. Entitled: ${isEntitled(state)}.`;
        break;
      }

      case 'invoice.paid': {
        // The only event that grants units. Doing it here rather than on
        // checkout.session.completed means a renewal grants too, and a
        // failed renewal does not.
        const lines = (object.lines ?? {}) as Record<string, unknown>;
        const first = ((lines.data ?? []) as Record<string, unknown>[])[0] ?? {};
        const metadata = (first.metadata ?? object.metadata ?? {}) as Record<string, string>;
        const plan = metadata.plan as BillingPlan | undefined;
        const allowance = plan ? PLAN_DEFINITIONS[plan]?.acuAllowance : undefined;
        const paidGbp = fromMinorUnits(Number(object.amount_paid ?? 0));

        if (userId && plan && allowance) {
          const wallet = await this.wallets.forSubject('user', userId);
          await this.wallets.depositAllowance(wallet.id, allowance, `invoice_${plan}_${id}`);
          detail = `Granted ${allowance} ACU to ${userId} for ${plan} (£${paidGbp.toFixed(2)} paid).`;
        } else {
          detail = `Invoice paid, £${paidGbp.toFixed(2)}. No plan metadata, so no allowance granted — check the price's metadata.`;
        }
        break;
      }

      case 'invoice.payment_failed': {
        const subscriptionId = typeof object.subscription === 'string' ? object.subscription : null;
        const record = subscriptionId ? this.subscriptions.get(subscriptionId) : null;
        if (record) {
          record.state = 'past_due';
          record.updatedAt = new Date().toISOString();
        }
        detail = `Payment failed${userId ? ` for ${userId}` : ''}. Moved to past_due; entitlement continues through the grace period.`;
        break;
      }

      case 'charge.refunded': {
        const refunded = fromMinorUnits(Number(object.amount_refunded ?? 0));
        detail = `Refund of £${refunded.toFixed(2)} recorded for review.`;
        break;
      }

      case 'charge.dispute.created': {
        detail = 'Dispute opened and recorded for review.';
        break;
      }

      case 'payment_intent.succeeded': {
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        const amount = fromMinorUnits(Number(object.amount_received ?? object.amount ?? 0));
        if (metadata.kind === 'acu_topup' && userId) {
          const wallet = await this.wallets.forSubject('user', userId);
          await this.wallets.purchase(wallet.id, amount);
          detail = `Top-up of £${amount.toFixed(2)} credited to ${userId}.`;
        } else {
          detail = `Payment of £${amount.toFixed(2)} succeeded. Not a top-up, so nothing credited.`;
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        detail = 'Payment failed. Nothing credited.';
        break;
      }
    }

    await this.recordSeen(id, type);
    return { id, type, outcome: 'applied', detail };
  }
}
