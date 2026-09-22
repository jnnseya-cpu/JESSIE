/**
 * Presenting the grants behind a balance.
 *
 * Separated from the controller because the controller is decorated and
 * decorators break the type-stripping test build — so this is where the
 * rule can actually be exercised rather than asserted about by reading
 * the file.
 */

/** The shape this needs from `AcuGrant`, and nothing more. */
export interface GrantLine {
  remaining: number;
  expiresAt: Date | string;
}

/**
 * Every grant worth showing, each marked with whether it still counts.
 *
 * `WalletService.balance` sums grants where `expiresAt > now` and
 * `remaining > 0`. The account page's breakdown used to filter on
 * `remaining > 0` alone, so an expired grant with ACU left on it was
 * listed looking exactly like a live one. A real account held one
 * expired 500 ACU staff grant and two live 50s: the headline said
 * 99.099 and the itemised list under it added up to 584. Of those two
 * numbers, the itemised one is the more believable, so the correct
 * balance looked like the bug.
 *
 * Dropping the expired rows would be wrong in the other direction. That
 * breakdown exists so a balance which *falls* has a visible reason, and
 * expiry is the most common reason it falls — remove the row and the
 * drop becomes unexplained, which is the complaint the panel was built
 * to answer.
 *
 * So the invariant is neither "hide them" nor "show them": every row a
 * member can add up is either counted in the balance or visibly marked
 * as not counted.
 */
export function withExpiry<T extends GrantLine>(
  grants: readonly T[],
  now: Date = new Date(),
): (T & { expired: boolean })[] {
  return grants
    .filter((g) => g.remaining > 0)
    .map((g) => ({ ...g, expired: new Date(g.expiresAt).getTime() <= now.getTime() }));
}

/**
 * What the balance should be, given the rows on screen.
 *
 * Exists so a test can assert the headline and the breakdown agree
 * without standing up a wallet: whatever is not marked expired must sum
 * to the number printed above it.
 */
export function countedTotal(
  lines: readonly { remaining: number; expired: boolean }[],
): number {
  return lines.filter((l) => !l.expired).reduce((sum, l) => sum + l.remaining, 0);
}
