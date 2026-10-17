import type { EnergyBand } from './energy';

/**
 * A programme with a timeframe, measured in things a person did.
 *
 * Asked for as a countdown to a weight. That shape is on
 * `PROHIBITED_MECHANICS` twice over — `calorie_minimisation_game` and
 * `punishment_for_missed_days` — and for a reason that is not
 * bureaucratic: a deadline attached to a number on a scale creates
 * pressure in exactly one direction, and the direction is downwards,
 * towards the floor the rest of this module exists to defend. Somebody
 * three days from a deadline and two kilograms away does not eat more.
 *
 * So the timeframe is real and the targets are behaviours. Days with
 * food recorded, days moved, days finishing inside the band. Every one
 * of them is a thing the member can do today and that the ledger can
 * verify, and none of them can be achieved faster by eating less.
 *
 * The weight outcome is still shown, because pretending people do not
 * care about it would be its own dishonesty. It is shown as a range, as
 * a consequence of the behaviours rather than a target set against them,
 * and it carries the condition that produced it.
 */

/** Weeks a programme may run for. Shorter is not serious; longer is not a plan. */
export const PROGRAMME_WEEKS = [8, 12, 16] as const;
export type ProgrammeWeeks = (typeof PROGRAMME_WEEKS)[number];

/**
 * Targets per week. Deliberately not seven of anything.
 *
 * A target of seven days out of seven has one failure mode and it
 * arrives on the first bad day. Five of seven survives a weekend, an
 * illness and a holiday, which is what the next three months will
 * actually contain.
 */
export const WEEKLY_TARGETS = {
  daysScanned: 5,
  daysMoved: 5,
  daysInBand: 4,
} as const;

export interface Programme {
  weeks: ProgrammeWeeks;
  /** What has to happen, per week. Never a weight. */
  weekly: typeof WEEKLY_TARGETS;
  /** Totals across the whole run. */
  total: { daysScanned: number; daysMoved: number; daysInBand: number };
  /**
   * What the band's own rate implies over this many weeks, as a range.
   * A consequence, not a target, and never a promise.
   */
  impliedChangeKg: { slow: number; fast: number };
  reviewEvery: number;
  says: string;
}

export interface ProgrammeObserved {
  daysScanned: number;
  daysMoved: number;
  daysInBand: number;
  weeksElapsed: number;
}

export interface ProgrammeProgress {
  /** 0–1 per strand, and never reduced by a missed day. */
  scanned: number;
  moved: number;
  inBand: number;
  /** The lowest of the three, because a programme is not an average. */
  overall: number;
  onTrack: boolean;
  says: string;
}

const pct = (done: number, target: number) =>
  target <= 0 ? 1 : Math.min(1, Number((done / target).toFixed(3)));

/** The programme a band implies, over a chosen number of weeks. */
export function programmeFor(band: EnergyBand, weeks: ProgrammeWeeks): Programme {
  const total = {
    daysScanned: WEEKLY_TARGETS.daysScanned * weeks,
    daysMoved: WEEKLY_TARGETS.daysMoved * weeks,
    daysInBand: WEEKLY_TARGETS.daysInBand * weeks,
  };

  /*
   * The range comes from the band's own two ends, scaled by the share of
   * days actually expected to finish inside it. Promising the full rate
   * over sixteen weeks would be promising a perfect run, and nobody has
   * one.
   */
  const share = WEEKLY_TARGETS.daysInBand / 7;
  const slow = Number((band.impliedRateKgWeek.atCeiling * weeks * share).toFixed(1));
  const fast = Number((band.impliedRateKgWeek.atFloor * weeks * share).toFixed(1));

  return {
    weeks,
    weekly: WEEKLY_TARGETS,
    total,
    impliedChangeKg: { slow, fast },
    reviewEvery: band.reviewAfterDays,
    says:
      `${weeks} weeks, counted in days rather than kilograms: ${WEEKLY_TARGETS.daysScanned} days a week with food ` +
      `recorded, ${WEEKLY_TARGETS.daysMoved} with movement, ${WEEKLY_TARGETS.daysInBand} finishing inside the band. ` +
      `Five of seven, not seven of seven — the run has to survive a weekend and a bad week. ` +
      `If that pattern holds, the band implies somewhere around ${slow} to ${fast} kg over the ${weeks} weeks. ` +
      `That is a consequence of the days, not a target set against them, and there is no date by which it has to be true.`,
  };
}

/**
 * Where a run has got to.
 *
 * A missed day never removes progress already earned. `punishment_for_
 * missed_days` is on the prohibited list, and a counter that goes
 * backwards is a punishment whatever it is called.
 */
export function programmeProgress(
  programme: Programme,
  observed: ProgrammeObserved,
): ProgrammeProgress {
  const scanned = pct(observed.daysScanned, programme.total.daysScanned);
  const moved = pct(observed.daysMoved, programme.total.daysMoved);
  const inBand = pct(observed.daysInBand, programme.total.daysInBand);
  const overall = Math.min(scanned, moved, inBand);

  const expected = programme.weeks > 0 ? Math.min(1, observed.weeksElapsed / programme.weeks) : 0;
  // A tolerance, because being a few days behind in week three is not a
  // verdict on anything.
  const onTrack = overall >= expected - 0.15;

  const weakest =
    overall === scanned ? 'recording food' : overall === moved ? 'movement' : 'days inside the band';

  return {
    scanned,
    moved,
    inBand,
    overall,
    onTrack,
    says: onTrack
      ? `Week ${observed.weeksElapsed} of ${programme.weeks}, and the pattern is holding. Nothing here needs changing.`
      : `Week ${observed.weeksElapsed} of ${programme.weeks}. ${weakest} is the strand that has slipped, and it is the ` +
        `one worth picking up — the others are fine. Days already counted stay counted.`,
  };
}
