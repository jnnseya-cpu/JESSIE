/**
 * Turning a log of acts into the readings the platform promises.
 *
 * Every number here is derived from something the member actually did.
 * Where there is not enough history to say something true, the reading
 * is null and the surface says so — an invented trend line is exactly
 * the failure this product refuses everywhere else.
 */

import { movedOnDay } from '@jessmove/shared';

export type ActivityKind =
  | 'snap_offered'
  | 'snap_completed'
  | 'snap_held'
  | 'food_checked'
  | 'body_read'
  /**
   * A walk the member did on their own and told us about.
   *
   * Deliberately not a `snap_completed`. Completion rate is completed ÷
   * offered and it answers exactly one question — was the engine's timing
   * right? A walk nobody offered says nothing about that, and counting it
   * would inflate a numerator against a denominator it never entered.
   *
   * It does count as movement everywhere movement is what is being asked
   * about: minutes, days moved, the streak, the mix and the heatmap. Those
   * are questions about the person, and walking to work is an honest
   * answer to all of them.
   */
  | 'walk_logged';

export interface ActivityRow {
  kind: ActivityKind;
  category: string | null;
  seconds: number;
  onDay: string;
  at: string;
  detail: string;
  /** A measurement the member gave: kilograms, kilocalories. */
  value?: number | null;
}

export interface DayPoint {
  day: string;
  offered: number;
  completed: number;
  held: number;
  /** Walks logged. Kept apart from `completed` so completion rate stays honest. */
  walks: number;
  /** Snap seconds plus walk seconds — every second of movement on the day. */
  seconds: number;
}

/**
 * A day counts as moved if either kind of movement happened on it.
 *
 * The predicate itself lives in the shared package so the dashboard, the
 * readings and the rewards cannot drift apart on what "a day you moved"
 * means — see `movedOnDay`.
 */
export const moved = (point: DayPoint): boolean => movedOnDay(point);

export interface Reading {
  key: string;
  label: string;
  /** 0–100, or null when there is not enough history to say anything. */
  value: number | null;
  says: string;
}

export interface Dashboard {
  days: DayPoint[];
  todaySeconds: number;
  todayCompleted: number;
  todayWalks: number;
  walksInWindow: number;
  /** Completed ÷ offered across the window, or null before anything was offered. */
  completionRate: number | null;
  /** Consecutive days ending today carrying movement of either kind. */
  streak: number;
  daysMovedInWindow: number;
  mix: { category: string; completed: number }[];
  foodChecks: number;
  heldWithReasons: { detail: string; count: number }[];
  readings: Reading[];
  totalActs: number;
  /** 7 rows (Mon-Sun) x 6 four-hour blocks, counting movement of either kind. */
  heatmap: number[][];
  /** Today, hour by hour: what was offered, done and held. */
  today: { hour: number; kind: ActivityKind }[];
  /** Weight readings in the window, oldest first, for the trajectory. */
  weights: { day: string; kg: number }[];
  /** Meal energies in the window, for the meal-against-your-median chart. */
  meals: { day: string; kcal: number }[];
}

export const WINDOW_DAYS = 14;

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The window's days, oldest first, so a chart can be drawn straight from it. */
export function windowDays(today: string, count = WINDOW_DAYS): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

function pct(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function buildDashboard(rows: ActivityRow[], today: string): Dashboard {
  const days = windowDays(today);
  const inWindow = rows.filter((r) => r.onDay >= days[0]!);

  const byDay = new Map<string, DayPoint>(
    days.map((day) => [day, { day, offered: 0, completed: 0, held: 0, walks: 0, seconds: 0 }]),
  );

  const mix = new Map<string, number>();
  const heldReasons = new Map<string, number>();
  let foodChecks = 0;

  for (const row of inWindow) {
    const point = byDay.get(row.onDay);
    if (!point) continue;
    if (row.kind === 'snap_offered') point.offered += 1;
    if (row.kind === 'snap_held') {
      point.held += 1;
      const reason = row.detail || 'context said no';
      heldReasons.set(reason, (heldReasons.get(reason) ?? 0) + 1);
    }
    if (row.kind === 'snap_completed') {
      point.completed += 1;
      point.seconds += row.seconds;
      const category = row.category ?? 'movement';
      mix.set(category, (mix.get(category) ?? 0) + 1);
    }
    if (row.kind === 'walk_logged') {
      point.walks += 1;
      point.seconds += row.seconds;
      // A walk is cardio, always. The member is not asked to classify it,
      // and nothing is inferred from the duration beyond the duration.
      mix.set('cardio', (mix.get('cardio') ?? 0) + 1);
    }
    if (row.kind === 'food_checked') foodChecks += 1;
  }

  const series = days.map((d) => byDay.get(d)!);
  const totalOffered = series.reduce((a, p) => a + p.offered, 0);
  const totalCompleted = series.reduce((a, p) => a + p.completed, 0);
  const totalWalks = series.reduce((a, p) => a + p.walks, 0);
  const daysMoved = series.filter(moved).length;

  // A streak counts back from today and forgives nothing silently: the
  // shield mechanic is a separate, explicit act, not a hidden fudge here.
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (moved(series[i]!)) streak += 1;
    else break;
  }

  const todayPoint = series[series.length - 1]!;

  return {
    days: series,
    todaySeconds: todayPoint.seconds,
    todayCompleted: todayPoint.completed,
    todayWalks: todayPoint.walks,
    walksInWindow: totalWalks,
    /*
     * Snaps only, on both sides. This is the engine's marking, not the
     * member's — see the note on `walk_logged`.
     */
    completionRate: totalOffered === 0 ? null : Number((totalCompleted / totalOffered).toFixed(2)),
    streak,
    daysMovedInWindow: daysMoved,
    mix: [...mix.entries()]
      .map(([category, completed]) => ({ category, completed }))
      .sort((a, b) => b.completed - a.completed),
    foodChecks,
    heldWithReasons: [...heldReasons.entries()]
      .map(([detail, count]) => ({ detail, count }))
      .sort((a, b) => b.count - a.count),
    readings: readingsFrom(series, mix, foodChecks, totalOffered, totalCompleted, totalWalks),
    totalActs: inWindow.length,
    heatmap: heatmapFrom(inWindow),
    today: inWindow
      .filter((r) => r.onDay === today)
      .map((r) => ({ hour: new Date(r.at).getHours(), kind: r.kind })),
    weights: inWindow
      .filter((r) => r.kind === 'body_read' && typeof r.value === 'number')
      .map((r) => ({ day: r.onDay, kg: r.value as number })),
    meals: inWindow
      .filter((r) => r.kind === 'food_checked' && typeof r.value === 'number')
      .map((r) => ({ day: r.onDay, kcal: r.value as number })),
  };
}

/**
 * When movement actually happens: seven weekdays by six four-hour blocks.
 * The pattern is the useful part — it names the block where a Snap is
 * most likely to land, and the one that never gets used.
 */
export function heatmapFrom(rows: ActivityRow[]): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => 0));
  for (const row of rows) {
    // Both kinds of movement, because the question this grid answers is
    // "when do you actually move?" — and a walk is an answer to it.
    if (row.kind !== 'snap_completed' && row.kind !== 'walk_logged') continue;
    const when = new Date(row.at);
    // Monday-first, which is how a week is read in the UK.
    const weekday = (when.getDay() + 6) % 7;
    const block = Math.min(5, Math.floor(when.getHours() / 4));
    grid[weekday]![block]! += 1;
  }
  return grid;
}

/**
 * Six readings rather than one score, because a single number invites the
 * comparison this product refuses to make. A reading is null until there
 * is enough of the member's own history to mean anything.
 */
function readingsFrom(
  series: DayPoint[],
  mix: Map<string, number>,
  foodChecks: number,
  offered: number,
  completed: number,
  walks: number,
): Reading[] {
  const daysMoved = series.filter(moved).length;
  const window = series.length;
  const hasAny = completed > 0 || walks > 0 || foodChecks > 0;

  /*
   * Walks are in the denominator of the strength reading but never in its
   * numerator, and that is the whole point of the reading. A fortnight of
   * nothing but walking genuinely has a low strength share — walking does
   * not protect strength or balance, which is exactly what the falls
   * evidence says. Leaving walks out of the denominator would let somebody
   * walk every day and keep a flattering strength figure earned by two
   * Snaps a fortnight ago.
   */
  const strengthish = (mix.get('strength') ?? 0) + (mix.get('balance') ?? 0);
  const movementActs = completed + walks;
  const half = Math.floor(window / 2);
  const firstHalf = series.slice(0, half).filter(moved).length;
  const secondHalf = series.slice(half).filter(moved).length;

  return [
    {
      key: 'move',
      label: 'Move',
      value: hasAny ? pct(daysMoved / window) : null,
      says: `Movement on ${daysMoved} of the last ${window} days.`,
    },
    {
      key: 'consistency',
      label: 'Consistency',
      value: daysMoved >= 2 ? pct(daysMoved / window) : null,
      says:
        daysMoved >= 2
          ? 'How evenly your days carry movement, not how hard any one of them was.'
          : 'Two days of movement and this reading starts.',
    },
    {
      key: 'strength',
      label: 'Strength',
      value: movementActs > 0 ? pct(strengthish / Math.max(1, movementActs)) : null,
      says:
        walks > 0
          ? 'The share of your movement that protects strength and balance. Walking is good for a great deal and does almost nothing for this one, so it counts here as movement without lifting the figure.'
          : 'The share of your movement that protects strength and balance.',
    },
    {
      key: 'food',
      label: 'Food',
      value: foodChecks > 0 ? pct(Math.min(1, foodChecks / window)) : null,
      says:
        foodChecks > 0
          ? `${foodChecks} meal${foodChecks === 1 ? '' : 's'} looked at in this window.`
          : 'Photograph a meal and this reading begins.',
    },
    {
      key: 'response',
      label: 'Response',
      value: offered > 0 ? pct(completed / offered) : null,
      says:
        offered > 0
          ? 'How often a Snap you were offered actually happened.'
          : 'Ask for a Snap and this reading begins.',
    },
    {
      key: 'progress',
      label: 'Progress',
      value: window >= 4 && daysMoved > 0 ? pct(0.5 + (secondHalf - firstHalf) / (2 * Math.max(1, half))) : null,
      says: 'This half of the window against your own first half. Nobody else is in this number.',
    },
  ];
}
