/**
 * §16 — ACU structure, and Agent 19 (ACU Optimisation).
 *
 * The commercial invariant: £1 of direct provider cost must generate at
 * least £4 of customer revenue.
 */

/** £1 of customer value = 100 ACUs. */
export const ACU_PER_GBP = 100;

/** Every AI action must clear this multiple of its direct provider cost. */
export const COST_PROTECTION_MULTIPLE = 4;

/**
 * Actions that never consume ACUs. Deterministic arithmetic and chart
 * rendering are not AI work and must not be billed as if they were.
 */
export const ZERO_ACU_ACTIONS = [
  'bmi_calculation',
  'weight_entry',
  'waist_entry',
  'standard_charts',
  'saved_plan_viewing',
  'standard_reminders',
  'manual_habit_tracking',
  'cached_movement_playback',
] as const;
export type ZeroAcuAction = (typeof ZERO_ACU_ACTIONS)[number];

export interface AcuBand {
  action: string;
  min: number;
  max: number;
}

export const ACU_ACTIONS: readonly AcuBand[] = [
  { action: 'initial_assessment', min: 50, max: 120 },
  { action: 'seven_day_plan', min: 30, max: 80 },
  { action: 'daily_adaptive_command', min: 5, max: 15 },
  { action: 'foodlens_meal_analysis', min: 15, max: 80 },
  { action: 'behaviour_root_cause', min: 40, max: 120 },
  { action: 'plateau_investigation', min: 80, max: 200 },
  { action: 'trajectory_analysis_30d', min: 80, max: 220 },
  { action: 'travel_or_event_plan', min: 20, max: 60 },
  { action: 'restart_plan', min: 20, max: 60 },
  { action: 'professional_summary', min: 100, max: 300 },
];

export interface CostInput {
  providerCostGbp: number;
  infrastructureCostGbp?: number;
  dataCostGbp?: number;
  storageCostGbp?: number;
  /** Extra margin for actions whose provider cost is unpredictable. 0–0.2. */
  contingency?: number;
}

/**
 * The Cost Governor. Every AI request passes through this before execution.
 * Always rounds up — never price an action below the protection floor.
 */
export function requiredAcus(input: CostInput): number {
  /*
   * Every component is floored at zero, and the reason is that each of
   * them is a number this function is handed rather than one it derives.
   * A negative infrastructure cost would subtract from the provider cost
   * and reduce the bill; a negative contingency would discount it
   * outright. Neither is a legitimate input and neither should be
   * expressible — the whole purpose of this function is that a call
   * cannot end up cheaper than four times what it costs to serve.
   */
  const part = (value: number | undefined): number =>
    Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

  const direct =
    part(input.providerCostGbp) +
    part(input.infrastructureCostGbp) +
    part(input.dataCostGbp) +
    part(input.storageCostGbp);

  // Contingency adds margin for unpredictable calls. It never removes it,
  // and it is capped so a caller cannot inflate a bill either.
  const contingency = Math.min(0.2, part(input.contingency));

  const withContingency = direct * (1 + contingency);
  return Math.ceil(withContingency * COST_PROTECTION_MULTIPLE * ACU_PER_GBP);
}

/** Monthly ACU allocation is 20% of the amount actually paid. */
export const SUBSCRIPTION_ACU_SHARE = 0.2;

export function monthlyAcuAllocation(amountPaidGbp: number): number {
  return Math.round(amountPaidGbp * SUBSCRIPTION_ACU_SHARE * ACU_PER_GBP);
}

/**
 * Annual plans allocate from the discounted amount actually paid, divided
 * into twelve monthly deposits so the year's allowance cannot be consumed
 * at once.
 */
export function annualMonthlyDeposit(annualAmountPaidGbp: number): number {
  return Math.floor(monthlyAcuAllocation(annualAmountPaidGbp) / 12);
}

/**
 * The mandatory profitability alert. Any action where customer revenue
 * divided by direct provider cost falls below 4 must be repriced, routed
 * to a cheaper model, cached, batched, restricted or paused.
 */
export function breachesProtectionRule(
  customerRevenueGbp: number,
  directProviderCostGbp: number,
): boolean {
  /*
   * A zero or missing cost is not a free call, it is an unpriced one.
   *
   * This used to return false — no cost, no breach, carry on — which made
   * "I could not work out what this costs" the cheapest possible answer.
   * Any caller that failed to compute a provider cost, or computed zero
   * from a provider that reported no usage, got an unmetered model call
   * and nothing anywhere recorded that it had happened.
   *
   * A genuinely costless action is one that reaches no provider, and
   * those never get here: the gateway returns early on a zero ceiling
   * before a wallet is even loaded.
   */
  if (!Number.isFinite(directProviderCostGbp) || directProviderCostGbp <= 0) return true;
  if (!Number.isFinite(customerRevenueGbp) || customerRevenueGbp <= 0) return true;
  return customerRevenueGbp / directProviderCostGbp < COST_PROTECTION_MULTIPLE;
}

/** Wallet precedence: subscription ACUs are spent before purchased. */
export const WALLET_PRECEDENCE = ['promotional', 'subscription', 'purchased'] as const;
export type WalletBucket = (typeof WALLET_PRECEDENCE)[number];

export const WALLET_VALIDITY_DAYS: Readonly<Record<WalletBucket, number>> = {
  promotional: 30,
  subscription: 90,
  purchased: 365,
};

/** Rollover is capped at three monthly allocations. */
export const MAX_ROLLOVER_ALLOCATIONS = 3;

/**
 * At zero balance, paid AI actions stop and non-AI features continue.
 * No provider request is executed without sufficient ACUs, and no debt
 * is ever created.
 */
export function canExecute(balanceAcus: number, costAcus: number): boolean {
  return balanceAcus >= costAcus;
}
