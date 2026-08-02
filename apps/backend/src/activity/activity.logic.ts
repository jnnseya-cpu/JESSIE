/**
 * Turning a log of acts into the readings the platform promises.
 *
 * Every number here is derived from something the member actually did.
 * Where there is not enough history to say something true, the reading
 * is null and the surface says so — an invented trend line is exactly
 * the failure this product refuses everywhere else.
 */

export type ActivityKind =
  | 'snap_offered'
  | 'snap_completed'
  | 'snap_held'
  | 'food_checked'
  | 'body_read';

export interface ActivityRow {
  kind: ActivityKind;
  category: string | null;
  seconds: number;
  onDay: string;
  at: string;
  detail: string;
}

export interface DayPoint {
  day: string;
  offered: number;
  completed: number;
  held: number;
  seconds: number;
}

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
  /** Completed ÷ offered across the window, or null before anything was offered. */
  completionRate: number | null;
  /** Consecutive days ending today with at least one completion. */
  streak: number;
  daysMovedInWindow: number;
  mix: { category: string; completed: number }[];
  foodChecks: number;
  heldWithReasons: { detail: string; count: number }[];
  readings: Reading[];
  totalActs: number;
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
    days.map((day) => [day, { day, offered: 0, completed: 0, held: 0, seconds: 0 }]),
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
    if (row.kind === 'food_checked') foodChecks += 1;
  }

  const series = days.map((d) => byDay.get(d)!);
  const totalOffered = series.reduce((a, p) => a + p.offered, 0);
  const totalCompleted = series.reduce((a, p) => a + p.completed, 0);
  const daysMoved = series.filter((p) => p.completed > 0).length;

  // A streak counts back from today and forgives nothing silently: the
  // shield mechanic is a separate, explicit act, not a hidden fudge here.
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i]!.completed > 0) streak += 1;
    else break;
  }

  const todayPoint = series[series.length - 1]!;

  return {
    days: series,
    todaySeconds: todayPoint.seconds,
    todayCompleted: todayPoint.completed,
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
    readings: readingsFrom(series, mix, foodChecks, totalOffered, totalCompleted),
    totalActs: inWindow.length,
  };
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
): Reading[] {
  const daysMoved = series.filter((p) => p.completed > 0).length;
  const window = series.length;
  const hasAny = completed > 0 || foodChecks > 0;

  const strengthish = (mix.get('strength') ?? 0) + (mix.get('balance') ?? 0);
  const half = Math.floor(window / 2);
  const firstHalf = series.slice(0, half).filter((p) => p.completed > 0).length;
  const secondHalf = series.slice(half).filter((p) => p.completed > 0).length;

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
      value: completed > 0 ? pct(strengthish / Math.max(1, completed)) : null,
      says: 'The share of your movement that protects strength and balance.',
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
