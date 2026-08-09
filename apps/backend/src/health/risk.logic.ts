/**
 * What everything this platform knows, taken together, is allowed to say.
 *
 * FoodLens knows what was scanned. BodyCommand knows the readings a person
 * gave it. Activity knows which days had movement in them. Separately each
 * is a number on a screen; together they are the only picture anybody
 * actually has of their own risk — so this module builds it, and is
 * extremely careful about how it speaks.
 *
 * The rules, which are not negotiable and are not confidence thresholds:
 *
 *  1. **Nothing here is a diagnosis.** Every statement is about a
 *     *population-level association* between a modifiable habit and a
 *     condition. "Associated with", never "you have" and never "you will
 *     get".
 *  2. **Every warning names the lever.** A risk with no action attached is
 *     just fear, and fear is not a health intervention.
 *  3. **Under 18, none of this exists.** No conditions, no BMI target, no
 *     energy. A child is given growth and movement, and that is all.
 *  4. **BMI is one signal.** It cannot tell muscle from fat, it reads
 *     differently across ethnic groups, and it says nothing about one
 *     person's health on its own. Where it is used, it says so.
 *  5. **Anything clinical goes to a clinician.** This module's most
 *     important output, in several cases, is "see a GP".
 *
 * The associations used are the ones in mainstream UK public-health
 * guidance — high salt and blood pressure, saturated fat and LDL
 * cholesterol, free sugars and dental and weight outcomes, excess weight
 * and type 2 diabetes, inactivity and cardiovascular disease. Nothing here
 * is novel and nothing here is invented.
 *
 * ---------------------------------------------------------------------
 * A sixth rule, added once conditions arrived: **general guidance stops
 * where a condition starts.** Everything above is written for a general
 * adult population, and for some people it is wrong. Telling somebody
 * with pancreatic insufficiency to watch their fat, or cheering a falling
 * weight at somebody whose falling weight is the symptom, is not a
 * cautious reading of the data — it is the harmful one. So where a
 * declared condition changes what a figure means, the general reading is
 * suppressed rather than shown alongside, because two contradictory cards
 * on one screen leave the person to guess which applies to them.
 */

import {
  CONDITIONS,
  MEDICATION_NOT_ADVICE,
  NOT_MEDICAL_ADVICE,
  effectsOf,
  isMedicationContext,
  type ConditionCard,
  type ConditionEffects,
  type ConditionId,
} from '@jessmove/shared';

export const HEALTHY_BMI = { min: 18.5, max: 24.9 } as const;

/** UK adult reference intakes, per day — the same figures the labels use. */
export const DAILY_REFERENCE = {
  energyKcal: 2000,
  fatG: 70,
  saturatesG: 20,
  sugarsG: 90,
  saltG: 6,
} as const;

/** The Chief Medical Officers' adult guideline, in days per week. */
export const ACTIVE_DAYS_TARGET = 5;

export type RiskLevel = 'watch' | 'raised' | 'high';

export interface RiskFinding {
  /** What is driving it, in the member's own data. */
  factor: string;
  level: RiskLevel;
  /** The figure this was built from, stated so it can be checked. */
  evidence: string;
  /** Conditions this factor is associated with, at population level. */
  associatedWith: string[];
  /** The one thing that moves it. */
  action: string;
  /** Which module the figure came from. */
  from: 'foodlens' | 'bodycommand' | 'activity';
}

export interface BmiPath {
  bmi: number | null;
  band: 'under' | 'healthy' | 'over' | 'well_over' | null;
  /** The weight range that would put this height in the healthy band. */
  healthyRangeKg: { min: number; max: number } | null;
  /** How far from the nearest edge of that range. Negative means below it. */
  gapKg: number | null;
  /** At a sustainable rate, roughly how long that gap takes. */
  weeksAtSafeRate: number | null;
  safeRateKgPerWeek: number | null;
  says: string;
  steps: string[];
}

/**
 * A condition, read against what this person actually recorded.
 *
 * The card is the published guidance. `noticed` is the part that makes it
 * worth showing at all: the specific thing in their own ledger that the
 * guidance speaks to, or nothing when there is nothing to say yet.
 */
export interface ConditionFinding {
  id: ConditionId;
  label: string;
  group: ConditionCard['group'];
  inShort: string;
  watches: string[];
  helps: string[];
  careful: string[];
  clinicianOnly: string[];
  /** What was actually seen in this member's figures, if anything. */
  noticed: string[];
}

export interface HealthInsight {
  available: boolean;
  why?: string;
  risks: RiskFinding[];
  bmi: BmiPath;
  /** How the gap actually gets closed. */
  plan: GapPlan;
  /** The conditions declared, and what they change here. */
  conditions: ConditionFinding[];
  /** The general readings a declared condition has taken off the screen. */
  suppressed: string[];
  /** Present whenever a condition is in play. Shown verbatim. */
  notMedicalAdvice?: string;
  /** Present when a declared medication is in play. Also verbatim. */
  medicationNote?: string;
  /** What the picture was built from, so nobody mistakes it for complete. */
  builtFrom: string[];
  limits: string[];
  seeSomeone: string[];
}

export interface InsightInput {
  age: number;
  heightCm?: number | null;
  weightKg?: number | null;
  /** Daily averages from the food ledger, across the days actually recorded. */
  food?: {
    daysRecorded: number;
    /** Days of food those scans actually carry — see the ledger. */
    daysCovered: number;
    perDay: { saltG?: number; saturatesG?: number; sugarsG?: number; energyKcal?: number };
    topSalt?: string | null;
    topSaturates?: string | null;
    topSugars?: string | null;
    /** The biggest lines of energy in the ledger, largest first. */
    topEnergy?: { name: string; amount: number }[];
    /** The biggest lines of sugars, for spotting a drink. */
    topSugarItems?: { name: string; amount: number }[];
  } | null;
  /** From the activity dashboard. */
  activity?: { daysMoved: number; windowDays: number } | null;
  /** From BodyCommand's own trend, when there is one. */
  trend?: { kgPerWeek: number; direction: 'up' | 'down' | 'level' } | null;
  /**
   * What the member has told us they live with. Never inferred, never
   * guessed from a basket — only ever what they chose themselves.
   */
  conditions?: readonly ConditionId[] | null;
}

const round = (value: number, places = 1): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Everything the declared conditions change, combined. */
export function effectsFor(input: InsightInput): ConditionEffects {
  return effectsOf(declaredIn(input));
}

/** The declared conditions, filtered to ones the catalogue actually knows. */
function declaredIn(input: InsightInput): ConditionId[] {
  return (input.conditions ?? []).filter((id) => Boolean(CONDITIONS[id]));
}

/** The conditions that put a particular effect in play, named. */
function becauseOf(input: InsightInput, key: keyof ConditionEffects): string {
  const labels = declaredIn(input)
    .filter((id) => CONDITIONS[id].effects[key])
    .map((id) => CONDITIONS[id].label);
  return labels.join(' and ');
}

export function bmiFrom(heightCm?: number | null, weightKg?: number | null): number | null {
  if (!heightCm || !weightKg || heightCm < 50 || weightKg < 15) return null;
  const metres = heightCm / 100;
  return round(weightKg / (metres * metres), 1);
}

export function bandFor(bmi: number): BmiPath['band'] {
  if (bmi < HEALTHY_BMI.min) return 'under';
  if (bmi <= HEALTHY_BMI.max) return 'healthy';
  if (bmi < 30) return 'over';
  return 'well_over';
}

/**
 * The route to the healthy band, in that person's own kilograms and weeks.
 *
 * "Get to a green BMI" is only useful if it comes with a number and a
 * timescale, and only safe if the timescale is a sustainable one. Half a
 * kilo a week is the rate mainstream guidance gives; anything faster takes
 * muscle with it, which is the opposite of the goal.
 */
export function bmiPathFor(input: InsightInput): BmiPath {
  const bmi = bmiFrom(input.heightCm, input.weightKg);
  if (bmi === null || !input.heightCm) {
    return {
      bmi: null,
      band: null,
      healthyRangeKg: null,
      gapKg: null,
      weeksAtSafeRate: null,
      safeRateKgPerWeek: null,
      says: 'Give a height and a weight in BodyCommand and this fills in.',
      steps: [],
    };
  }

  const metres = input.heightCm / 100;
  const healthyRangeKg = {
    min: round(HEALTHY_BMI.min * metres * metres, 1),
    max: round(HEALTHY_BMI.max * metres * metres, 1),
  };
  const band = bandFor(bmi);
  const weight = input.weightKg as number;

  // Rule four, and the one that matters most. Where a condition makes a
  // falling weight a symptom to report rather than a result to be pleased
  // about, the whole reduction narrative comes off the screen — not
  // softened, not shown with a caveat underneath. The BMI itself is still
  // stated, because hiding a number somebody gave us would be its own kind
  // of dishonesty; what is withheld is the instruction to act on it.
  const effects = effectsFor(input);
  if (effects.weightLossIsAWarning && (band === 'over' || band === 'well_over' || band === 'under')) {
    const why = becauseOf(input, 'weightLossIsAWarning');
    return {
      bmi,
      band,
      healthyRangeKg,
      gapKg: null,
      weeksAtSafeRate: null,
      safeRateKgPerWeek: null,
      says:
        `Your BMI is ${bmi}. With ${why}, this platform does not turn that into a target to lose ` +
        'towards — weight coming down on its own is a thing to report to your team, not a result ' +
        'to chase, and general weight advice is written for people who do not have this.',
      steps: [
        'Weigh yourself on a regular day and keep the numbers. A trend over weeks is what your team can use; a single reading is not.',
        'If the weight is drifting down without you trying, tell them — that is one of the signs they watch for.',
        'Anything about a target weight belongs in that conversation, where your case is known.',
      ],
    };
  }

  let gapKg: number | null = null;
  if (band === 'over' || band === 'well_over') gapKg = round(weight - healthyRangeKg.max, 1);
  if (band === 'under') gapKg = round(weight - healthyRangeKg.min, 1);

  // Half a kilo a week, and never more than one percent of body weight.
  const safeRateKgPerWeek = Math.min(0.5, round(weight * 0.01, 2));
  const weeksAtSafeRate =
    gapKg === null || gapKg === 0 ? null : Math.ceil(Math.abs(gapKg) / safeRateKgPerWeek);

  const says =
    band === 'healthy'
      ? `A BMI of ${bmi} sits inside the healthy range. Staying between ${healthyRangeKg.min}kg and ${healthyRangeKg.max}kg keeps it there.`
      : band === 'under'
        ? `A BMI of ${bmi} is below the healthy range. This platform will not run a reduction plan, and gaining is what would help here.`
        : `A BMI of ${bmi} is above the healthy range. The top of the healthy range for your height is ${healthyRangeKg.max}kg — ${Math.abs(gapKg ?? 0)}kg from where you are, which is about ${weeksAtSafeRate} weeks at a sustainable ${safeRateKgPerWeek}kg a week.`;

  const steps =
    band === 'healthy'
      ? [
          'Nothing to chase. The work is keeping the habits that got you here.',
          `Weigh occasionally rather than daily — the range ${healthyRangeKg.min}–${healthyRangeKg.max}kg is the thing to stay inside, not a single number.`,
        ]
      : band === 'under'
        ? [
            'Speak to a GP or a dietitian before changing anything deliberately.',
            'Strength work protects and builds muscle, and is safe to start now.',
          ]
        : [
            `Aim for ${safeRateKgPerWeek}kg a week, not more. Faster loss takes muscle with it and comes back.`,
            'One food swap beats a whole new diet — the ledger below names the item carrying the most of whatever is out of step.',
            'Movement on most days protects the muscle you have while the weight comes off.',
            'Weigh weekly, at the same time of day. A daily scale measures water, not progress.',
          ];

  return { bmi, band, healthyRangeKg, gapKg, weeksAtSafeRate, safeRateKgPerWeek, says, steps };
}

/**
 * The warnings.
 *
 * Each one is built from a figure this platform actually holds, names the
 * conditions the factor is associated with, and ends with the single thing
 * that moves it.
 */
export function risksFor(input: InsightInput): RiskFinding[] {
  const risks: RiskFinding[] = [];
  const food = input.food;
  const effects = effectsFor(input);

  // Three days of food, not three days of scanning. A whole week's shop
  // goes into the basket in one trip, and that is still a week's evidence.
  if (food && food.daysCovered >= 3) {
    const salt = food.perDay.saltG ?? 0;
    // Where a condition makes salt matter more, the line moves down to it
    // rather than a general card being shown next to a stricter one.
    const saltLimit = effects.saltMattersMore ? DAILY_REFERENCE.saltG * 0.8 : DAILY_REFERENCE.saltG;
    if (salt > saltLimit) {
      const substituteWarning = effects.noSaltSubstitute
        ? ` Not a low-sodium salt substitute, though — with ${becauseOf(input, 'noSaltSubstitute')} those are usually potassium chloride and are the one swap to avoid.`
        : '';
      risks.push({
        factor: 'Salt',
        level: salt > saltLimit * 1.5 ? 'high' : 'raised',
        evidence: effects.saltMattersMore
          ? `${round(salt)}g a day across the ${food.daysCovered} days of food scanned. The general guideline is 6g; with ${becauseOf(input, 'saltMattersMore')} it is read against ${round(saltLimit)}g.`
          : `${round(salt)}g a day across the ${food.daysCovered} days of food scanned, against a 6g guideline.`,
        associatedWith: ['raised blood pressure', 'stroke', 'heart disease', 'kidney disease'],
        action:
          (food.topSalt
            ? `${food.topSalt} is carrying the most of it. Changing that one item moves the whole week.`
            : 'Most salt arrives in bread, sauces and processed meat rather than the salt cellar.') +
          substituteWarning,
        from: 'foodlens',
      });
    }

    const saturates = food.perDay.saturatesG ?? 0;
    // Not for everybody. Where enzyme replacement is what makes fat
    // digestible, the current guidance is not to restrict it, and a card
    // saying otherwise is the out-of-date advice that causes the weight
    // loss and the vitamin deficiency in the first place.
    if (!effects.doNotFlagFat && saturates > DAILY_REFERENCE.saturatesG) {
      risks.push({
        factor: 'Saturated fat',
        level: saturates > DAILY_REFERENCE.saturatesG * 1.5 ? 'high' : 'raised',
        evidence: `${round(saturates)}g a day across the ${food.daysCovered} days of food scanned, against a 20g guideline.`,
        associatedWith: ['raised LDL cholesterol', 'coronary heart disease', 'stroke'],
        action: food.topSaturates
          ? `${food.topSaturates} is carrying the most of it. Swapping to an unsaturated fat is the usual lever.`
          : 'Swapping butter, hard cheese and fatty meat for unsaturated fats is the usual lever.',
        from: 'foodlens',
      });
    }

    const sugars = food.perDay.sugarsG ?? 0;
    if (sugars > DAILY_REFERENCE.sugarsG) {
      risks.push({
        factor: 'Sugars',
        level: sugars > DAILY_REFERENCE.sugarsG * 1.5 ? 'high' : 'raised',
        evidence: `${round(sugars)}g a day across the ${food.daysCovered} days of food scanned, against a 90g guideline.`,
        associatedWith: ['tooth decay', 'weight gain', 'type 2 diabetes'],
        action: food.topSugars
          ? `${food.topSugars} is carrying the most of it. Sugary drinks are usually the quickest single change.`
          : 'Sugary drinks are usually the quickest single change.',
        from: 'foodlens',
      });
    }
  }

  const bmi = bmiFrom(input.heightCm, input.weightKg);
  if (bmi !== null && !effects.weightLossIsAWarning) {
    const band = bandFor(bmi);
    if (band === 'over' || band === 'well_over') {
      risks.push({
        factor: 'Weight',
        level: band === 'well_over' ? 'high' : 'raised',
        evidence: `A BMI of ${bmi}, above the 18.5–24.9 healthy range. BMI is one signal and cannot tell muscle from fat.`,
        associatedWith: [
          'type 2 diabetes',
          'high blood pressure',
          'heart disease and stroke',
          'several cancers',
          'osteoarthritis',
          'sleep apnoea',
          'non-alcoholic fatty liver disease',
        ],
        action:
          'Five to ten percent of body weight, lost slowly and kept off, is the change most of that evidence is built on. The path below has the numbers for your height.',
        from: 'bodycommand',
      });
    }
    if (band === 'under') {
      risks.push({
        factor: 'Being underweight',
        level: 'raised',
        evidence: `A BMI of ${bmi}, below the healthy range.`,
        associatedWith: ['reduced bone density', 'weakened immunity', 'loss of muscle'],
        action: 'This is one to take to a GP or a dietitian rather than to an app.',
        from: 'bodycommand',
      });
    }
  }

  if (input.activity && input.activity.windowDays >= 7) {
    const perWeek = (input.activity.daysMoved / input.activity.windowDays) * 7;
    if (perWeek < ACTIVE_DAYS_TARGET) {
      risks.push({
        factor: 'Movement',
        level: perWeek < 2 ? 'raised' : 'watch',
        evidence: `Movement on ${input.activity.daysMoved} of the last ${input.activity.windowDays} days — about ${round(perWeek)} days a week.`,
        associatedWith: [
          'cardiovascular disease',
          'type 2 diabetes',
          'some cancers',
          'low mood',
        ],
        action:
          'The guideline is activity on most days. Going from almost none to a little is the biggest single jump in the evidence — a ten-minute walk counts.',
        from: 'activity',
      });
    }
  }

  /*
   * Appetite-suppressing medication inverts the usual reading.
   *
   * Every other rule on this page watches for too much. Here the risk is
   * a day that ended on almost nothing, and it is invisible: the
   * medication is working exactly as intended, the scale is moving in the
   * intended direction, and the shortfall only shows up weeks later as
   * lost muscle and a tiredness nobody connected to it.
   */
  if (effects.proteinMattersMore && food && food.daysCovered >= 3) {
    const kcal = food.perDay.energyKcal ?? 0;
    if (kcal > 0 && kcal < DAILY_REFERENCE.energyKcal * 0.5) {
      risks.push({
        factor: 'How little is going in',
        level: 'high',
        evidence: `About ${Math.round(kcal)} kcal a day across the ${food.daysCovered} days recorded — under half a typical reference intake.`,
        associatedWith: [
          'losing muscle alongside fat',
          'tiredness that is mistaken for the medication',
          'shortfalls in things a small appetite cannot cover',
        ],
        action:
          'Put protein first at every meal, before anything else on the plate. When you can only manage a few mouthfuls, which mouthfuls they are is the whole decision. If this is what a normal week looks like, tell whoever prescribed it.',
        from: 'foodlens',
      });
    }
  }

  if (effects.muscleLossRisk && input.trend && input.trend.direction === 'down') {
    const perWeek = Math.abs(input.trend.kgPerWeek);
    // Above roughly 1% of body weight a week, muscle goes with the fat.
    const fast = input.weightKg ? perWeek > input.weightKg * 0.01 : perWeek > 1;
    if (fast) {
      risks.push({
        factor: 'How fast it is coming down',
        level: 'raised',
        evidence: `About ${round(perWeek)}kg a week. Faster is not better here — above roughly a percent of body weight a week, a meaningful share of what is lost is muscle.`,
        associatedWith: ['loss of muscle and strength', 'a lower resting metabolism afterwards'],
        action:
          'Keep resistance work in two or three times a week. This is the part food cannot do, and it is what decides whether this is weight coming down or weight coming down while you keep what you had. The rate itself is a conversation for your prescriber.',
        from: 'bodycommand',
      });
    }
  }

  if (effects.muscleLossRisk && input.activity && input.activity.windowDays >= 7) {
    const perWeek = (input.activity.daysMoved / input.activity.windowDays) * 7;
    if (perWeek < 2) {
      risks.push({
        factor: 'Muscle, while this is happening',
        level: 'raised',
        evidence: `Movement recorded on about ${round(perWeek)} days a week.`,
        associatedWith: ['losing muscle alongside fat', 'strength and balance falling with it'],
        action:
          'Two sessions a week of something resistance-based is the floor here — bands, bodyweight, or anything you push or pull against. It matters more now than it does at any other time.',
        from: 'activity',
      });
    }
  }

  // A falling weight means two entirely different things depending on who
  // is standing on the scale. For most people it is a rate to slow down;
  // for somebody whose condition makes it a symptom it is the reason to
  // ring their team this week, and the threshold for saying so is far
  // lower than a kilogram.
  if (input.trend && input.trend.direction === 'down') {
    const perWeek = round(Math.abs(input.trend.kgPerWeek));
    if (effects.weightLossIsAWarning && input.trend.kgPerWeek < -0.2) {
      risks.push({
        factor: 'Weight going down',
        level: 'high',
        evidence: `Down about ${perWeek}kg a week, and you have told us about ${becauseOf(input, 'weightLossIsAWarning')}.`,
        associatedWith: [
          'a sign your team watches for, rather than a result to be pleased about',
        ],
        action:
          'Tell the team treating you, this week. Unintended weight loss is one of the things they use to judge whether what you are on is working — it is information they need, not a failure on your part.',
        from: 'bodycommand',
      });
    } else if (
      !effects.weightLossIsAWarning &&
      // Where appetite-suppressing medication is declared, the specific
      // card above already covers a fast loss and covers it better — it
      // names muscle as the thing at stake and hands the rate itself to
      // the prescriber. Showing the general "eat a little more" alongside
      // it would put two different answers to one question on one screen,
      // which is the failure this whole design exists to prevent.
      !effects.muscleLossRisk &&
      input.trend.kgPerWeek < -1
    ) {
      risks.push({
        factor: 'Rate of loss',
        level: 'raised',
        evidence: `Losing ${perWeek}kg a week.`,
        associatedWith: ['muscle loss', 'gallstones', 'nutrient shortfalls'],
        action: 'Eat a little more and keep the strength work. Half a kilo a week is the rate that stays off.',
        from: 'bodycommand',
      });
    }
  }

  const order: Record<RiskLevel, number> = { high: 0, raised: 1, watch: 2 };
  return risks.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * The declared conditions, each read against this member's own figures.
 *
 * The published guidance is the same for everybody who has the condition,
 * and on its own it is a leaflet. What makes it worth a screen is
 * `noticed`: the line in their own ledger the guidance speaks to. Where
 * there is nothing to point at yet, `noticed` is empty and the card says
 * so by saying nothing, rather than inventing a concern.
 */
export function conditionFindings(input: InsightInput): ConditionFinding[] {
  return declaredIn(input).map((id) => {
    const card = CONDITIONS[id];
    return {
      id: card.id,
      label: card.label,
      group: card.group,
      inShort: card.inShort,
      watches: [...card.watches],
      helps: [...card.helps],
      careful: [...card.careful],
      clinicianOnly: [...card.clinicianOnly],
      noticed: noticedFor(id, input),
    };
  });
}

function noticedFor(id: ConditionId, input: InsightInput): string[] {
  const seen: string[] = [];
  const food = input.food;
  const perDay = food?.perDay ?? {};
  const enough = Boolean(food && food.daysCovered >= 3);
  const falling = input.trend?.direction === 'down' ? Math.abs(input.trend.kgPerWeek) : 0;

  const salt = (): void => {
    if (!enough || !perDay.saltG) return;
    seen.push(
      perDay.saltG > DAILY_REFERENCE.saltG * 0.8
        ? `${round(perDay.saltG)}g of salt a day in what you scanned — worth more attention here than the general 6g line suggests.`
        : `${round(perDay.saltG)}g of salt a day in what you scanned, which is where you want it.`,
    );
  };
  const sugars = (): void => {
    if (!enough || !perDay.sugarsG) return;
    const drink = (food?.topSugarItems ?? []).find((item) =>
      /cola|lemonade|juice|squash|energy|drink|soda|smoothie|tonic/i.test(item.name),
    );
    seen.push(
      drink
        ? `${round(perDay.sugarsG)}g of sugars a day, and ${drink.name} is one of the largest lines in it.`
        : `${round(perDay.sugarsG)}g of sugars a day in what you scanned.`,
    );
  };
  const lowEnergy = (): void => {
    if (!enough || !perDay.energyKcal) return;
    if (perDay.energyKcal < DAILY_REFERENCE.energyKcal * 0.7) {
      seen.push(
        `${Math.round(perDay.energyKcal)} kcal a day across what you scanned. Taking in too little is the risk here rather than too much — if that figure is real and not just unscanned meals, it is worth mentioning.`,
      );
    }
  };
  const weightFalling = (): void => {
    if (falling > 0.2) {
      seen.push(`Your weight is down about ${round(falling)}kg a week, which is one to report.`);
    }
  };
  const movement = (): void => {
    if (!input.activity || input.activity.windowDays < 7) return;
    const perWeek = (input.activity.daysMoved / input.activity.windowDays) * 7;
    if (perWeek < ACTIVE_DAYS_TARGET) {
      seen.push(`Movement on about ${round(perWeek)} days a week — the part food cannot do for you.`);
    }
  };

  switch (id) {
    case 'pancreatic_insufficiency':
      lowEnergy();
      weightFalling();
      break;
    case 'ibd':
      lowEnergy();
      weightFalling();
      break;
    case 'heart_failure':
      salt();
      weightFalling();
      break;
    case 'hypertension':
    case 'chronic_kidney_disease':
      salt();
      break;
    case 'type_2_diabetes':
      sugars();
      movement();
      break;
    case 'type_1_diabetes':
      sugars();
      break;
    case 'nafld':
    case 'gout':
      sugars();
      break;
    case 'high_cholesterol':
      if (enough && perDay.saturatesG) {
        seen.push(
          `${round(perDay.saturatesG)}g of saturated fat a day in what you scanned, against a 20g guideline${food?.topSaturates ? ` — ${food.topSaturates} carries most of it` : ''}.`,
        );
      }
      break;
    case 'osteoporosis':
      movement();
      break;
    case 'appetite_suppressing_medication': {
      // The inverted reading: too little, not too much.
      if (enough && perDay.energyKcal) {
        const kcal = Math.round(perDay.energyKcal);
        seen.push(
          kcal < DAILY_REFERENCE.energyKcal * 0.5
            ? `About ${kcal} kcal a day in what you recorded — under half a typical reference intake. Which mouthfuls you manage matters more than how many.`
            : `About ${kcal} kcal a day in what you recorded.`,
        );
      }
      if (falling > 0) {
        seen.push(
          `Weight down about ${round(falling)}kg a week. Faster is not better — what is worth protecting while it happens is muscle.`,
        );
      }
      movement();
      break;
    }
    case 'coeliac':
    case 'lactose_intolerance':
      seen.push(
        'Every barcode you scan has its declared allergens read off the label, so this is checked on each one rather than remembered.',
      );
      break;
    default:
      break;
  }

  return seen;
}

/**
 * What a declared condition has taken off the screen, said out loud.
 *
 * Silently removing a card is how somebody ends up trusting a page that is
 * quietly incomplete. If the general reading has been withheld, the reason
 * is shown in its place.
 */
export function suppressionsFor(input: InsightInput): string[] {
  const effects = effectsFor(input);
  const out: string[] = [];
  if (effects.doNotFlagFat) {
    out.push(
      `Fat is not flagged here. With ${becauseOf(input, 'doNotFlagFat')} the current guidance is not to restrict it — enzyme replacement is what makes fat digestible, and cutting it out instead is what causes the weight loss and the vitamin problems. The general saturated-fat card would have told you the opposite.`,
    );
  }
  if (effects.weightLossIsAWarning) {
    out.push(
      `No weight-loss plan is shown. With ${becauseOf(input, 'weightLossIsAWarning')}, weight coming down is a symptom to report rather than a goal to chase.`,
    );
  }
  if (effects.deficitNeedsClinician && !effects.weightLossIsAWarning) {
    out.push(
      `The calorie-gap plan is held back. With ${becauseOf(input, 'deficitNeedsClinician')} a deliberate deficit is a decision to make with a clinician first, because it changes doses and rates that are not this platform's to set.`,
    );
  }
  if (effects.saltMattersMore) {
    out.push(
      `Salt is read against a tighter line than the general 6g, because of ${becauseOf(input, 'saltMattersMore')}.`,
    );
  }
  if (effects.noSaltSubstitute) {
    out.push(
      `Low-sodium salt substitutes are never suggested here. They are usually potassium chloride, which with ${becauseOf(input, 'noSaltSubstitute')} can be genuinely dangerous.`,
    );
  }
  if (effects.doNotPushProtein) {
    out.push(
      `Nothing here will push protein at you. With ${becauseOf(input, 'doNotPushProtein')} the target comes from your bloods and belongs to a renal dietitian.`,
    );
  }

  /*
   * The genuine clinical collision, said out loud rather than resolved
   * silently.
   *
   * Somebody on appetite-suppressing medication needs protein prioritised.
   * Somebody with reduced kidney function must not be pushed towards it.
   * Both are true, they point opposite ways, and an app is the wrong place
   * to decide between them — so the suppression wins, and the person is
   * told that two things they declared disagree and who settles it.
   */
  if (effects.proteinMattersMore && effects.doNotPushProtein) {
    out.push(
      `Two things you have told us disagree: ${becauseOf(input, 'proteinMattersMore')} makes protein the thing to protect, and ${becauseOf(input, 'doNotPushProtein')} makes it something only your bloods can set. This platform has taken the cautious side and will not push protein at you — but that is a real question with a real answer, and the answer is a renal dietitian's rather than ours.`,
    );
  }
  return out;
}

export function insightFor(input: InsightInput): HealthInsight {
  // Rule three. There is no consent setting that turns this on for a child.
  if (input.age < 18) {
    return {
      available: false,
      why:
        'Under 18, this platform does not show disease risk, calorie targets or BMI. Growing bodies are not read this way, and the evidence these figures come from is adult evidence.',
      risks: [],
      bmi: {
        bmi: null,
        band: null,
        healthyRangeKg: null,
        gapKg: null,
        weeksAtSafeRate: null,
        safeRateKgPerWeek: null,
        says: 'Not shown under 18.',
        steps: [],
      },
      plan: {
        planned: false,
        why: 'Not shown under 18.',
        gapKg: 0,
        targetKg: 0,
        weeklyLossKg: 0,
        dailyDeficitKcal: 0,
        levers: [],
        leverTotalKcal: 0,
        coveragePct: 0,
        milestones: [],
        projection: [],
        safety: [],
      },
      // Rule five. A declared condition does not unlock any of this for a
      // child — if anything it is the strongest reason to keep an app out
      // of it, and the answer stays the clinician who knows them.
      conditions: [],
      suppressed: [],
      builtFrom: [],
      limits: [],
      seeSomeone: ['Anything worrying about a young person’s growth belongs with a GP.'],
    };
  }

  const risks = risksFor(input);
  const builtFrom: string[] = [];
  if (input.food && input.food.daysRecorded > 0) {
    builtFrom.push(
      `FoodLens — ${input.food.daysCovered} day${input.food.daysCovered === 1 ? '' : 's'} of food, scanned across ${input.food.daysRecorded} day${input.food.daysRecorded === 1 ? '' : 's'}`,
    );
  }
  if (input.activity) {
    builtFrom.push(`Activity — ${input.activity.daysMoved} of ${input.activity.windowDays} days`);
  }
  if (input.heightCm && input.weightKg) builtFrom.push('BodyCommand — your height and weight');
  if (input.trend) builtFrom.push('BodyCommand — your weight trend');

  const conditions = conditionFindings(input);
  if (conditions.length > 0) {
    builtFrom.push(
      `What you live with — ${conditions.map((c) => c.label).join(', ')}, because you told us`,
    );
  }

  return {
    available: true,
    risks,
    bmi: bmiPathFor(input),
    plan: gapPlanFor(input),
    conditions,
    suppressed: suppressionsFor(input),
    ...(conditions.length > 0
      ? {
          notMedicalAdvice: NOT_MEDICAL_ADVICE,
          // A declared medication needs a different sentence from a
          // declared diagnosis: the thing this platform must promise is
          // that it will not comment on the prescription.
          ...(declaredIn(input).some(isMedicationContext)
            ? { medicationNote: MEDICATION_NOT_ADVICE }
            : {}),
        }
      : {}),
    builtFrom,
    limits: [
      'None of this is a diagnosis. Each item is an association found across populations, not a statement about you.',
      'It is built from what you scanned and recorded, which is never everything you ate or did.',
      'BMI cannot tell muscle from fat and reads differently across ethnic groups. It is one signal among several here, never a verdict.',
      conditions.length === 0
        ? 'Nothing here accounts for medication, pregnancy, a diagnosed condition or a family history. Those change the picture and only a clinician can weigh them.'
        : 'What you told us you live with is taken into account above. Your medication, your test results and your family history are not — this platform holds none of them, and they change the picture more than anything on this page.',
    ],
    seeSomeone: [
      'Chest pain, breathlessness at rest, or a sudden change you cannot explain — that is urgent care, today, not an app.',
      'Blood pressure and cholesterol are free to check at most pharmacies and are the two numbers this platform cannot see.',
      'If you are on medication or being treated for anything, take these figures to that clinician rather than acting on them alone.',
    ],
  };
}

/* ==================================================================
 * Closing the gap.
 *
 * "13.7kg to the healthy range" is a fact, and on its own it is not
 * help — it is a number to feel bad about. What follows turns it into
 * work: a first milestone that matters clinically, a weekly line to
 * follow, and levers drawn from this person's own ledger rather than
 * from a leaflet.
 *
 * The arithmetic is the standard one: roughly 7,700 kcal per kilogram
 * of body fat, so half a kilo a week is a daily gap of about 550 kcal
 * between what goes in and what is used. It is deliberately expressed
 * as a *gap*, never as a calorie target, because a target needs a
 * maintenance figure this platform cannot know — it would have to guess
 * at sex, body composition and activity, and a guess dressed as a
 * prescription is how people end up eating too little.
 * ================================================================== */

/** Energy in a kilogram of body fat. The figure the guidance uses. */
export const KCAL_PER_KG = 7700;

/** Never more than this a day, whatever the arithmetic says. */
export const MAX_DAILY_DEFICIT = 750;

/**
 * The first target worth having. Five percent of body weight is where
 * the evidence on blood pressure, blood sugar and blood lipids starts,
 * and it arrives long before the healthy range does.
 */
export const FIRST_MILESTONE_PCT = 0.05;

export interface Lever {
  what: string;
  /** What this is worth per day, in kcal. */
  kcalPerDay: number;
  /** Where the figure came from, so it can be checked. */
  because: string;
  from: 'foodlens' | 'activity' | 'general';
}

export interface Milestone {
  label: string;
  weightKg: number;
  weeks: number;
  says: string;
}

export interface GapPlan {
  /** Present only when there is a gap worth planning for. */
  planned: boolean;
  why?: string;
  gapKg: number;
  targetKg: number;
  weeklyLossKg: number;
  dailyDeficitKcal: number;
  levers: Lever[];
  /** What the levers add up to, against what is needed. */
  leverTotalKcal: number;
  coveragePct: number;
  milestones: Milestone[];
  /** A weight per week, for drawing the line to follow. */
  projection: { week: number; weightKg: number }[];
  safety: string[];
}

/**
 * A daily gap of `dailyDeficitKcal`, and the levers that might close it.
 *
 * Every food lever is worth what that item actually contributes in this
 * person's ledger — not a leaflet's guess. The saving claimed is
 * deliberately conservative: swapping something is rarely removing it.
 */
export function gapPlanFor(input: InsightInput): GapPlan {
  const path = bmiPathFor(input);
  const empty: GapPlan = {
    planned: false,
    gapKg: 0,
    targetKg: 0,
    weeklyLossKg: 0,
    dailyDeficitKcal: 0,
    levers: [],
    leverTotalKcal: 0,
    coveragePct: 0,
    milestones: [],
    projection: [],
    safety: [],
  };

  if (path.bmi === null || !input.weightKg || !path.healthyRangeKg) {
    return { ...empty, why: 'Give a height and a weight in BodyCommand and this fills in.' };
  }
  if (path.band === 'healthy') {
    return {
      ...empty,
      why: `You are already inside the healthy range. There is no gap to close — staying between ${path.healthyRangeKg.min}kg and ${path.healthyRangeKg.max}kg is the whole job.`,
    };
  }
  if (path.band === 'under') {
    return {
      ...empty,
      why: 'Below the healthy range, this platform will not plan a reduction. That conversation belongs with a GP or a dietitian.',
    };
  }

  // Two different silences, and they are not the same silence.
  //
  // Where weight loss is a warning sign, there is no plan at all — the
  // question of a deficit does not arise. Where a deficit merely needs
  // agreeing first, the plan is withheld rather than abolished: the
  // arithmetic is sound, it is the decision to run it that is not ours.
  const effects = effectsFor(input);
  if (effects.weightLossIsAWarning) {
    return {
      ...empty,
      why:
        `With ${becauseOf(input, 'weightLossIsAWarning')}, weight coming down is something to report rather than something to aim at, ` +
        'so there is no reduction plan here. If losing weight is genuinely the right goal for you, that is a decision to make with the team treating you, and this platform will follow it rather than lead it.',
    };
  }
  if (effects.deficitNeedsClinician) {
    return {
      ...empty,
      why:
        `A deliberate calorie gap changes things that ${becauseOf(input, 'deficitNeedsClinician')} makes somebody else's decision — insulin and other medication doses, and how fast is safe for you. ` +
        'The arithmetic is not the difficult part and the plan would be the same one; agreeing to run it is not this platform’s call. Take it to your clinician and it can be turned on afterwards.',
    };
  }

  const weight = input.weightKg;
  const targetKg = path.healthyRangeKg.max;
  const gapKg = round(weight - targetKg, 1);
  const weeklyLossKg = path.safeRateKgPerWeek ?? 0.5;
  const dailyDeficitKcal = Math.min(
    MAX_DAILY_DEFICIT,
    Math.round((weeklyLossKg * KCAL_PER_KG) / 7 / 10) * 10,
  );

  const levers = leversFor(input, dailyDeficitKcal);
  const leverTotalKcal = levers.reduce((sum, l) => sum + l.kcalPerDay, 0);

  const firstMilestoneKg = round(weight * FIRST_MILESTONE_PCT, 1);
  const milestones: Milestone[] = [
    {
      label: 'First five percent',
      weightKg: round(weight - firstMilestoneKg, 1),
      weeks: Math.ceil(firstMilestoneKg / weeklyLossKg),
      says:
        'Where the evidence on blood pressure, blood sugar and cholesterol begins. It arrives long before the healthy range does.',
    },
    {
      label: 'Halfway',
      weightKg: round(weight - gapKg / 2, 1),
      weeks: Math.ceil(gapKg / 2 / weeklyLossKg),
      says: 'The point where the habits are the thing keeping it going, rather than the effort.',
    },
    {
      label: 'Inside the healthy range',
      weightKg: targetKg,
      weeks: Math.ceil(gapKg / weeklyLossKg),
      says: `${path.healthyRangeKg.min}kg to ${path.healthyRangeKg.max}kg is the range. The top of it counts.`,
    },
  ].filter((m, i, all) => i === 0 || m.weeks > all[i - 1]!.weeks);

  const totalWeeks = Math.ceil(gapKg / weeklyLossKg);
  const step = Math.max(1, Math.round(totalWeeks / 26));
  const projection: { week: number; weightKg: number }[] = [];
  for (let week = 0; week <= totalWeeks; week += step) {
    projection.push({ week, weightKg: round(Math.max(targetKg, weight - week * weeklyLossKg), 1) });
  }
  if (projection[projection.length - 1]?.week !== totalWeeks) {
    projection.push({ week: totalWeeks, weightKg: targetKg });
  }

  return {
    planned: true,
    gapKg,
    targetKg,
    weeklyLossKg,
    dailyDeficitKcal,
    levers,
    leverTotalKcal,
    coveragePct: Math.round((leverTotalKcal / dailyDeficitKcal) * 100),
    milestones,
    projection,
    safety: [
      'This is a daily gap, not a calorie allowance. Nothing here tells you a number to eat down to — that needs a maintenance figure nobody can work out from a height and a weight.',
      'If the weight is coming off faster than about a percent of your body weight a week, that is too fast, and BodyCommand will say so.',
      'Medication, pregnancy, a thyroid condition and several others change all of this. If any of them apply, take the plan to the clinician who knows about it rather than following it alone.',
    ],
  };
}

/**
 * The levers, largest first.
 *
 * Food levers come from the ledger, so a person is shown the thing they
 * actually buy rather than a generic swap. Movement is offered against
 * the days they have not moved, never as a punishment for eating.
 */
function leversFor(input: InsightInput, needed: number): Lever[] {
  const levers: Lever[] = [];
  const food = input.food;

  if (food && food.daysCovered > 0) {
    const perDayOf = (amount: number): number => Math.round(amount / food.daysCovered);

    // A sugary drink is the single cheapest change most people can make:
    // the swap is like-for-like and takes almost all of the energy out.
    const drink = (food.topSugarItems ?? []).find((item) =>
      /cola|lemonade|juice|squash|energy|drink|soda|smoothie|tonic/i.test(item.name),
    );
    const drinkEnergy = (food.topEnergy ?? []).find((e) => e.name === drink?.name);
    if (drink && drinkEnergy && perDayOf(drinkEnergy.amount) >= 30) {
      levers.push({
        what: `Swap ${drink.name} for a no-sugar version`,
        kcalPerDay: Math.round(perDayOf(drinkEnergy.amount) * 0.9),
        because: `${drink.name} is ${perDayOf(drinkEnergy.amount)} kcal a day of what you scanned, and almost all of it is sugar.`,
        from: 'foodlens',
      });
    }

    // The biggest line in the ledger that is not that drink. Halving is
    // the honest claim — swapping something is rarely removing it.
    for (const item of (food.topEnergy ?? []).slice(0, 3)) {
      if (levers.some((l) => l.what.includes(item.name))) continue;
      const perDay = perDayOf(item.amount);
      if (perDay < 60) continue;
      levers.push({
        what: `Halve the ${item.name}`,
        kcalPerDay: Math.round(perDay / 2),
        because: `${item.name} is the ${levers.length === 0 ? 'largest' : 'next largest'} line in your ledger at ${perDay} kcal a day.`,
        from: 'foodlens',
      });
      if (levers.reduce((s, l) => s + l.kcalPerDay, 0) >= needed) break;
    }
  }

  // Movement, offered against the days that are empty rather than as a
  // penalty for what was eaten.
  if (input.activity && input.activity.windowDays > 0) {
    const perWeek = (input.activity.daysMoved / input.activity.windowDays) * 7;
    const spare = Math.max(0, Math.round(ACTIVE_DAYS_TARGET - perWeek));
    if (spare > 0) {
      // A brisk half-hour walk is roughly 150 kcal for an average adult.
      levers.push({
        what: `${spare} more brisk half-hour walk${spare === 1 ? '' : 's'} a week`,
        kcalPerDay: Math.round((spare * 150) / 7),
        because: `You moved on about ${round(perWeek)} days a week. Each brisk half hour is roughly 150 kcal.`,
        from: 'activity',
      });
    }
  }

  if (levers.length === 0) {
    levers.push({
      what: 'Scan a week of your shopping',
      kcalPerDay: 0,
      because:
        'With a ledger behind it this becomes your own swaps rather than general advice. Until then there is nothing specific to point at.',
      from: 'general',
    });
  }

  return levers.sort((a, b) => b.kcalPerDay - a.kcalPerDay);
}
