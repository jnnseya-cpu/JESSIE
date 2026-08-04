/**
 * Who pays for an AI action, and the only free allowance that exists.
 *
 * Two rules, and the second one narrows the first:
 *
 *  1. **Every AI action is metered and gated against an available ACU
 *     balance.** An action with nobody to charge does not run. Charging
 *     after the fact is not metering.
 *  2. **The only free AI is fifty ACUs a month, for two months, on an
 *     account.** Nothing else is free, anywhere, for anyone.
 *
 * The second rule ended the anonymous trial that used to sit here. A
 * visitor with no account is not a free account, and giving them AI made
 * "only on a free account" untrue — so the public pages now demonstrate
 * the platform without calling a model, and the free allowance begins when
 * somebody signs up. That is a real cost: a proportion of people will not
 * sign up to find out. It is the cost the rule asks for.
 *
 * The one remaining platform payer is the editorial agent, which writes
 * the blog. That is not a free tier for a user — it is the platform buying
 * its own marketing, and it draws on a daily budget an operator sets so
 * that an agent looping on a bad prompt runs out of allowance rather than
 * out of our card.
 */

/* ------------------------------------------------------------------ *
 * The free tier
 * ------------------------------------------------------------------ */

/**
 * The only free AI allowance that exists anywhere on this platform.
 *
 * Fifty ACUs a month, for two months, on an account. Then it stops and
 * does not come back. There is no third month, no renewal, and nothing
 * outside an account — a visitor with no account gets no AI at all, which
 * is the direct consequence of "only on a free account" and is why the
 * anonymous trial that used to exist is gone.
 *
 * Two months rather than forever because a free tier that never ends is
 * not a trial, it is a product somebody else pays for. Two months is long
 * enough to find out whether the thing is useful across a real fortnight,
 * two shopping cycles and a bad week, which is the honest test.
 *
 * Fifty rather than a headline number because it has to mean something.
 * At the current ceilings that is roughly four photograph analyses and a
 * dozen coach exchanges a month, or a couple of dozen barcode scans —
 * enough to form a view, not enough to run on indefinitely.
 */
export const FREE_TIER = {
  acusPerMonth: 50,
  months: 2,
  /** How long each month's grant lasts before it expires unused. */
  validityDays: 31,
} as const;

/** Where a free grant comes from, so it can never be issued twice. */
export function freeGrantReference(userId: string, monthIndex: number): string {
  return `free:${userId}:m${monthIndex}`;
}

/**
 * Which free grants an account is owed right now.
 *
 * Pure, so the two-month cliff is testable without waiting two months.
 * Returns the month indices still to be issued — usually empty, exactly
 * once per month for the first two, and never again afterwards.
 *
 * Month boundaries are counted from the account's own creation instant
 * rather than from the calendar, so somebody who signs up on the 30th is
 * not handed their second month on the 1st.
 */
export function freeGrantsDue(
  createdAt: Date,
  now: Date,
  alreadyGranted: readonly string[],
  userId: string,
): number[] {
  const elapsedMs = now.getTime() - createdAt.getTime();
  if (elapsedMs < 0) return [];

  const monthMs = 30 * 24 * 3_600_000;
  // Month 0 is due immediately; month 1 after thirty days.
  const reached = Math.min(FREE_TIER.months - 1, Math.floor(elapsedMs / monthMs));

  const due: number[] = [];
  for (let month = 0; month <= reached; month += 1) {
    if (!alreadyGranted.includes(freeGrantReference(userId, month))) due.push(month);
  }
  return due;
}

/** What an account has left of its free tier, for the member to read. */
export interface FreeTierState {
  readonly monthsUsed: number;
  readonly monthsLeft: number;
  readonly exhausted: boolean;
  readonly says: string;
}

export function freeTierState(alreadyGranted: readonly string[], userId: string): FreeTierState {
  const used = Array.from({ length: FREE_TIER.months }, (_, m) =>
    alreadyGranted.includes(freeGrantReference(userId, m)),
  ).filter(Boolean).length;
  const left = Math.max(0, FREE_TIER.months - used);

  return {
    monthsUsed: used,
    monthsLeft: left,
    exhausted: left === 0,
    says:
      left === 0
        ? `Both free months have been used. The free allowance was ${FREE_TIER.acusPerMonth} ACUs a month for ${FREE_TIER.months} months and does not renew — AI features now need a plan or a top-up. Everything that is not AI carries on unchanged.`
        : left === FREE_TIER.months
          ? `Your first free month gives you ${FREE_TIER.acusPerMonth} ACUs. There is one more after it, and then the free allowance ends.`
          : `One free month left, ${FREE_TIER.acusPerMonth} ACUs. After that the free allowance ends and AI features need a plan or a top-up.`,
  };
}

/** Reserved payers. Anything starting `platform:` is billed to the platform. */
export const PLATFORM_PAYERS = {
  /** The SEO agent and its autopilot — the platform's own editorial cost. */
  editorial: 'platform:editorial',
} as const;

export type PlatformPayer = (typeof PLATFORM_PAYERS)[keyof typeof PLATFORM_PAYERS];

export const PLATFORM_PAYER_IDS = Object.values(PLATFORM_PAYERS) as PlatformPayer[];

export function isPlatformPayer(billTo: string): billTo is PlatformPayer {
  return (PLATFORM_PAYER_IDS as string[]).includes(billTo);
}

/**
 * The daily budget for the editorial agent, in ACU.
 *
 * Enough for a weekly commission and its one repair pass, with headroom.
 * Overridable per deployment, and zero is a valid answer — it stops the
 * agent without needing a deploy or a migration.
 */
export const PLATFORM_DAILY_ACU: Readonly<Record<PlatformPayer, number>> = {
  'platform:editorial': 200,
};

export function platformDailyAcu(
  payer: PlatformPayer,
  env: Record<string, string | undefined> = {},
): number {
  const configured = Number(env.PLATFORM_EDITORIAL_DAILY_ACU);
  return Number.isFinite(configured) && configured >= 0 ? configured : PLATFORM_DAILY_ACU[payer];
}

/**
 * What somebody with no account is told when they reach an AI feature.
 *
 * Not a fault and not an error. It states the rule, says what an account
 * gets, and is honest that it ends — a free tier described as free and
 * then withdrawn after two months without warning is the thing people
 * rightly resent, and saying so up front costs nothing.
 */
export const NO_ACCOUNT_NO_AI =
  `AI features need an account. A new one comes with ${FREE_TIER.acusPerMonth} ACUs a month for ` +
  `${FREE_TIER.months} months — that is the whole free allowance, it does not renew, and after ` +
  'it you would need a plan or a top-up. Everything on this page that is not AI works without an ' +
  'account and always will.';

/**
 * The line every metered surface can show, so the rule is visible rather
 * than merely enforced.
 */
export const METERING_RULE =
  'Every AI action on this platform is metered and runs only against an available ACU balance. ' +
  'There is no unbilled path: an action with nobody to charge does not run, and an empty balance ' +
  `pauses AI work rather than creating a debt. The only free AI is ${FREE_TIER.acusPerMonth} ACUs ` +
  `a month for ${FREE_TIER.months} months on a new account, which does not renew. Nothing that ` +
  'is not AI is ever metered.';
