import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { makePool } from '../db/pg';
import { ConfigService } from '@nestjs/config';
import {
  ACU_PER_GBP,
  PAST_DUE_GRACE_DAYS,
  PLAN_DEFINITIONS,
  WEBHOOK_PATH,
  assertStripeChargeable,
  fromMinorUnits,
  isEntitled,
  isHandled,
  toMinorUnits,
  topUpAcus,
  type BillingPlan,
  type SubscriptionState,
} from '@jessmove/shared';
import { ConversionsService } from '../tracking/conversions.service';
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
  /**
   * Read caches, not the record.
   *
   * Both of these were the record, which is why a refund arriving at a
   * recycled instance could not tell which member it belonged to. The
   * tables in migration 0027 hold the truth; these hold whatever this
   * instance has already looked up.
   */
  private readonly subscriptions = new Map<string, SubscriptionRecord>();
  private readonly customerToUser = new Map<string, string>();

  constructor(
    private readonly config: ConfigService,
    private readonly wallets: WalletService,
    private readonly conversions: ConversionsService,
  ) {
    const url = process.env.DATABASE_URL;
    if (url) {
      this.pool = makePool(url, 2);
    }
  }

  /** Fast path memory, durable path processed_events. */
  /**
   * Takes the event, or reports that somebody else already has it.
   *
   * This used to be a read followed later by a write, which is a race with
   * money on the end of it: Stripe retries, and can deliver the same event
   * to two instances at once. Both read "not seen", both grant the plan's
   * allowance, and both then insert with ON CONFLICT DO NOTHING. One
   * payment, two grants.
   *
   * The unique key on event_id was always the lock — it was being taken
   * too late. The insert is now the claim, and it is atomic. A claim left
   * `processing` for a quarter of an hour is a crashed attempt, and the
   * retry is allowed to take it over, which is what the old ordering was
   * protecting and this keeps.
   */
  private async claim(id: string, type: string): Promise<boolean> {
    if (!this.pool) {
      // Memory mode: one instance, so the set is the whole truth.
      if (this.seenEvents.has(id)) return false;
      this.seenEvents.add(id);
      return true;
    }
    try {
      const result = await this.pool.query(
        `INSERT INTO processed_events (event_id, kind, status, claimed_at)
         VALUES ($1, $2, 'processing', now())
         ON CONFLICT (event_id) DO UPDATE
           SET status = 'processing', claimed_at = now(), kind = EXCLUDED.kind
         WHERE processed_events.status = 'processing'
           AND processed_events.claimed_at < now() - interval '15 minutes'
         RETURNING event_id`,
        [id, type],
      );
      const won = result.rows.length > 0;
      if (won) this.seenEvents.add(id);
      return won;
    } catch (err) {
      // A dedupe store that cannot be reached must not become a way to
      // process an event twice, so the safe answer is "somebody has it".
      this.logger.error(`event claim failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Marks a claimed event finished, so no retry ever repeats it. */
  private async settle(id: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `UPDATE processed_events SET status = 'done' WHERE event_id = $1`,
        [id],
      );
    } catch (err) {
      this.logger.warn(`event settle failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Releases a claim whose work threw, so Stripe's retry can pick it up. */
  private async release(id: string): Promise<void> {
    this.seenEvents.delete(id);
    if (!this.pool) return;
    try {
      await this.pool.query('DELETE FROM processed_events WHERE event_id = $1', [id]);
    } catch (err) {
      this.logger.warn(`event release failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private secretKey(): string {
    return this.config.get<string>('STRIPE_SECRET_KEY') ?? '';
  }

  webhookSecret(): string {
    return this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
  }

  /**
   * The absolute URL Stripe must post to.
   *
   * Built from the same origin the platform already uses for its own
   * outbound links, plus the one path this controller serves, so the two
   * cannot disagree.
   */
  webhookUrl(): string {
    const origin = (process.env.API_PUBLIC_URL ?? 'https://api.jessmove.com/api').replace(/\/$/, '');
    return `${origin}${WEBHOOK_PATH}`;
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
      /*
       * The exact URL to paste into the Stripe dashboard, absolute.
       *
       * This endpoint reported `webhookPath` — a path with no host — and
       * the endpoint registered in Stripe pointed at the *site* rather
       * than the API, on a path this application has never served. Every
       * event 404'd against the Next.js app for as long as it was
       * configured that way, and nothing on this side could report a
       * problem, because nothing on this side was ever contacted.
       *
       * A path is not enough to get right. An absolute URL is.
       */
      webhookUrl: this.webhookUrl(),
      webhookNote:
        'This is the only URL that serves the webhook. It is on the API host, not the site — ' +
        'www.jessmove.com is the Next.js frontend and has no such route.',
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

  async subscriptionFor(userId: string): Promise<SubscriptionRecord | null> {
    const cached = [...this.subscriptions.values()].find((s) => s.userId === userId);
    if (cached) return cached;
    if (!this.pool) return null;

    try {
      const result = await this.pool.query(
        `SELECT subscription_id, customer_id, user_id, plan, state, current_period_end,
                cancel_at_period_end, state_since
           FROM stripe_subscriptions WHERE user_id = $1
          ORDER BY updated_at DESC LIMIT 1`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const record: SubscriptionRecord = {
        subscriptionId: String(row.subscription_id),
        customerId: String(row.customer_id),
        userId: String(row.user_id),
        plan: (row.plan as BillingPlan | null) ?? null,
        state: String(row.state) as SubscriptionState,
        currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end as string).toISOString() : null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        updatedAt: new Date(row.state_since as string).toISOString(),
      };
      this.subscriptions.set(record.subscriptionId, record);
      return record;
    } catch (err) {
      this.logger.error(
        `subscription lookup failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Writes the eleven deposits still owed on an annual plan.
   *
   * Recorded rather than granted, because they are not owed yet. The
   * gateway releases each one when it falls due, on the same read path
   * that already releases the free tier and the platform's daily budget —
   * this deployment has no scheduler, and inventing one for eleven rows a
   * year would be a worse answer than the pattern already in use.
   */
  private async scheduleAnnualDeposits(
    userId: string,
    plan: BillingPlan,
    invoiceId: string,
    acusPerMonth: number,
  ): Promise<void> {
    if (!this.pool || acusPerMonth <= 0) return;
    try {
      for (let month = 1; month <= 11; month += 1) {
        await this.pool.query(
          /*
           * `make_interval` rather than `($4 || ' months')::interval`.
           * The string form uses the same parameter as both an integer
           * and text, and Postgres refuses to deduce a type for it —
           * "inconsistent types deduced for parameter $4". It parses
           * fine and fails at execution, so it would have thrown on the
           * first real annual subscription and nowhere earlier.
           */
          `INSERT INTO annual_deposits (user_id, plan, invoice_id, month_index, acus, due_at)
           VALUES ($1, $2, $3, $4, $5, now() + make_interval(months => $4))
           ON CONFLICT (invoice_id, month_index) DO NOTHING`,
          [userId, plan, invoiceId, month, acusPerMonth],
        );
      }
    } catch (err) {
      /*
       * The member has paid for a year and this is what says so. Losing it
       * silently would mean they receive one twelfth of what they bought,
       * which is the opposite failure to the one being fixed and just as
       * unacceptable — so it is logged at error, loudly enough to find.
       */
      this.logger.error(
        `annual deposit schedule failed for ${userId} on ${invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** The Stripe customer for an account. Resolved here, never from a request. */
  async customerIdFor(userId: string): Promise<string | null> {
    for (const [customerId, uid] of this.customerToUser) {
      if (uid === userId) return customerId;
    }
    if (!this.pool) return null;
    try {
      const result = await this.pool.query(
        'SELECT customer_id FROM stripe_customers WHERE user_id = $1 ORDER BY linked_at DESC LIMIT 1',
        [userId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const customerId = String(row.customer_id);
      this.customerToUser.set(customerId, userId);
      return customerId;
    } catch (err) {
      this.logger.error(
        `customer lookup failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** The account a Stripe customer belongs to. */
  private async userForCustomer(customerId: string): Promise<string | null> {
    const cached = this.customerToUser.get(customerId);
    if (cached) return cached;
    if (!this.pool) return null;
    try {
      const result = await this.pool.query(
        'SELECT user_id FROM stripe_customers WHERE customer_id = $1',
        [customerId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const userId = String(row.user_id);
      this.customerToUser.set(customerId, userId);
      return userId;
    } catch (err) {
      this.logger.error(
        `customer reverse lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async linkCustomer(customerId: string, userId: string): Promise<void> {
    this.customerToUser.set(customerId, userId);
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO stripe_customers (customer_id, user_id) VALUES ($1, $2)
         ON CONFLICT (customer_id) DO UPDATE SET user_id = $2`,
        [customerId, userId],
      );
    } catch (err) {
      this.logger.error(
        `customer link failed for ${customerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async saveSubscription(record: SubscriptionRecord, stateChanged: boolean): Promise<void> {
    this.subscriptions.set(record.subscriptionId, record);
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO stripe_subscriptions
           (subscription_id, customer_id, user_id, plan, state, current_period_end,
            cancel_at_period_end, state_since, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
         ON CONFLICT (subscription_id) DO UPDATE SET
           customer_id = $2, user_id = $3, plan = $4, state = $5,
           current_period_end = $6, cancel_at_period_end = $7,
           -- Only a real state transition restarts the grace clock. A
           -- routine update that leaves past_due as past_due must not
           -- extend it, or the grace period never ends.
           state_since = CASE WHEN stripe_subscriptions.state IS DISTINCT FROM $5
                              THEN now() ELSE stripe_subscriptions.state_since END,
           updated_at = now()`,
        [
          record.subscriptionId,
          record.customerId,
          record.userId,
          record.plan,
          record.state,
          record.currentPeriodEnd,
          record.cancelAtPeriodEnd,
        ],
      );
      void stateChanged;
    } catch (err) {
      this.logger.error(
        `subscription save failed for ${record.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Money went back, so the allowance it bought goes back with it.
   *
   * Both of the events that call this used to write a log line and stop,
   * while `WEBHOOK_EFFECTS` had described them for months as reversing the
   * allowance. The sequence that exploited the gap needed no skill: top
   * up, spend the ACU, ask for the money back. It returned the money and
   * left this platform holding the provider bill, and it could be done
   * again the next day.
   *
   * The reversal is proportional to what was returned, and it is measured
   * against the grant the payment actually created rather than recomputed
   * from the amount — a second copy of the pricing rules would drift from
   * the first.
   */
  private async reverse(
    kind: 'refund' | 'dispute',
    reference: string,
    gbp: number,
    charge: Record<string, unknown>,
    userId: string | null,
  ): Promise<string> {
    if (!userId) {
      return `${kind} of £${gbp.toFixed(2)} could not be matched to an account. Recorded for review; no allowance reversed.`;
    }
    if (gbp <= 0) return `${kind} of £0.00 — nothing to reverse.`;

    const wallet = await this.wallets.forSubject('user', userId);

    // A charge names the payment intent that made it and the invoice it
    // settled. Either can be the reference on the grant.
    const candidates = [
      typeof charge.payment_intent === 'string' ? charge.payment_intent : null,
      typeof charge.invoice === 'string' ? charge.invoice : null,
      typeof charge.id === 'string' ? charge.id : null,
    ].filter((v): v is string => Boolean(v));

    let matched: { reference: string; acus: number; originalGbp: number } | null = null;
    for (const candidate of candidates) {
      const grant = await this.wallets.referencedGrant(wallet.id, candidate);
      if (grant) {
        matched = { reference: candidate, acus: grant.amount, originalGbp: 0 };
        break;
      }
    }

    const chargeGbp = fromMinorUnits(Number(charge.amount ?? 0));
    // Proportional, so a partial refund takes back a proportional share.
    const proportion = chargeGbp > 0 ? Math.min(1, gbp / chargeGbp) : 1;

    /*
     * With no matching grant the fallback is the face rate — the same rate
     * an off-tier top-up is credited at. It is the conservative direction:
     * it can under-recover on a subscription whose allowance was sold
     * below face value, and under-recovering is the error to prefer when
     * the alternative is taking allowance a member paid for elsewhere.
     */
    const acus = matched
      ? Math.round(matched.acus * proportion)
      : Math.round(gbp * ACU_PER_GBP);

    const result = await this.wallets.clawback(wallet.id, {
      kind,
      reference,
      gbp,
      acus,
      matching: matched?.reference,
      note: `${kind} on ${reference}${matched ? ` matched grant via ${matched.reference}` : ' unmatched, face rate'}`,
    });

    if (!result.applied) {
      return `${kind} of £${gbp.toFixed(2)} already reversed, or could not be applied. Nothing repeated.`;
    }

    const shortfall =
      result.shortfall > 0
        ? ` ${result.shortfall} ACU had already been spent and cannot be recovered — that is the loss on this ${kind}.`
        : '';
    return `${kind} of £${gbp.toFixed(2)}: reversed ${result.clawedBack} ACU.${shortfall}`;
  }

  /**
   * Stops entitlement while a dispute is open.
   *
   * Not a punishment and not permanent — `paused` is a Stripe state that
   * ends when the dispute does. Leaving a subscription active through a
   * chargeback is how the same account disputes a second month.
   */
  private async freezeFor(userId: string | null): Promise<string> {
    if (!userId) return 'No account matched, so nothing was frozen.';
    const record = await this.subscriptionFor(userId);
    if (!record) return 'No subscription to freeze.';
    record.state = 'paused';
    record.updatedAt = new Date().toISOString();
    await this.saveSubscription(record, true);
    return `Subscription ${record.subscriptionId} frozen pending the dispute.`;
  }

  /**
   * Whether a past-due subscription has run out its grace period.
   *
   * `PAST_DUE_GRACE_DAYS` was declared with a paragraph explaining why
   * losing your coach to an expired card is the wrong behaviour, and then
   * never read by anything — so `past_due` was not a grace period at all,
   * it was permanent entitlement on a card that had stopped paying. The
   * grace is real in both directions or it is not a grace period.
   */
  async entitledNow(userId: string, now = new Date()): Promise<boolean> {
    const record = await this.subscriptionFor(userId);
    if (!record) return false;
    if (isEntitled(record.state)) return true;
    if (record.state !== 'past_due') return false;

    const since = Date.parse(record.updatedAt);
    if (!Number.isFinite(since)) return false;
    const days = (now.getTime() - since) / 86_400_000;
    return days <= PAST_DUE_GRACE_DAYS;
  }

  private async userFor(
    event: Record<string, unknown>,
    object: Record<string, unknown>,
  ): Promise<string | null> {
    const metadata = (object.metadata ?? {}) as Record<string, string>;
    if (metadata.userId) return metadata.userId;
    const customer = typeof object.customer === 'string' ? object.customer : null;
    // The stored link, not just this instance's memory. A refund is
    // routinely the first Stripe event a freshly-started instance sees,
    // and it carries a customer id and nothing else.
    if (customer) {
      const linked = await this.userForCustomer(customer);
      if (linked) return linked;
    }
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

    // Claimed before any work happens, so two deliveries of one event
    // cannot both act on it.
    if (!(await this.claim(id, type))) {
      return { id, type, outcome: 'duplicate', detail: 'Already processed. Nothing repeated.' };
    }

    if (!isHandled(type)) {
      await this.settle(id);
      return { id, type, outcome: 'ignored', detail: 'Not an event this platform acts on.' };
    }

    try {
      return await this.applyClaimed(id, type, event);
    } catch (error) {
      await this.release(id);
      throw error;
    }
  }

  /** The work itself, with the event already claimed. */
  private async applyClaimed(
    id: string,
    type: string,
    event: Record<string, unknown>,
  ): Promise<{
    id: string;
    type: string;
    outcome: 'applied' | 'duplicate' | 'ignored';
    detail: string;
  }> {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const object = (data.object ?? {}) as Record<string, unknown>;
    const userId = await this.userFor(event, object);
    const customerId = typeof object.customer === 'string' ? object.customer : null;
    if (customerId && userId) await this.linkCustomer(customerId, userId);

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

        const settled = type === 'customer.subscription.deleted' ? 'canceled' : state;
        await this.saveSubscription(
          {
            subscriptionId,
            customerId: customerId ?? '',
            userId: userId ?? '',
            plan: (metadata.plan as BillingPlan) ?? null,
            state: settled,
            currentPeriodEnd: endsAt,
            cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
            updatedAt: new Date().toISOString(),
          },
          true,
        );

        detail = `Subscription ${subscriptionId} is ${settled}. Entitled: ${isEntitled(settled)}.`;
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

        /*
         * Stripe reports the amount in the price's own currency. Crediting
         * a non-GBP invoice as though it were pounds would hand out the
         * allowance for a plan that was never bought at that price — so an
         * unexpected currency grants nothing and says so, rather than
         * guessing at an exchange rate the platform has no business
         * inventing.
         */
        const currency = String(object.currency ?? 'gbp').toLowerCase();
        if (currency !== 'gbp') {
          detail = `Invoice paid in ${currency.toUpperCase()}, not GBP. Nothing granted — every plan is priced in GBP.`;
          this.logger.error(`invoice ${String(object.id ?? id)} paid in ${currency}; no allowance granted`);
          break;
        }

        if (userId && plan && allowance) {
          const wallet = await this.wallets.forSubject('user', userId);
          /*
           * The invoice id, not the event id, so a later refund of this
           * charge can find the allowance it bought. A refund arrives as a
           * charge carrying `invoice`; it has never seen the event that
           * granted, so keying the grant to the event made the two
           * unmatchable.
           */
          const invoiceId = String(object.id ?? id);

          /*
           * An annual plan deposits a twelfth, not the year.
           *
           * `depositAnnualMonth` existed for exactly this and was called by
           * nothing, so a year's allowance landed on day one. That is a
           * cash-flow assumption broken in the platform's favour right up
           * until somebody notices the obvious sequence: buy the annual
           * plan, spend the whole year's ACU inside a week, then charge
           * back. The reversal recovers whatever is left, which by then is
           * nothing, and the shortfall is the entire year of compute.
           *
           * It also fixes a quieter absurdity: a subscription grant lives
           * 90 days, so eleven twelfths of an annual allowance expired
           * unused before the member could reach it.
           *
           * The remaining eleven deposits are due monthly. `entitledNow`
           * is what decides whether they are still owed, so a cancelled or
           * charged-back annual plan stops depositing.
           */
          const definition = PLAN_DEFINITIONS[plan];
          const isAnnual = definition.interval === 'year';
          const granted = isAnnual ? Math.floor(allowance / 12) : allowance;

          await this.wallets.depositAllowance(
            wallet.id,
            granted,
            `invoice_${plan}_${invoiceId}${isAnnual ? ':m0' : ''}`,
          );

          if (isAnnual) {
            await this.scheduleAnnualDeposits(userId, plan, invoiceId, granted);
          }

          detail =
            `Granted ${granted} ACU to ${userId} for ${plan} (£${paidGbp.toFixed(2)} paid)` +
            `${isAnnual ? `, first of twelve monthly deposits from a ${allowance} ACU year` : ''}.`;

          /*
           * The purchase conversion, at the only moment money is certainly
           * real. Sent server to server, carrying the plan and the amount
           * and nothing about who paid — an advertising network does not
           * need to know which of this platform's members subscribed.
           *
           * This branch is already idempotent for the wallet, and the
           * conversion inherits that: a webhook Stripe redelivers grants no
           * second allowance and reports no second sale.
           */
          this.conversions.record({ event: 'subscribed', valueGbp: paidGbp, plan });
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
          // `state_since` is what the grace period is measured from, so
          // the move to past_due has to be written, not just remembered.
          await this.saveSubscription(record, true);
        }
        detail =
          `Payment failed${userId ? ` for ${userId}` : ''}. Moved to past_due; entitlement ` +
          `continues for ${PAST_DUE_GRACE_DAYS} days and then stops.`;
        break;
      }

      case 'charge.refunded': {
        const refunded = fromMinorUnits(Number(object.amount_refunded ?? 0));
        detail = await this.reverse('refund', String(object.id ?? id), refunded, object, userId);
        break;
      }

      case 'charge.dispute.created': {
        /*
         * A dispute is not a refund with a different name. The money is
         * already gone from our side, the outcome is weeks away, and the
         * cases that reach this event are disproportionately the ones
         * where the allowance was consumed on purpose — so the allowance
         * comes back at the same moment, and entitlement is frozen rather
         * than left running while it is argued about.
         */
        const charge = typeof object.charge === 'string' ? object.charge : String(object.id ?? id);
        const disputed = fromMinorUnits(Number(object.amount ?? 0));
        const reversal = await this.reverse('dispute', String(object.id ?? id), disputed, { ...object, id: charge }, userId);

        const frozen = await this.freezeFor(userId);
        detail = `${reversal} ${frozen}`;
        break;
      }

      case 'payment_intent.succeeded': {
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        const amount = fromMinorUnits(Number(object.amount_received ?? object.amount ?? 0));
        if (metadata.kind === 'acu_topup' && userId) {
          const wallet = await this.wallets.forSubject('user', userId);
          /*
           * Credited from the published tier table rather than from a bare
           * multiplication, so the advertised bonus is actually granted —
           * £10 buys the 1,040 ACU the pricing says it does, not 1,000.
           * An off-tier amount still credits at face value: the money has
           * already been taken, so granting nothing would be theft. It is
           * logged because it means either the tiers moved without this
           * path moving with them, or somebody is paying an amount we do
           * not offer.
           */
          const { acus, tier } = topUpAcus(amount);
          const bonus = tier ? tier.bonusAcus : 0;
          const paymentIntent = String(object.id ?? id);
          await this.wallets.purchase(wallet.id, amount, bonus, new Date(), paymentIntent);

          if (!tier) {
            this.logger.warn(
              `top-up of £${amount.toFixed(2)} matches no published tier — credited ${acus} ACU at face value`,
            );
          }
          detail =
            `Top-up of £${amount.toFixed(2)} credited ${acus} ACU to ${userId}` +
            `${tier ? ` (tier £${tier.gbp}, ${tier.bonusAcus} bonus)` : ' (off-tier, no bonus)'}.`;
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

    await this.settle(id);
    return { id, type, outcome: 'applied', detail };
  }
}
