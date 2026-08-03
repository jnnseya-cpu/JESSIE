import { CONDITION_IDS, isConditionId, type ConditionId } from '@jessmove/shared';

/**
 * The only vocabulary this platform will store.
 *
 * Kept apart from the service so it can be tested directly, and because
 * it is the security boundary rather than a convenience: whatever arrives
 * from a client, only catalogue identifiers survive this function. A
 * field meant to hold `pancreatic_insufficiency` cannot be used to smuggle
 * a sentence about somebody's diagnosis into the database, because a
 * sentence is not in the catalogue and is dropped rather than rejected.
 *
 * The result is de-duplicated and in catalogue order, so the same set of
 * conditions always produces the same row — no spurious updates, and a
 * stored value that can be compared without sorting first.
 */
/**
 * How many one person can declare.
 *
 * Ten, because ten is more than almost anybody lives with and because a
 * page that tried to read twenty at once would contradict itself — one
 * condition saying eat more fibre while another says eat less is not
 * guidance, it is noise. Somebody genuinely juggling more than ten has
 * a team doing exactly this job, and they are better at it than a page.
 */
export const MAX_CONDITIONS = 10;

export function cleanConditions(values: readonly string[]): ConditionId[] {
  const chosen = new Set(values.filter(isConditionId));
  return CONDITION_IDS.filter((id) => chosen.has(id)).slice(0, MAX_CONDITIONS);
}
