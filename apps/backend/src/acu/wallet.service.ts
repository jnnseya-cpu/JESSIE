import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { makePool } from '../db/pg';
import { randomUUID } from 'node:crypto';
import {
  ACU_PER_GBP,
  COST_PROTECTION_MULTIPLE,
  MAX_ROLLOVER_ALLOCATIONS,
  WALLET_PRECEDENCE,
  WALLET_VALIDITY_DAYS,
  annualMonthlyDeposit,
  breachesProtectionRule,
  monthlyAcuAllocation,
  requiredAcus,
  type CostInput,
  type WalletBucket,
} from '@jessmove/body-command';
import { MIN_TRANSACTION_GBP, assertChargeable } from '@jessmove/shared';

/**
 * The ACU wallet and Cost Governor.
 *
 * Two rules do the work:
 *   - every AI action must clear 4x its direct provider cost;
 *   - a zero balance stops paid AI work rather than creating debt.
 *
 * Non-AI features are never metered, so an empty wallet degrades the
 * product rather than breaking it.
 */

export interface AcuGrant {
  id: string;
  bucket: WalletBucket;
  amount: number;
  remaining: number;
  grantedAt: Date;
  expiresAt: Date;
  sourceRef?: string;
}

export interface SpendControls {
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  perAgentLimit?: Record<string, number>;
  /** Below this balance, a guardian or administrator must approve spend. */
  approvalThreshold?: number;
}

export interface AutoTopUp {
  enabled: boolean;
  /** Trigger when the balance falls below this. */
  belowAcus: number;
  /** Amount to purchase, in pounds. Must clear MIN_TRANSACTION_GBP. */
  amountGbp: number;
}

export interface Wallet {
  id: string;
  subjectType: 'user' | 'family' | 'organisation';
  subjectId: string;
  grants: AcuGrant[];
  controls: SpendControls;
  autoTopUp?: AutoTopUp;
  spentToday: number;
  spentThisMonth: number;
}

export interface SpendRequest {
  walletId: string;
  agentCode: string;
  reason: string;
  cost: CostInput;
}

export type SpendResult =
  | {
      allowed: true;
      acusCharged: number;
      customerChargeGbp: number;
      balanceAfter: number;
      drawnFrom: { bucket: WalletBucket; amount: number }[];
      /**
       * The exact grants the ACUs came out of.
       *
       * Needed so an unspent hold goes back where it was taken from. A
       * refund into a fresh grant would quietly turn purchased allowance
       * into an expiring one, and the member would never be told.
       */
      grants: { grantId: string; amount: number }[];
    }
  | {
      allowed: false;
      reason:
        | 'insufficient_balance'
        | 'daily_limit'
        | 'monthly_limit'
        | 'agent_limit'
        | 'requires_approval'
        | 'contended'
        | 'not_recorded';
      acusRequired: number;
      balance: number;
      /** What the user can still do. Non-AI features never stop. */
      message: string;
    };

/**
 * How many times a mutation re-reads and retries when another instance
 * wrote first.
 *
 * Contention on one wallet means one person's own concurrent requests, so
 * the realistic depth is two or three. Five is generous; past it the
 * honest answer is to refuse the spend rather than keep trying, because
 * whatever is hammering that wallet is not a person using the product.
 */
const MUTATION_ATTEMPTS = 5;

/** Removing allowance is never silent. Why it went is recorded with it. */
export type AdjustmentKind = 'refund' | 'dispute' | 'correction';

export interface ClawbackResult {
  /** ACUs actually recovered. */
  clawedBack: number;
  /**
   * ACUs that could not be recovered because they were already spent.
   * The measured loss on this refund — not a debt, and never charged to
   * the member, because a wallet does not go negative.
   */
  shortfall: number;
  /** False when this reference was already clawed back. Nothing repeated. */
  applied: boolean;
}

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

/** Revives a snapshot row: JSON dates come back as strings. */
export function reviveWallet(data: unknown): Wallet {
  const w = data as Wallet;
  return {
    ...w,
    grants: (w.grants ?? []).map((g) => ({
      ...g,
      grantedAt: new Date(g.grantedAt),
      expiresAt: new Date(g.expiresAt),
    })),
  };
}

@Injectable()
export class WalletService implements OnModuleDestroy {
  private readonly logger = new Logger(WalletService.name);
  private readonly wallets = new Map<string, Wallet>();
  /** The row version each cached wallet was read at. Guards every write. */
  private readonly versions = new Map<string, number>();
  private pool: PgPoolLike | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      this.pool = makePool(url, 2);
      this.logger.log('wallets: postgres write-through');
    } else {
      this.logger.warn('wallets: in-memory — balances will not survive a restart');
    }
  }

  driver(): 'postgres' | 'memory' {
    return this.pool ? 'postgres' : 'memory';
  }

  /**
   * Write-through, and conditional on the version that was read.
   *
   * The unconditional version of this method lost money. Two instances
   * each held a wallet loaded once and never re-read; each wrote its own
   * whole-wallet JSON back, so the second save erased the first
   * instance's spend while the provider had already been called for both.
   * On serverless there is always more than one instance.
   *
   * Returns false when the row moved underneath us. The caller re-reads
   * and retries rather than overwriting a spend it cannot see. A database
   * error is thrown, not logged: a spend that cannot be recorded must not
   * be reported as allowed, because the balance comes back on the next
   * restart and the provider bill does not.
   */
  private async persist(wallet: Wallet): Promise<boolean> {
    if (!this.pool) return true;
    const expected = this.versions.get(wallet.id) ?? 0;
    const result = await this.pool.query(
      `INSERT INTO app_wallets (id, subject_type, subject_id, data, version, updated_at)
       VALUES ($1, $2, $3, $4, 1, now())
       ON CONFLICT (id) DO UPDATE
         SET data = $4, version = app_wallets.version + 1, updated_at = now()
         WHERE app_wallets.version = $5
       RETURNING version`,
      [wallet.id, wallet.subjectType, wallet.subjectId, JSON.stringify(wallet), expected],
    );

    const row = result.rows[0];
    if (!row) return false;
    this.versions.set(wallet.id, Number(row.version));
    return true;
  }

  /** Reads the row and replaces whatever this instance was holding. */
  private async reload(walletId: string): Promise<Wallet | undefined> {
    if (!this.pool) return this.wallets.get(walletId);
    const result = await this.pool.query(
      'SELECT data, version FROM app_wallets WHERE id = $1',
      [walletId],
    );
    const row = result.rows[0];
    if (!row) {
      this.wallets.delete(walletId);
      this.versions.delete(walletId);
      return undefined;
    }
    const wallet = reviveWallet(row.data);
    this.wallets.set(wallet.id, wallet);
    this.versions.set(wallet.id, Number(row.version));
    return wallet;
  }

  /**
   * The only way a wallet changes.
   *
   * Read fresh, apply, write conditionally, and on a lost race read fresh
   * again — so every grant, spend, refund and clawback sees the balance as
   * it actually is rather than as this instance last remembered it.
   * `apply` must be pure with respect to anything outside the wallet it is
   * handed, because it can run more than once.
   */
  private async mutate<T>(
    walletId: string,
    apply: (wallet: Wallet) => T,
  ): Promise<
    | { ok: true; wallet: Wallet; value: T }
    | { ok: false; reason: 'missing' | 'contended' | 'not_recorded' }
  > {
    for (let attempt = 0; attempt < MUTATION_ATTEMPTS; attempt += 1) {
      let wallet: Wallet | undefined;
      try {
        wallet = await this.reload(walletId);
      } catch (err) {
        this.logger.error(
          `wallet ${walletId}: read failed — ${err instanceof Error ? err.message : String(err)}`,
        );
        return { ok: false, reason: 'not_recorded' };
      }
      if (!wallet) return { ok: false, reason: 'missing' };

      const value = apply(wallet);

      let saved: boolean;
      try {
        saved = await this.persist(wallet);
      } catch (err) {
        /*
         * A write that failed is a spend that did not happen. This used to
         * be caught and logged, which let the caller carry on and call a
         * provider against a balance that would come back on the next
         * restart — the bill was real and the deduction was not.
         *
         * Dropping this instance's cached copy matters as much as the
         * refusal: it has been mutated in memory but never written, so
         * anything reading it afterwards would see a deduction the
         * database has no record of.
         */
        this.wallets.delete(walletId);
        this.versions.delete(walletId);
        this.logger.error(
          `wallet ${walletId}: write failed — ${err instanceof Error ? err.message : String(err)}`,
        );
        return { ok: false, reason: 'not_recorded' };
      }

      if (saved) return { ok: true, wallet, value };

      this.logger.warn(
        `wallet ${walletId}: concurrent write, retrying (attempt ${attempt + 1}/${MUTATION_ATTEMPTS})`,
      );
    }
    this.logger.error(`wallet ${walletId}: gave up after ${MUTATION_ATTEMPTS} contended writes`);
    return { ok: false, reason: 'contended' };
  }

  /** Loads a wallet into memory by id if this instance has not seen it. */
  private async hydrate(walletId: string): Promise<void> {
    if (!this.pool || this.wallets.has(walletId)) return;
    try {
      await this.reload(walletId);
    } catch (err) {
      this.logger.error(`wallet hydrate failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async hydrateBySubject(
    subjectType: Wallet['subjectType'],
    subjectId: string,
  ): Promise<void> {
    if (!this.pool) return;
    const inMemory = [...this.wallets.values()].some(
      (w) => w.subjectType === subjectType && w.subjectId === subjectId,
    );
    if (inMemory) return;
    try {
      const result = await this.pool.query(
        'SELECT data, version FROM app_wallets WHERE subject_type = $1 AND subject_id = $2',
        [subjectType, subjectId],
      );
      const row = result.rows[0];
      if (row) {
        const wallet = reviveWallet(row.data);
        this.wallets.set(wallet.id, wallet);
        this.versions.set(wallet.id, Number(row.version));
      }
    } catch (err) {
      this.logger.error(`wallet hydrate failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  create(
    subjectType: Wallet['subjectType'],
    subjectId: string,
    controls: SpendControls = {},
  ): Wallet {
    const wallet: Wallet = {
      id: `wal_${randomUUID().slice(0, 8)}`,
      subjectType,
      subjectId,
      grants: [],
      controls,
      spentToday: 0,
      spentThisMonth: 0,
    };
    this.wallets.set(wallet.id, wallet);
    // A brand-new wallet has no version to conflict with, and an empty
    // wallet that fails to save costs nothing — the next call recreates it.
    void this.persist(wallet).catch((err: unknown) =>
      this.logger.error(
        `wallet create persist failed for ${wallet.id}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return wallet;
  }

  async get(walletId: string): Promise<Wallet | undefined> {
    await this.hydrate(walletId);
    return this.wallets.get(walletId);
  }

  /** The subject's wallet, created on first use. */
  async forSubject(subjectType: Wallet['subjectType'], subjectId: string): Promise<Wallet> {
    await this.hydrateBySubject(subjectType, subjectId);
    const existing = [...this.wallets.values()].find(
      (w) => w.subjectType === subjectType && w.subjectId === subjectId,
    );
    return existing ?? this.create(subjectType, subjectId);
  }

  /**
   * An administrator-issued promotional allowance — how a pilot tester
   * gets ACU without a payment. Spent first (promotional precedence),
   * expires like any promotional grant, and the note lands on the grant
   * record so nobody wonders where the balance came from.
   */
  async promotionalGrant(walletId: string, acus: number, note = 'admin_grant', now = new Date()): Promise<AcuGrant | null> {
    return this.grantOn(walletId, 'promotional', Math.round(acus), now, note);
  }

  /**
   * A subscription allowance from a paid invoice — the webhook's grant.
   * The amount is the plan's published allowance, not a recalculation.
   */
  async depositAllowance(walletId: string, acus: number, sourceRef: string, now = new Date()): Promise<AcuGrant | null> {
    return this.grantOn(walletId, 'subscription', Math.round(acus), now, sourceRef);
  }

  /** Live balance across all unexpired grants. */
  async balance(walletId: string, now = new Date()): Promise<number> {
    const wallet = await this.get(walletId);
    if (!wallet) return 0;
    return wallet.grants
      .filter((g) => g.expiresAt > now && g.remaining > 0)
      .reduce((sum, g) => sum + g.remaining, 0);
  }

  /**
   * Monthly subscription deposit — 20% of the amount actually paid.
   * Rollover is capped at three allocations, so an unused wallet does
   * not accumulate an unbounded liability.
   */
  async depositSubscription(
    walletId: string,
    amountPaidGbp: number,
    now = new Date(),
  ): Promise<AcuGrant | null> {
    const allocation = monthlyAcuAllocation(amountPaidGbp);
    const cap = allocation * MAX_ROLLOVER_ALLOCATIONS;

    // The rollover check reads the balance, so it has to happen inside the
    // mutation rather than before it — checked outside, two concurrent
    // renewals both see room under the cap and both deposit.
    const result = await this.mutate(walletId, (wallet) => {
      const carried = wallet.grants
        .filter((g) => g.bucket === 'subscription' && g.expiresAt > now && g.remaining > 0)
        .reduce((sum, g) => sum + g.remaining, 0);

      if (carried >= cap) return null;
      return this.append(wallet, 'subscription', Math.min(allocation, cap - carried), now, 'monthly_subscription');
    });

    if (!result.ok) return null;
    if (result.value === null) {
      this.logger.log(`wallet ${walletId}: rollover cap reached (${cap} ACU) — deposit skipped`);
    }
    return result.value;
  }

  /**
   * Annual plans allocate from the discounted amount actually paid,
   * delivered in twelve monthly deposits so the year's allowance cannot
   * be consumed at once.
   */
  async depositAnnualMonth(walletId: string, annualAmountPaidGbp: number, now = new Date()) {
    return this.grantOn(
      walletId,
      'subscription',
      annualMonthlyDeposit(annualAmountPaidGbp),
      now,
      'annual_monthly_deposit',
    );
  }

  /**
   * A purchased top-up. Valid twelve months, spent after subscription ACUs.
   *
   * Throws below the minimum charge rather than taking the money — a
   * sub-£5 payment loses a disproportionate share to Stripe's fixed fee,
   * and the honest response is to refuse it rather than quietly absorb it.
   *
   * `reference` is the Stripe object that paid for it. It rides on the
   * grant's `sourceRef` so that a refund of that exact charge can find the
   * exact allowance it bought — without it, a refund can only guess which
   * of a member's top-ups to reverse.
   */
  async purchase(
    walletId: string,
    amountGbp: number,
    bonusAcus = 0,
    now = new Date(),
    reference?: string,
  ) {
    assertChargeable(amountGbp);
    const amount = Math.round(amountGbp * ACU_PER_GBP) + bonusAcus;
    const sourceRef = reference ? `topup_${amountGbp}gbp:${reference}` : `topup_${amountGbp}gbp`;
    return this.grantOn(walletId, 'purchased', amount, now, sourceRef);
  }

  /** Adds a grant to a wallet already held under a mutation. */
  private append(
    wallet: Wallet,
    bucket: WalletBucket,
    amount: number,
    now: Date,
    sourceRef: string,
  ): AcuGrant {
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + WALLET_VALIDITY_DAYS[bucket]);

    const grant: AcuGrant = {
      id: `grt_${randomUUID().slice(0, 8)}`,
      bucket,
      amount,
      remaining: amount,
      grantedAt: now,
      expiresAt,
      sourceRef,
    };
    wallet.grants.push(grant);
    return grant;
  }

  /** Grant against a wallet id, read fresh and written conditionally. */
  private async grantOn(
    walletId: string,
    bucket: WalletBucket,
    amount: number,
    now: Date,
    sourceRef: string,
  ): Promise<AcuGrant | null> {
    const result = await this.mutate(walletId, (wallet) =>
      this.append(wallet, bucket, amount, now, sourceRef),
    );
    if (!result.ok) {
      // A grant that cannot be written is a grant that did not happen.
      // Reporting it as issued is how a member is told they have allowance
      // they do not have.
      this.logger.error(`wallet ${walletId}: grant "${sourceRef}" not recorded (${result.reason})`);
      return null;
    }
    return result.value;
  }

  /**
   * The Cost Governor. Prices the action, checks the controls, then
   * draws down in bucket precedence order.
   *
   * A refusal is never an error state — non-AI features continue and the
   * message says so.
   */
  async spend(request: SpendRequest, now = new Date()): Promise<SpendResult> {
    const acusRequired = requiredAcus(request.cost);
    const customerChargeGbp = acusRequired / ACU_PER_GBP;

    // The profitability guard. This should be impossible via requiredAcus,
    // so a breach means the pricing path was bypassed. It depends on
    // nothing in the wallet, so it is settled before one is read.
    const direct =
      request.cost.providerCostGbp +
      (request.cost.infrastructureCostGbp ?? 0) +
      (request.cost.dataCostGbp ?? 0) +
      (request.cost.storageCostGbp ?? 0);

    if (breachesProtectionRule(customerChargeGbp, direct)) {
      this.logger.error(
        `PROTECTION BREACH: ${request.agentCode} charged £${customerChargeGbp} against ` +
          `£${direct} direct cost — below ${COST_PROTECTION_MULTIPLE}x. Action paused.`,
      );
      return {
        allowed: false,
        reason: 'requires_approval',
        acusRequired,
        balance: await this.balance(request.walletId, now),
        message: 'This action is being repriced. Nothing has been charged.',
      };
    }

    /*
     * Everything from here — reading the balance, checking the limits and
     * drawing down — happens against one freshly-read wallet and is saved
     * only if nothing else wrote in between.
     *
     * Splitting those steps is what made this lose money. The balance was
     * read, awaited on, checked, and only then written back over whatever
     * had happened meanwhile: two requests each saw the same balance, each
     * passed the same check, and the second save erased the first spend
     * while both provider calls had already been paid for.
     */
    type Draw =
      | { ok: true; drawnFrom: { bucket: WalletBucket; amount: number }[]; grants: { grantId: string; amount: number }[]; balanceBefore: number }
      | { ok: false; reason: Extract<SpendResult, { allowed: false }>['reason']; balance: number };

    const outcome = await this.mutate(request.walletId, (wallet): Draw => {
      const balance = wallet.grants
        .filter((g) => g.expiresAt > now && g.remaining > 0)
        .reduce((sum, g) => sum + g.remaining, 0);

      const controls = wallet.controls;
      if (controls.dailyLimit && wallet.spentToday + acusRequired > controls.dailyLimit) {
        return { ok: false, reason: 'daily_limit', balance };
      }
      if (controls.monthlyLimit && wallet.spentThisMonth + acusRequired > controls.monthlyLimit) {
        return { ok: false, reason: 'monthly_limit', balance };
      }
      const agentCap = controls.perAgentLimit?.[request.agentCode];
      if (agentCap !== undefined && acusRequired > agentCap) {
        return { ok: false, reason: 'agent_limit', balance };
      }
      if (controls.approvalThreshold !== undefined && acusRequired > controls.approvalThreshold) {
        return { ok: false, reason: 'requires_approval', balance };
      }
      if (balance < acusRequired) {
        // Hard stop. No debt, no partial execution, no provider call.
        return { ok: false, reason: 'insufficient_balance', balance };
      }

      // Draw down in precedence order: promotional, then subscription,
      // then purchased — so the shortest-lived allowance is used first.
      const drawnFrom: { bucket: WalletBucket; amount: number }[] = [];
      const grantLines: { grantId: string; amount: number }[] = [];
      let outstanding = acusRequired;

      for (const bucket of WALLET_PRECEDENCE) {
        if (outstanding === 0) break;
        const grants = wallet.grants
          .filter((g) => g.bucket === bucket && g.remaining > 0 && g.expiresAt > now)
          .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

        for (const grant of grants) {
          if (outstanding === 0) break;
          const take = Math.min(grant.remaining, outstanding);
          grant.remaining -= take;
          outstanding -= take;
          const entry = drawnFrom.find((d) => d.bucket === bucket);
          if (entry) entry.amount += take;
          else drawnFrom.push({ bucket, amount: take });
          grantLines.push({ grantId: grant.id, amount: take });
        }
      }

      wallet.spentToday += acusRequired;
      wallet.spentThisMonth += acusRequired;
      return { ok: true, drawnFrom, grants: grantLines, balanceBefore: balance };
    });

    if (!outcome.ok) {
      if (outcome.reason === 'missing') {
        return {
          allowed: false,
          reason: 'insufficient_balance',
          acusRequired,
          balance: 0,
          message: 'No wallet found for this subject.',
        };
      }
      return this.refuse(
        outcome.reason === 'not_recorded' ? 'not_recorded' : 'contended',
        acusRequired,
        0,
      );
    }

    if (!outcome.value.ok) {
      return this.refuse(outcome.value.reason, acusRequired, outcome.value.balance);
    }

    const draw = outcome.value;
    return {
      allowed: true,
      acusCharged: acusRequired,
      customerChargeGbp,
      balanceAfter: draw.balanceBefore - acusRequired,
      drawnFrom: draw.drawnFrom,
      grants: draw.grants,
    };
  }

  /**
   * Puts unspent ACUs back where they came from.
   *
   * The gateway holds an agent's ceiling before it calls a provider and
   * settles to the real figure afterwards, so most calls end with something
   * to give back. It has to go back to the *same grants* rather than into a
   * fresh one: crediting a promotional grant for a refund of purchased
   * allowance would silently convert money the member paid into an
   * allowance that expires, and they would never see it happen.
   *
   * Nothing here can create allowance. `remaining` is capped at the
   * grant's original `amount`, so a double refund is absorbed rather than
   * minting ACUs out of a bug.
   */
  async refund(
    walletId: string,
    grants: readonly { grantId: string; amount: number }[],
    now = new Date(),
  ): Promise<{ refunded: number }> {
    void now;
    const outcome = await this.mutate(walletId, (wallet) => {
      let refunded = 0;
      for (const line of grants) {
        if (line.amount <= 0) continue;
        const grant = wallet.grants.find((g) => g.id === line.grantId);
        if (!grant) continue;
        const room = grant.amount - grant.remaining;
        const give = Math.min(room, line.amount);
        if (give <= 0) continue;
        grant.remaining += give;
        refunded += give;
      }

      // The daily and monthly counters move with it, or a held-and-released
      // ceiling would eat a member's own daily limit for spend that never
      // happened.
      wallet.spentToday = Math.max(0, wallet.spentToday - refunded);
      wallet.spentThisMonth = Math.max(0, wallet.spentThisMonth - refunded);
      return refunded;
    });

    return { refunded: outcome.ok ? outcome.value : 0 };
  }

  /**
   * Takes allowance back when the money that bought it goes back.
   *
   * The gap this closes: `charge.refunded` and `charge.dispute.created`
   * used to write a log line and nothing else, while `billing.ts` had
   * documented them for months as reversing the allowance. So the whole
   * sequence — top up £50, spend the 5,400 ACU, ask the card issuer for
   * the money back — returned the money and left the compute paid for by
   * this platform. It cost nothing to attempt and could be repeated.
   *
   * Three rules:
   *
   *  - **Reverse the specific grant where one can be identified.** The
   *    Stripe reference rides on `sourceRef`, so a refund of one charge
   *    does not eat allowance a different payment bought. Where it cannot
   *    be matched, recovery runs in reverse spend precedence — purchased
   *    first — so the member keeps the allowance they were given rather
   *    than the allowance they were refunded for.
   *  - **A wallet never goes negative.** Whatever was already spent is
   *    gone; it is reported as `shortfall`, not carried as a debt. Turning
   *    a refund into a negative balance would make the next honest member
   *    who used their allowance and then had a genuine billing problem
   *    unable to use the product they still pay for.
   *  - **Once per reference.** `wallet_adjustments` has a unique
   *    constraint on (kind, reference), so a redelivered webhook claws
   *    back nothing a second time even if the event table is ever lost.
   */
  async clawback(
    walletId: string,
    input: {
      kind: AdjustmentKind;
      /** The Stripe charge, dispute or payment intent that caused this. */
      reference: string;
      /** Money returned, in pounds. Recorded for reconciliation. */
      gbp: number;
      /** How much allowance to take back. */
      acus: number;
      /** Prefer grants whose sourceRef contains this. */
      matching?: string;
      note?: string;
    },
  ): Promise<ClawbackResult> {
    const target = Math.max(0, Math.round(input.acus));
    if (target === 0) return { clawedBack: 0, shortfall: 0, applied: false };

    // Claimed before the wallet moves. A refund applied twice would take
    // twice the allowance, which is the same class of error as granting
    // twice and is just as much somebody's money.
    if (!(await this.claimAdjustment(input.kind, input.reference))) {
      this.logger.log(
        `wallet ${walletId}: ${input.kind} ${input.reference} already applied — nothing repeated`,
      );
      return { clawedBack: 0, shortfall: 0, applied: false };
    }

    const outcome = await this.mutate(walletId, (wallet) => {
      let outstanding = target;
      let clawed = 0;

      // Matching grants first, then purchased, then subscription, then
      // promotional — the reverse of spend precedence, so what a member
      // was given survives longer than what they have just been repaid for.
      const ordered = [...wallet.grants].sort((a, b) => {
        const aMatch = input.matching && a.sourceRef?.includes(input.matching) ? 0 : 1;
        const bMatch = input.matching && b.sourceRef?.includes(input.matching) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        const order = (g: AcuGrant) => WALLET_PRECEDENCE.length - WALLET_PRECEDENCE.indexOf(g.bucket);
        return order(a) - order(b);
      });

      for (const grant of ordered) {
        if (outstanding === 0) break;
        const take = Math.min(grant.remaining, outstanding);
        if (take <= 0) continue;
        grant.remaining -= take;
        outstanding -= take;
        clawed += take;
      }

      return { clawed, shortfall: outstanding };
    });

    if (!outcome.ok) {
      // The claim is released so a retry of the same webhook can do the
      // work. Leaving it claimed would make an unrecoverable failure look
      // like a completed reversal.
      await this.releaseAdjustment(input.kind, input.reference);
      this.logger.error(
        `wallet ${walletId}: ${input.kind} ${input.reference} could not be applied (${outcome.reason})`,
      );
      return { clawedBack: 0, shortfall: target, applied: false };
    }

    const { clawed, shortfall } = outcome.value;
    await this.recordAdjustment(walletId, input, clawed, shortfall);

    if (shortfall > 0) {
      this.logger.warn(
        `wallet ${walletId}: ${input.kind} of £${input.gbp.toFixed(2)} recovered ${clawed} ACU, ` +
          `${shortfall} ACU had already been spent — that is the loss on this ${input.kind}`,
      );
    }

    return { clawedBack: clawed, shortfall, applied: true };
  }

  /** Reserves the reference. False when this reversal already ran. */
  private async claimAdjustment(kind: AdjustmentKind, reference: string): Promise<boolean> {
    if (!this.pool) return true;
    try {
      const result = await this.pool.query(
        `INSERT INTO wallet_adjustments (wallet_id, kind, reference, gbp, clawed_acus)
         VALUES ('pending', $1, $2, 0, 0)
         ON CONFLICT (kind, reference) DO NOTHING
         RETURNING id`,
        [kind, reference],
      );
      return result.rows.length > 0;
    } catch (err) {
      // A reversal that cannot be recorded must not proceed. Failing
      // closed here means a redelivery reverses once; failing open means
      // it could reverse repeatedly.
      this.logger.error(
        `adjustment claim failed for ${kind}:${reference} — ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private async releaseAdjustment(kind: AdjustmentKind, reference: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `DELETE FROM wallet_adjustments WHERE kind = $1 AND reference = $2 AND wallet_id = 'pending'`,
        [kind, reference],
      );
    } catch (err) {
      this.logger.error(
        `adjustment release failed for ${kind}:${reference} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async recordAdjustment(
    walletId: string,
    input: { kind: AdjustmentKind; reference: string; gbp: number; note?: string },
    clawed: number,
    shortfall: number,
  ): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `UPDATE wallet_adjustments
            SET wallet_id = $1, gbp = $2, clawed_acus = $3, shortfall_acus = $4, note = $5
          WHERE kind = $6 AND reference = $7`,
        [walletId, input.gbp, clawed, shortfall, input.note ?? null, input.kind, input.reference],
      );
    } catch (err) {
      this.logger.error(
        `adjustment record failed for ${input.kind}:${input.reference} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Releases any annual deposits that have fallen due for this account.
   *
   * An annual plan is paid once and delivered in twelve monthly deposits,
   * so eleven of them are owed later. There is no scheduler here, and the
   * platform already solves that shape twice — the free tier and the
   * editorial budget both top up on read, idempotent by reference. This is
   * the third instance of the same pattern rather than a fourth mechanism.
   *
   * The row is claimed before the grant is made, so two concurrent
   * requests on the morning a deposit falls due produce one deposit.
   */
  async releaseDueAnnualDeposits(userId: string, walletId: string, now = new Date()): Promise<number> {
    if (!this.pool) return 0;

    let released = 0;
    try {
      const due = await this.pool.query(
        `UPDATE annual_deposits
            SET granted_at = now()
          WHERE id IN (
            SELECT id FROM annual_deposits
             WHERE user_id = $1 AND granted_at IS NULL AND due_at <= $2
             ORDER BY due_at
             FOR UPDATE SKIP LOCKED
          )
        RETURNING invoice_id, month_index, acus`,
        [userId, now],
      );

      for (const row of due.rows) {
        const acus = Number(row.acus);
        const reference = `invoice_${String(row.invoice_id)}:m${String(row.month_index)}`;
        const grant = await this.grantOn(walletId, 'subscription', acus, now, reference);
        if (grant) {
          released += acus;
        } else {
          /*
           * The claim is given back. A deposit marked granted that was
           * never granted is a member quietly short of what they paid
           * for, and nothing downstream would ever notice.
           */
          await this.pool.query(
            `UPDATE annual_deposits SET granted_at = NULL
              WHERE invoice_id = $1 AND month_index = $2`,
            [row.invoice_id, row.month_index],
          );
          this.logger.error(`annual deposit ${reference} could not be granted; claim released`);
        }
      }
    } catch (err) {
      this.logger.error(
        `annual deposit release failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return released;
  }

  /**
   * The grant a Stripe object paid for, if this wallet holds one.
   *
   * A reversal has to know how much allowance the money it is returning
   * actually bought. Deriving it from the amount would be a second copy of
   * the pricing rules and would drift from the first one; reading it off
   * the grant that the payment created cannot.
   */
  async referencedGrant(walletId: string, reference: string): Promise<AcuGrant | null> {
    const wallet = await this.get(walletId);
    if (!wallet || !reference) return null;
    return wallet.grants.find((g) => g.sourceRef?.includes(reference)) ?? null;
  }

  /**
   * Records compute that was delivered and could not be charged.
   *
   * The counterpart to a refund shortfall, and the same kind of number:
   * money the platform spent and did not recover. It creates no debt and
   * the member is never chased for it — it exists so the total is
   * countable, because a loss nobody adds up is a loss nobody fixes.
   */
  async recordUnbilled(
    walletId: string,
    input: { reference: string; acus: number; note?: string },
  ): Promise<void> {
    const acus = Math.max(0, Math.round(input.acus));
    if (acus === 0 || !this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO wallet_adjustments (wallet_id, kind, reference, gbp, clawed_acus, shortfall_acus, note)
         VALUES ($1, 'correction', $2, 0, 0, $3, $4)
         ON CONFLICT (kind, reference) DO NOTHING`,
        [walletId, input.reference, acus, input.note ?? null],
      );
    } catch (err) {
      this.logger.error(
        `unbilled record failed for ${input.reference}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Every reversal against a wallet, newest first. For the account page. */
  async adjustments(walletId: string, limit = 20) {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `SELECT kind, reference, gbp, clawed_acus, shortfall_acus, note, created_at
         FROM wallet_adjustments
        WHERE wallet_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [walletId, limit],
    );
    return result.rows;
  }

  private refuse(
    reason: Extract<SpendResult, { allowed: false }>['reason'],
    acusRequired: number,
    balance: number,
  ): SpendResult {
    const messages: Record<typeof reason, string> = {
      insufficient_balance:
        'You are out of ACUs for now. Movement reminders, your plan and your history all keep working — only new AI analysis is paused.',
      daily_limit: 'You have reached the daily AI limit you set. It resets tomorrow.',
      monthly_limit: 'You have reached the monthly AI limit you set.',
      agent_limit: 'This action costs more than the per-feature limit you set.',
      requires_approval: 'This action needs approval before it runs.',
      /*
       * Both of these refuse rather than guess, and both are deliberately
       * plain: the member did nothing wrong and nothing has been charged.
       */
      contended: 'Another request was using your balance. Nothing was charged — please try again.',
      not_recorded:
        'We could not record this against your balance, so we have not run it and you have not been charged. Please try again shortly.',
    };
    return { allowed: false, reason, acusRequired, balance, message: messages[reason] };
  }

  /** Whether an auto top-up should fire. Returns the amount, or null. */
  /**
   * The amount an automatic top-up would charge, or null if none is due.
   *
   * A configured amount below the minimum charge is raised to the minimum
   * rather than declined — the person asked for this to happen without
   * their involvement, so silently failing at 3am is the wrong behaviour.
   * A manual purchase throws instead, because somebody is there to read it.
   */
  async autoTopUpDue(walletId: string, now = new Date()): Promise<number | null> {
    const wallet = await this.get(walletId);
    if (!wallet?.autoTopUp?.enabled) return null;
    if ((await this.balance(walletId, now)) >= wallet.autoTopUp.belowAcus) return null;
    return Math.max(MIN_TRANSACTION_GBP, wallet.autoTopUp.amountGbp);
  }

  /**
   * Expire stale grants. Run on a schedule.
   *
   * Every read already filters on `expiresAt`, so this changes no
   * balance — it is housekeeping, and it now writes what it does. It used
   * to zero `remaining` in memory only, which meant the next instance to
   * read the row saw the unswept copy and the sweep's own count was
   * whatever that instance happened to be holding.
   */
  async sweepExpired(now = new Date()): Promise<number> {
    let expired = 0;
    for (const walletId of [...this.wallets.keys()]) {
      const outcome = await this.mutate(walletId, (wallet) => {
        let freed = 0;
        for (const grant of wallet.grants) {
          if (grant.expiresAt <= now && grant.remaining > 0) {
            freed += grant.remaining;
            grant.remaining = 0;
          }
        }
        return freed;
      });
      if (outcome.ok) expired += outcome.value;
    }
    return expired;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
