import type { SWAP_CONSTRAINTS, Swap } from './twin';

/**
 * Making the ten swap constraints real.
 *
 * `SWAP_CONSTRAINTS` — culture, budget, local availability, allergies,
 * religion, cooking skill, family size, preparation time, preferred
 * foods, supermarket accessibility — has been rendered on the FoodLens
 * page since it was written and honoured by nothing. `simulateSwap`
 * takes five nutrient figures and no constraint at all, and no member
 * has ever been asked to declare one. That is a public claim with no
 * implementation behind it.
 *
 * The obvious objection to fixing it is that culturally appropriate food
 * suggestions need a food library with real cultural breadth, and this
 * repository has nothing of the kind. Building one is a serious piece of
 * work and inventing one would be worse than leaving the gap.
 *
 * But the swap ladder already solves most of it, by accident.
 *
 * ── Why the ladder is the answer ───────────────────────────────────
 *
 * The five levels are ordered by how much they disturb the meal. "Use
 * half the sauce" and "grill instead of deep-frying" do not change what
 * the dish *is*, so they cannot be culturally wrong — they are the same
 * advice in any cuisine on earth. "Choose a different meal" replaces the
 * dish, and replacing somebody's dish without knowing their food is
 * precisely where this goes wrong.
 *
 * So the rule is: the less a swap knows about a person, the less it is
 * allowed to move. With nothing declared, only the levels that modify
 * are offered, never the ones that replace. That is honest, it needs no
 * database, and it makes the page's claim true today rather than after a
 * project nobody has started.
 *
 * Allergies and religious restriction are different in kind — they are
 * absolute at every level, and a swap that violates one is not offered
 * at all rather than offered more cautiously.
 */

export type FoodConstraint = (typeof SWAP_CONSTRAINTS)[number];

export interface MemberFoodConstraints {
  /**
   * Declared by the member, never inferred.
   *
   * Guessing somebody's cuisine from their shopping is inferring
   * ethnicity, which is special-category data arrived at without asking.
   * An empty list means they have not said, and the system behaves
   * accordingly rather than filling it in.
   */
  declared: readonly FoodConstraint[];
  /**
   * Ingredient tags that must never appear in a suggestion. Allergens
   * and religious restriction both land here, because the engine's
   * obligation is identical: never suggest it.
   */
  excludes: readonly string[];
  /** A cuisine the member named. Required before a meal may be replaced. */
  cuisine?: string;
}

/**
 * Levels that only ever modify the dish in front of somebody.
 *
 * Safe without knowing anything about them, because none of them
 * replaces an ingredient or a meal — they reduce, re-cook, or add
 * alongside.
 */
export const CULTURE_NEUTRAL_LEVELS: readonly Swap['level'][] = [1, 2, 3];

/** Levels that rebuild or replace the dish, and need a declared cuisine. */
export const CULTURE_BEARING_LEVELS: readonly Swap['level'][] = [4, 5];

/** Which levels may be offered, given what the member has told us. */
export function permittedSwapLevels(
  constraints: MemberFoodConstraints,
): readonly Swap['level'][] {
  const named = typeof constraints.cuisine === 'string' && constraints.cuisine.trim().length > 0;
  return named
    ? [...CULTURE_NEUTRAL_LEVELS, ...CULTURE_BEARING_LEVELS]
    : CULTURE_NEUTRAL_LEVELS;
}

/** Whether one swap may be shown to this member. */
export function swapPermitted(swap: Swap, constraints: MemberFoodConstraints): boolean {
  // Absolute, at every level, whatever else is declared.
  const text = `${swap.action} ${swap.expectedEffect}`.toLowerCase();
  for (const banned of constraints.excludes) {
    const term = banned.trim().toLowerCase();
    if (term.length > 0 && text.includes(term)) return false;
  }
  return permittedSwapLevels(constraints).includes(swap.level);
}

export interface SwapSelection {
  offered: Swap[];
  /** Swaps withheld, and the single reason that covers them. */
  withheld: number;
  says: string;
}

/**
 * The swaps a member may be shown, and an honest line when there are
 * none.
 *
 * An engine with nothing compliant to say should say that. Offering the
 * nearest non-compliant suggestion instead is how a product ends up
 * recommending pork to somebody who does not eat it, and one of those
 * is enough to lose them permanently.
 */
export function selectSwaps(
  swaps: readonly Swap[],
  constraints: MemberFoodConstraints,
): SwapSelection {
  const offered = swaps.filter((s) => swapPermitted(s, constraints));
  const withheld = swaps.length - offered.length;
  const named = typeof constraints.cuisine === 'string' && constraints.cuisine.trim().length > 0;

  if (offered.length === 0) {
    return {
      offered,
      withheld,
      says:
        'Nothing here fits what you have told us about your food, so nothing is suggested. ' +
        'That is deliberate — a suggestion that ignores it would be worse than none.',
    };
  }

  return {
    offered,
    withheld,
    says: named
      ? `Suggestions kept inside ${constraints.cuisine}.` +
        (withheld > 0 ? ` ${withheld} withheld for not fitting.` : '')
      : 'Only changes to the dish in front of you — nothing that replaces it. ' +
        'Tell us what you cook and the fuller suggestions open up.',
  };
}
