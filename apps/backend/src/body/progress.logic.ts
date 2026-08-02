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
