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
 */

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

export interface HealthInsight {
  available: boolean;
  why?: string;
  risks: RiskFinding[];
  bmi: BmiPath;
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
  } | null;
  /** From the activity dashboard. */
  activity?: { daysMoved: number; windowDays: number } | null;
  /** From BodyCommand's own trend, when there is one. */
  trend?: { kgPerWeek: number; direction: 'up' | 'down' | 'level' } | null;
}

const round = (value: number, places = 1): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

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

  // Three days of food, not three days of scanning. A whole week's shop
  // goes into the basket in one trip, and that is still a week's evidence.
  if (food && food.daysCovered >= 3) {
    const salt = food.perDay.saltG ?? 0;
    if (salt > DAILY_REFERENCE.saltG) {
      risks.push({
        factor: 'Salt',
        level: salt > DAILY_REFERENCE.saltG * 1.5 ? 'high' : 'raised',
        evidence: `${round(salt)}g a day across the ${food.daysCovered} days of food scanned, against a 6g guideline.`,
        associatedWith: ['raised blood pressure', 'stroke', 'heart disease', 'kidney disease'],
        action: food.topSalt
          ? `${food.topSalt} is carrying the most of it. Changing that one item moves the whole week.`
          : 'Most salt arrives in bread, sauces and processed meat rather than the salt cellar.',
        from: 'foodlens',
      });
    }

    const saturates = food.perDay.saturatesG ?? 0;
    if (saturates > DAILY_REFERENCE.saturatesG) {
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
  if (bmi !== null) {
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

  if (input.trend && input.trend.direction === 'down' && input.trend.kgPerWeek < -1) {
    risks.push({
      factor: 'Rate of loss',
      level: 'raised',
      evidence: `Losing ${round(Math.abs(input.trend.kgPerWeek))}kg a week.`,
      associatedWith: ['muscle loss', 'gallstones', 'nutrient shortfalls'],
      action: 'Eat a little more and keep the strength work. Half a kilo a week is the rate that stays off.',
      from: 'bodycommand',
    });
  }

  const order: Record<RiskLevel, number> = { high: 0, raised: 1, watch: 2 };
  return risks.sort((a, b) => order[a.level] - order[b.level]);
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

  return {
    available: true,
    risks,
    bmi: bmiPathFor(input),
    builtFrom,
    limits: [
      'None of this is a diagnosis. Each item is an association found across populations, not a statement about you.',
      'It is built from what you scanned and recorded, which is never everything you ate or did.',
      'BMI cannot tell muscle from fat and reads differently across ethnic groups. It is one signal among several here, never a verdict.',
      'Nothing here accounts for medication, pregnancy, a diagnosed condition or a family history. Those change the picture and only a clinician can weigh them.',
    ],
    seeSomeone: [
      'Chest pain, breathlessness at rest, or a sudden change you cannot explain — that is urgent care, today, not an app.',
      'Blood pressure and cholesterol are free to check at most pharmacies and are the two numbers this platform cannot see.',
      'If you are on medication or being treated for anything, take these figures to that clinician rather than acting on them alone.',
    ],
  };
}
