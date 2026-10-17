import { BODY_COMPOSITION_MIN_AGE, HEALTHY_BMI } from '@jessmove/shared';
import type { BodyPathway } from './pathways';
import { TRAJECTORY_REVIEW_DAYS } from './assessment';

/**
 * A daily energy band, derived from what a member actually recorded.
 *
 * Every standard equation — Mifflin-St Jeor, Harris-Benedict, Katch-McArdle
 * — needs biological sex, and this platform stores it nowhere. That is not
 * an oversight to work around: it means a population estimate of an
 * individual's requirement cannot be produced from data we hold, and
 * inventing one would be a fabricated number on a health surface.
 *
 * So the band is anchored on the member's own observed intake from the
 * food ledger instead. That is better than an equation anyway — it is a
 * measurement of this person rather than a prediction about a population
 * they may not resemble — and it needs no new personal data.
 *
 * ── The floor is the point ─────────────────────────────────────────────
 *
 * This was asked for as "a maximum". A maximum alone is the harmful
 * design. Nobody is hurt by the ceiling; people are hurt when the target
 * sits too low, or when they eat far under it and the product says
 * nothing because it was only ever watching the top. So the band carries
 * both numbers and the floor is the one the system defends.
 *
 * Without sex, the floor takes the more protective of the two
 * conventional minima rather than the mean. Applying a woman's minimum to
 * somebody who needs a man's is the error that starves people; the
 * reverse merely slows them down.
 *
 * ── What this is not ───────────────────────────────────────────────────
 *
 * It is not a prescription, it is not personalised nutrition advice, and
 * it is not a goal weight. The product's own position is that BMI is
 * unreliable in individuals and waist trend is the better signal, so a
 * destination weight is deliberately absent: the band governs a rate, and
 * the rate is reviewed against what actually happened.
 */

/**
 * The lowest daily intake this system will ever name.
 *
 * Conventional supervised minima are about 1200 kcal for women and 1500
 * for men. With sex unknown, the higher figure is the only safe choice —
 * see the note above.
 */
export const ENERGY_FLOOR_KCAL = 1500;

/** Energy in a kilogram of body tissue. The usual working figure. */
export const KCAL_PER_KG = 7700;

/** The slow and fast ends of a sustainable rate, in kg per week. */
export const RATE_RANGE_KG_WEEK = { slow: 0.25, fast: 0.5 } as const;

/**
 * The hard rate ceiling, as a share of body weight per week.
 *
 * Matches the caution already in `warningsFor`, so the band cannot
 * propose a rate the trend reader would immediately warn about.
 */
export const MAX_RATE_FRACTION = 0.01;

/** Days with food actually scanned, below which there is nothing to anchor on. */
export const MIN_RECORDED_DAYS = 7;

/** Pathways a deliberate deficit may be offered on at all. */
const REDUCING_PATHWAYS: readonly BodyPathway[] = ['REDUCE', 'WAIST', 'RECOMPOSITION'];

export type EnergyRefusal =
  | 'under_18'
  | 'not_opted_in'
  | 'pathway_not_reducing'
  | 'reduction_not_permitted'
  | 'condition_needs_clinician'
  | 'bmi_below_healthy_range'
  | 'not_enough_record'
  | 'record_may_be_incomplete'
  | 'already_at_safe_minimum';

export interface EnergyBandInput {
  age: number;
  /** Adults only, and only ones who asked for this surface. C6. */
  optedIntoBodyMetrics: boolean;
  pathway: BodyPathway;
  /** From `assessSafety`. The guardian can only narrow. */
  reductionPermitted: boolean;
  /** Any declared condition carrying `deficitNeedsClinician`. */
  conditionsNeedingClinician: readonly string[];
  /** Whether a clinician has agreed to a deficit for those conditions. */
  clinicianAgreed?: boolean;
  weightKg: number;
  bmi: number | null;
  /**
   * Mean kcal per day on which food was actually scanned.
   *
   * Per *recorded* day, and emphatically not per `daysCovered`. The
   * ledger derives coverage as `max(daysRecorded, totalKcal / 2000)`, so
   * dividing by it returns exactly the reference intake for anybody who
   * scans more than 2000 kcal a day — an identity, not an estimate. A
   * live run against real Postgres produced 2000 on the nose for a
   * member recorded at 2600, which would have given every heavier eater
   * in the product the same band.
   */
  observedKcalPerDay: number | null;
  /** Days on which anything at all was scanned. */
  recordedDays: number;
  /**
   * Whether the member says the log is substantially complete.
   *
   * Only they can know. The ledger's own words are "it is what you
   * scanned, not everything you ate", and a partial log understates
   * intake — which drags the band downwards, the one direction that
   * hurts. So an unconfirmed log is refused rather than guessed at.
   */
  logConfirmedComplete: boolean;
}

export interface EnergyBand {
  eligible: true;
  /** The least this system will ever suggest eating. Defended. */
  floorKcal: number;
  /** The most, if the trend is to move at all. */
  ceilingKcal: number;
  /** What the member was actually recorded eating. The anchor. */
  observedKcalPerDay: number;
  /** Implied rate at each end, kg per week. */
  impliedRateKgWeek: { atCeiling: number; atFloor: number };
  reviewAfterDays: number;
  /** How much record this rests on. Fewer days, less confidence. */
  recordedDays: number;
  says: string;
}

export interface EnergyNotOffered {
  eligible: false;
  reason: EnergyRefusal;
  says: string;
}

const REFUSALS: Record<EnergyRefusal, string> = {
  under_18:
    'Energy targets are not set for anyone under 18, and no setting changes that. Growth, routine and confidence are the frame at this age.',
  not_opted_in:
    'This surface is off until it is asked for. Nothing about intake is shown by default.',
  pathway_not_reducing:
    'The current pathway is not a reducing one, so no deficit is proposed. Changing pathway is a conversation, not a toggle.',
  reduction_not_permitted:
    'A safety check is holding reduction. Movement, food variety and sleep carry on unchanged.',
  condition_needs_clinician:
    'A declared condition means a deliberate deficit should be agreed with a clinician first. Take this to the person who knows about it, and it can be switched on afterwards.',
  bmi_below_healthy_range:
    'This platform will not run a reduction plan at this reading. Speaking to a GP or a dietitian is the right next step.',
  not_enough_record:
    'There is not enough recorded food yet to anchor on. A week of scans gives something real to work from, rather than a figure guessed from a population.',
  record_may_be_incomplete:
    'This rests on the food log being most of what was eaten, and only you can say whether it is. Confirm it, or keep scanning for a while — a partial log reads as a smaller appetite than the real one, and would pull the numbers too low.',
  already_at_safe_minimum:
    'Recorded intake is already at or near the lowest this system will name, so there is no deficit to propose. Maintenance, movement and food quality are the useful levers from here.',
};

const no = (reason: EnergyRefusal): EnergyNotOffered => ({
  eligible: false,
  reason,
  says: REFUSALS[reason],
});

/** kcal/day that produces a given kg/week rate. */
const deficitFor = (kgPerWeek: number) => Math.round((kgPerWeek * KCAL_PER_KG) / 7);

/**
 * The band, or a reason there is not one.
 *
 * Gates run before any arithmetic, in the order that matters: age first,
 * because C6 is absolute and no other input can unlock it.
 */
export function energyBand(input: EnergyBandInput): EnergyBand | EnergyNotOffered {
  if (input.age < BODY_COMPOSITION_MIN_AGE) return no('under_18');
  if (!input.optedIntoBodyMetrics) return no('not_opted_in');
  if (!REDUCING_PATHWAYS.includes(input.pathway)) return no('pathway_not_reducing');
  if (!input.reductionPermitted) return no('reduction_not_permitted');
  if (input.conditionsNeedingClinician.length > 0 && input.clinicianAgreed !== true) {
    return no('condition_needs_clinician');
  }
  // Mirrors the `stop` in `warningsFor`, so the two cannot disagree.
  if (input.bmi !== null && input.bmi < HEALTHY_BMI.min) return no('bmi_below_healthy_range');
  if (input.observedKcalPerDay === null || input.recordedDays < MIN_RECORDED_DAYS) {
    return no('not_enough_record');
  }
  if (!input.logConfirmedComplete) return no('record_may_be_incomplete');

  const observed = Math.round(input.observedKcalPerDay);

  /*
   * The fast end is whichever is gentler: half a kilogram a week, or one
   * per cent of body weight. For a lighter person the percentage binds
   * first, which is the direction that protects them.
   */
  const fastKg = Math.min(RATE_RANGE_KG_WEEK.fast, input.weightKg * MAX_RATE_FRACTION);
  const slowKg = Math.min(RATE_RANGE_KG_WEEK.slow, fastKg);

  const ceiling = observed - deficitFor(slowKg);
  const floor = Math.max(ENERGY_FLOOR_KCAL, observed - deficitFor(fastKg));

  /*
   * The case that matters most. If the ceiling has fallen below the floor,
   * this member is already eating at or under the least we will name, and
   * the honest answer is that there is no deficit to offer — not a smaller
   * one. This is `switch_to_maintenance` arriving as arithmetic rather
   * than as a judgement call.
   */
  if (ceiling <= floor) return no('already_at_safe_minimum');

  const rateAt = (kcal: number) => Number((((observed - kcal) * 7) / KCAL_PER_KG).toFixed(2));

  return {
    eligible: true,
    floorKcal: floor,
    ceilingKcal: ceiling,
    observedKcalPerDay: observed,
    impliedRateKgWeek: { atCeiling: rateAt(ceiling), atFloor: rateAt(floor) },
    reviewAfterDays: TRAJECTORY_REVIEW_DAYS,
    recordedDays: input.recordedDays,
    says:
      `Built from ${input.recordedDays} days of your own recorded food, averaging ${observed} kcal a day — ` +
      `not from an equation about people in general. ${floor} to ${ceiling} kcal keeps the change gradual. ` +
      `${floor} is a floor, not a target: eating under it is the thing to tell us about, not the thing to aim for. ` +
      `Reviewed against what actually happens after ${TRAJECTORY_REVIEW_DAYS} days.`,
  };
}
