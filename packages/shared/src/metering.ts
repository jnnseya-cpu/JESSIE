/**
 * Who pays for an AI action when there is no member to charge.
 *
 * The rule this file exists to serve: **every AI action is metered and
 * gated against an available ACU balance, and there is no free path.**
 *
 * That rule is easy to state and has one awkward consequence — the two
 * places the platform genuinely calls a model with nobody signed in:
 *
 *  * the public trial, which is how most people decide to sign up at all;
 *  * the editorial agent, which drafts articles on a schedule.
 *
 * The tempting answer is "those are ours, so they are free". They are not
 * free; they are simply billed to us, and calling them free is what turns
 * a marketing budget into an unbounded provider invoice. A model call that
 * nothing counts is a cost nobody can see and nobody can cap.
 *
 * So both draw on a real wallet with a real balance, granted daily. When
 * the balance is gone the action stops, exactly as it would for a member —
 * the public trial says "the free trial has been used up today, sign up to
 * continue", and the editorial agent skips its run. Nothing is unbilled,
 * nothing is unbounded, and the daily figure is a number an operator sets
 * rather than a bill that arrives.
 */

/** Reserved payers. Anything starting `platform:` is billed to the platform. */
export const PLATFORM_PAYERS = {
  /** The public trial: FoodLens and the coach, without an account. */
  trial: 'platform:trial',
  /** The SEO agent and its autopilot. */
  editorial: 'platform:editorial',
} as const;

export type PlatformPayer = (typeof PLATFORM_PAYERS)[keyof typeof PLATFORM_PAYERS];

export const PLATFORM_PAYER_IDS = Object.values(PLATFORM_PAYERS) as PlatformPayer[];

export function isPlatformPayer(billTo: string): billTo is PlatformPayer {
  return (PLATFORM_PAYER_IDS as string[]).includes(billTo);
}

/**
 * The daily budget for each, in ACU.
 *
 * Deliberately modest. The trial figure is roughly a few hundred analyses a
 * day — enough that a real visitor is never turned away on an ordinary
 * morning, and small enough that somebody scripting it against us hits the
 * end of the day's budget rather than the end of our card.
 *
 * Overridable per deployment, because the right number depends on traffic
 * that does not exist yet and guessing it in code would be worse than
 * letting an operator set it.
 */
export const PLATFORM_DAILY_ACU: Readonly<Record<PlatformPayer, number>> = {
  'platform:trial': 2_000,
  'platform:editorial': 200,
};

export function platformDailyAcu(
  payer: PlatformPayer,
  env: Record<string, string | undefined> = {},
): number {
  const key =
    payer === PLATFORM_PAYERS.trial ? 'PLATFORM_TRIAL_DAILY_ACU' : 'PLATFORM_EDITORIAL_DAILY_ACU';
  const configured = Number(env[key]);
  return Number.isFinite(configured) && configured >= 0 ? configured : PLATFORM_DAILY_ACU[payer];
}

/**
 * What a visitor is told when the day's trial budget is gone.
 *
 * Not an error and not a fault of theirs. It says what happened, what is
 * still available, and the one thing that removes the limit — which is
 * signing up, where they get their own allowance and stop competing with
 * everybody else for the same pot.
 */
export const TRIAL_EXHAUSTED =
  'The free trial has been used up for today — it runs on a daily budget shared by everyone ' +
  'trying the platform, and today’s has gone. Everything that is not AI still works, and an ' +
  'account comes with its own allowance rather than a share of this one.';

/**
 * The line every metered surface can show, so the rule is visible rather
 * than merely enforced.
 */
export const METERING_RULE =
  'Every AI action on this platform is metered and runs only against an available ACU balance. ' +
  'There is no unbilled path: an action with nobody to charge does not run, and an empty balance ' +
  'pauses AI work rather than creating a debt. Nothing that is not AI is ever metered.';
