/**
 * What happened since last time — and when to say something about it.
 *
 * A reading on its own is a number. The useful part is the second one:
 * the direction, the rate, whether that rate is sustainable, and what
 * the member was actually doing while it happened.
 *
 * Two rules shape everything here. Nothing is ever claimed to have
 * *caused* anything — movement and meals are reported alongside the
 * trend, never as its explanation. And under 18, none of it exists:
 * no weight, no rate, no warning, no framing, in any mode.
 */

export interface Reading {
  day: string;
  kg: number;
}

export interface Trend {
  /** Kilograms per week, signed. Null until there are two readings. */
  kgPerWeek: number | null;
  changeKg: number | null;
  spanDays: number;
  readings: number;
  direction: 'down' | 'up' | 'steady' | 'unknown';
  says: string;
}

export type WarningLevel = 'note' | 'caution' | 'stop';

export interface Warning {
  level: WarningLevel;
  says: string;
  /** What to do about it. A warning without an action is just worry. */
  action: string;
}

export interface Alongside {
  daysMoved: number;
  mealsChecked: number;
  windowDays: number;
  says: string;
}

const DAY_MS = 86_400_000;

export function trendFrom(readings: Reading[]): Trend {
  const sorted = [...readings].sort((a, b) => a.day.localeCompare(b.day));
  if (sorted.length < 2) {
    return {
      kgPerWeek: null,
      changeKg: null,
      spanDays: 0,
      readings: sorted.length,
      direction: 'unknown',
      says:
        sorted.length === 0
          ? 'No readings yet. The first one is just a fact about today.'
          : 'One reading is a fact. Two make a direction — add another in a week or so.',
    };
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const spanDays = Math.max(
    1,
    Math.round((Date.parse(`${last.day}T00:00:00Z`) - Date.parse(`${first.day}T00:00:00Z`)) / DAY_MS),
  );
  const changeKg = Number((last.kg - first.kg).toFixed(1));
  const kgPerWeek = Number(((changeKg / spanDays) * 7).toFixed(2));
  const direction = Math.abs(kgPerWeek) < 0.1 ? 'steady' : kgPerWeek < 0 ? 'down' : 'up';

  const size = Math.abs(kgPerWeek);
  const says =
    direction === 'steady'
      ? `Holding steady over ${spanDays} days — which is a result in itself if that is the goal.`
      : `${size.toFixed(1)}kg a week ${direction === 'down' ? 'down' : 'up'} across ${spanDays} days and ${sorted.length} readings.`;

  return { kgPerWeek, changeKg, spanDays, readings: sorted.length, direction, says };
}

/**
 * The warnings. Deliberately few, deliberately specific, and every one
 * of them carries what to do next.
 */
export function warningsFor(input: {
  age: number;
  bmi?: number | null;
  trend: Trend;
  latestKg?: number | null;
}): Warning[] {
  // §11 — under 18 there is no weight framing of any kind, so there is
  // nothing here to warn about either.
  if (input.age < 18) return [];

  const warnings: Warning[] = [];
  const { kgPerWeek, readings } = input.trend;

  if (kgPerWeek !== null && input.latestKg && input.latestKg > 0) {
    const pctPerWeek = (Math.abs(kgPerWeek) / input.latestKg) * 100;

    // Faster than roughly 1% of body weight a week is where lean tissue
    // starts going with the fat, and where the loss stops holding.
    if (kgPerWeek < 0 && pctPerWeek > 1) {
      warnings.push({
        level: 'caution',
        says: `That is ${pctPerWeek.toFixed(1)}% of your body weight a week — faster than is usually sustainable, and fast loss takes muscle with it.`,
        action: 'Eat a little more, keep the strength work, and aim for half this rate.',
      });
    }
    if (kgPerWeek > 0 && pctPerWeek > 1.5) {
      warnings.push({
        level: 'note',
        says: `Up ${Math.abs(kgPerWeek).toFixed(1)}kg a week. A fortnight of that is worth a look rather than a panic.`,
        action: 'Check whether something changed — illness, medication, a new routine — before changing anything.',
      });
    }
  }

  if (typeof input.bmi === 'number') {
    if (input.bmi < 18.5) {
      warnings.push({
        level: 'stop',
        says: 'Your BMI is below the healthy range, so this platform will not run a weight-reduction plan for you.',
        action: 'Speak to a GP or a dietitian. Movement and strength work stay available and are a good idea.',
      });
    } else if (input.bmi >= 40) {
      warnings.push({
        level: 'caution',
        says: 'At this BMI, professional support alongside the app makes a real difference to what is achievable safely.',
        action: 'Ask a GP about supported weight management. Nothing here needs to stop meanwhile.',
      });
    }
  }

  if (readings === 1) {
    warnings.push({
      level: 'note',
      says: 'One reading cannot show a direction, and daily weight swings by a kilogram or more on water alone.',
      action: 'Weigh at the same time of day, about weekly. Three readings make a trend worth reading.',
    });
  }

  return warnings;
}

/**
 * What the member was doing while that happened. Reported alongside the
 * trend and never as its cause: this platform does not claim a walk
 * moved a number.
 */
export function alongsideFrom(input: {
  daysMoved: number;
  mealsChecked: number;
  windowDays: number;
}): Alongside {
  const { daysMoved, mealsChecked, windowDays } = input;
  const says =
    daysMoved === 0 && mealsChecked === 0
      ? 'Nothing recorded in this window yet, so there is nothing to set beside the trend.'
      : `Movement on ${daysMoved} of ${windowDays} days and ${mealsChecked} meal${mealsChecked === 1 ? '' : 's'} looked at. Shown beside your trend, not as its cause — nobody can honestly separate one walk from a fortnight.`;
  return { daysMoved, mealsChecked, windowDays, says };
}

/** One week of the record, and how it compares with the week before it. */
export interface WeekRow {
  /** The Monday the week starts on, as YYYY-MM-DD. */
  weekStart: string;
  /** The weight that represents the week. */
  kg: number;
  /** The day it was actually taken — rarely the Monday. */
  takenOn: string;
  /** How many readings were given that week. */
  readings: number;
  /** Against the previous *recorded* week. Null for the first week. */
  changeKg: number | null;
  /** 1 normally; more when weeks were skipped. */
  weeksSincePrevious: number | null;
  /**
   * The change spread across the gap.
   *
   * This is the number that matters and the one that is easy to get
   * wrong. Somebody who weighs, misses a fortnight, then weighs 3kg
   * lighter has lost 1kg a week, not 3 — and the safety threshold is a
   * rate, so reading the gap as a single week would raise a caution that
   * is simply false. Division by `weeksSincePrevious` is the whole reason
   * the gap is tracked at all.
   */
  kgPerWeek: number | null;
}

export interface WeeklyRecord {
  /** Oldest first, so the member reads it the way it happened. */
  weeks: WeekRow[];
  /** The latest recorded week — "the new one". */
  current: WeekRow | null;
  /** The recorded week before it — "the current one", to compare against. */
  previous: WeekRow | null;
  /** Advice, and only when it is warranted. */
  advice: Warning[];
  says: string;
}

/** The Monday of the week a day falls in, in UTC. */
function weekStartOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  // getUTCDay: 0 = Sunday. Shift so Monday is the start of the week,
  // because a week that begins on Sunday is not how anybody keeps a
  // weekly record in the UK.
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

/**
 * The weekly weight record: each week, and the week before it.
 *
 * `trendFrom` gives one rate across the whole span, which answers "where
 * is this going" and not "what happened this week against last week" —
 * and the second question is the one somebody losing weight actually
 * asks. A single span rate also hides a fortnight of nothing followed by
 * a sudden drop, which is exactly the pattern worth noticing.
 *
 * One reading per week, and it is the **last** one given in that week,
 * matching the latest-wins-per-day rule the readings themselves follow.
 * Weighing three times in a week is not three weeks of data.
 *
 * Advice comes from `warningsFor` rather than a second set of thresholds.
 * The 1%-of-body-weight rule, the BMI floor that stops a reduction plan
 * outright, and the one-reading note are already written there, and a
 * weekly view with its own numbers would be two rules that could disagree
 * about the same person.
 */
export function weeklyRecord(input: {
  readings: Reading[];
  age: number;
  bmi?: number | null;
}): WeeklyRecord {
  // Under 18 there is no weight framing at all, so there is no record to
  // show — the same rule `warningsFor` applies, applied before anything
  // is computed rather than after.
  if (input.age < 18) {
    return {
      weeks: [],
      current: null,
      previous: null,
      advice: [],
      says: 'Weight is not tracked under 18. Strength, movement and how you feel are.',
    };
  }

  const sorted = [...input.readings].sort((a, b) => a.day.localeCompare(b.day));

  const byWeek = new Map<string, { kg: number; takenOn: string; readings: number }>();
  for (const reading of sorted) {
    const start = weekStartOf(reading.day);
    const existing = byWeek.get(start);
    byWeek.set(start, {
      // Last one wins: `sorted` is ascending, so each later reading in the
      // same week replaces the earlier one.
      kg: reading.kg,
      takenOn: reading.day,
      readings: (existing?.readings ?? 0) + 1,
    });
  }

  const starts = [...byWeek.keys()].sort();
  const weeks: WeekRow[] = starts.map((start, i) => {
    const week = byWeek.get(start)!;
    const prevStart = i > 0 ? starts[i - 1]! : null;
    const prev = prevStart ? byWeek.get(prevStart)! : null;

    const weeksSincePrevious = prevStart
      ? Math.max(
          1,
          Math.round(
            (Date.parse(`${start}T00:00:00Z`) - Date.parse(`${prevStart}T00:00:00Z`)) /
              (7 * DAY_MS),
          ),
        )
      : null;

    const changeKg = prev ? Number((week.kg - prev.kg).toFixed(1)) : null;

    return {
      weekStart: start,
      kg: week.kg,
      takenOn: week.takenOn,
      readings: week.readings,
      changeKg,
      weeksSincePrevious,
      kgPerWeek:
        changeKg !== null && weeksSincePrevious
          ? Number((changeKg / weeksSincePrevious).toFixed(2))
          : null,
    };
  });

  const current = weeks.length > 0 ? weeks[weeks.length - 1]! : null;
  const previous = weeks.length > 1 ? weeks[weeks.length - 2]! : null;

  /*
   * Advice is judged on the latest week's own rate, not the whole span.
   * A member who lost slowly for a month and then dropped 2kg in a week
   * needs to hear about this week — the span average would bury it.
   */
  const advice =
    current && current.kgPerWeek !== null
      ? warningsFor({
          age: input.age,
          bmi: input.bmi ?? null,
          latestKg: current.kg,
          trend: {
            kgPerWeek: current.kgPerWeek,
            changeKg: current.changeKg,
            spanDays: (current.weeksSincePrevious ?? 1) * 7,
            readings: weeks.length,
            direction:
              Math.abs(current.kgPerWeek) < 0.1 ? 'steady' : current.kgPerWeek < 0 ? 'down' : 'up',
            says: '',
          },
        })
      : warningsFor({
          age: input.age,
          bmi: input.bmi ?? null,
          latestKg: current?.kg ?? null,
          trend: {
            kgPerWeek: null,
            changeKg: null,
            spanDays: 0,
            readings: weeks.length,
            direction: 'unknown',
            says: '',
          },
        });

  const says = ((): string => {
    if (!current) return 'No weekly record yet. One reading a week, at the same time of day, is enough.';
    if (!previous) {
      return `First week recorded at ${current.kg}kg. Next week gives you something to compare it with.`;
    }
    const gap = current.weeksSincePrevious ?? 1;
    const gapNote =
      gap > 1
        ? ` That is ${gap} weeks apart, so it is ${Math.abs(current.kgPerWeek ?? 0).toFixed(1)}kg a week rather than ${Math.abs(current.changeKg ?? 0).toFixed(1)}.`
        : '';
    if (current.changeKg === null || Math.abs(current.changeKg) < 0.1) {
      return `${previous.kg}kg then ${current.kg}kg — level.${gapNote} A week that holds is not a week lost.`;
    }
    const dir = current.changeKg < 0 ? 'down' : 'up';
    return `${previous.kg}kg then ${current.kg}kg — ${Math.abs(current.changeKg).toFixed(1)}kg ${dir}.${gapNote}`;
  })();

  return { weeks, current, previous, advice, says };
}
