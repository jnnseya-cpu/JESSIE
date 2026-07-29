import { Injectable, Logger } from '@nestjs/common';
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
    }
  | {
      allowed: false;
      reason:
        | 'insufficient_balance'
        | 'daily_limit'
        | 'monthly_limit'
        | 'agent_limit'
        | 'requires_approval';
      acusRequired: number;
      balance: number;
      /** What the user can still do. Non-AI features never stop. */
      message: string;
    };

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly wallets = new Map<string, Wallet>();

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
    return wallet;
  }

  get(walletId: string): Wallet | undefined {
    return this.wallets.get(walletId);
  }

  /** Live balance across all unexpired grants. */
  balance(walletId: string, now = new Date()): number {
    const wallet = this.wallets.get(walletId);
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
  depositSubscription(
    walletId: string,
    amountPaidGbp: number,
    now = new Date(),
  ): AcuGrant | null {
    const wallet = this.wallets.get(walletId);
    if (!wallet) return null;

    const allocation = monthlyAcuAllocation(amountPaidGbp);

    const carried = wallet.grants
      .filter((g) => g.bucket === 'subscription' && g.expiresAt > now && g.remaining > 0)
      .reduce((sum, g) => sum + g.remaining, 0);

    const cap = allocation * MAX_ROLLOVER_ALLOCATIONS;
    if (carried >= cap) {
      this.logger.log(
        `wallet ${walletId}: rollover cap reached (${carried}/${cap} ACU) — deposit skipped`,
      );
      return null;
    }

    const amount = Math.min(allocation, cap - carried);
    return this.grant(wallet, 'subscription', amount, now, 'monthly_subscription');
  }

  /**
   * Annual plans allocate from the discounted amount actually paid,
   * delivered in twelve monthly deposits so the year's allowance cannot
   * be consumed at once.
   */
  depositAnnualMonth(walletId: string, annualAmountPaidGbp: number, now = new Date()) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) return null;
    return this.grant(
      wallet,
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
   */
  purchase(walletId: string, amountGbp: number, bonusAcus = 0, now = new Date()) {
    assertChargeable(amountGbp);
    const wallet = this.wallets.get(walletId);
    if (!wallet) return null;
    const amount = Math.round(amountGbp * ACU_PER_GBP) + bonusAcus;
    return this.grant(wallet, 'purchased', amount, now, `topup_${amountGbp}gbp`);
  }

  private grant(
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

  /**
   * The Cost Governor. Prices the action, checks the controls, then
   * draws down in bucket precedence order.
   *
   * A refusal is never an error state — non-AI features continue and the
   * message says so.
   */
  spend(request: SpendRequest, now = new Date()): SpendResult {
    const wallet = this.wallets.get(request.walletId);
    const acusRequired = requiredAcus(request.cost);
    const customerChargeGbp = acusRequired / ACU_PER_GBP;

    if (!wallet) {
      return {
        allowed: false,
        reason: 'insufficient_balance',
        acusRequired,
        balance: 0,
        message: 'No wallet found for this subject.',
      };
    }

    const balance = this.balance(request.walletId, now);

    // The profitability guard. This should be impossible via requiredAcus,
    // so a breach means the pricing path was bypassed.
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
        balance,
        message: 'This action is being repriced. Nothing has been charged.',
      };
    }

    const controls = wallet.controls;

    if (controls.dailyLimit && wallet.spentToday + acusRequired > controls.dailyLimit) {
      return this.refuse('daily_limit', acusRequired, balance);
    }
    if (controls.monthlyLimit && wallet.spentThisMonth + acusRequired > controls.monthlyLimit) {
      return this.refuse('monthly_limit', acusRequired, balance);
    }
    const agentCap = controls.perAgentLimit?.[request.agentCode];
    if (agentCap !== undefined && acusRequired > agentCap) {
      return this.refuse('agent_limit', acusRequired, balance);
    }
    if (controls.approvalThreshold !== undefined && acusRequired > controls.approvalThreshold) {
      return this.refuse('requires_approval', acusRequired, balance);
    }

    if (balance < acusRequired) {
      // Hard stop. No debt, no partial execution, no provider call.
      return this.refuse('insufficient_balance', acusRequired, balance);
    }

    // Draw down in precedence order: promotional, then subscription,
    // then purchased — so the shortest-lived allowance is used first.
    const drawnFrom: { bucket: WalletBucket; amount: number }[] = [];
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
      }
    }

    wallet.spentToday += acusRequired;
    wallet.spentThisMonth += acusRequired;

    return {
      allowed: true,
      acusCharged: acusRequired,
      customerChargeGbp,
      balanceAfter: balance - acusRequired,
      drawnFrom,
    };
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
  autoTopUpDue(walletId: string, now = new Date()): number | null {
    const wallet = this.wallets.get(walletId);
    if (!wallet?.autoTopUp?.enabled) return null;
    if (this.balance(walletId, now) >= wallet.autoTopUp.belowAcus) return null;
    return Math.max(MIN_TRANSACTION_GBP, wallet.autoTopUp.amountGbp);
  }

  /** Expire stale grants. Run on a schedule. */
  sweepExpired(now = new Date()): number {
    let expired = 0;
    for (const wallet of this.wallets.values()) {
      for (const grant of wallet.grants) {
        if (grant.expiresAt <= now && grant.remaining > 0) {
          expired += grant.remaining;
          grant.remaining = 0;
        }
      }
    }
    return expired;
  }
}
