import { GAME_WORLDS, GRACE_TOKENS_PER_MONTH, POINTS_NEVER, movedOnDay } from '@jessmove/shared';
import type { ActivityRow, DayPoint } from './activity.logic';

/**
 * Points, levels and worlds.
 *
 * The charter names what may earn points — starting, completing,
 * returning after a lapse, supporting a teammate, trying a new category,
 * consistency, completing an accessible alternative, moving in a
 * previously inactive period — and what may never: calories, weight,
 * appearance, maximum intensity, biometric comparison.
 *
 * Every rule below is one of the permitted eight. Nothing here reads a
 * body measurement, an intensity or a calorie, and a test asserts that
 * the reasons this file can produce are drawn only from the permitted
 * list. Duration is not a multiplier either: a two-minute Snap and a
 * five-minute Snap both count as showing up, because rewarding volume
 * is how a platform teaches people to overreach.
 */

export const POINTS = {
  started: 5,
  completed: 20,
  returnedAfterLapse: 30,
  newCategory: 15,
  consistencyDay: 10,
  previouslyInactivePeriod: 15,
  supportedTeammate: 10,
} as const;

/** A level takes a little more each time, and never resets downwards. */
export const LEVEL_STEP = 250;

export interface Award {
  reason: string;
  points: number;
}

export interface Rewards {
  movePoints: number;
  energyCrystals: number;
  levelStars: number;
  pointsIntoLevel: number;
  pointsForNextLevel: number;
  streakShields: number;
  world: string;
  worldProgress: number;
  awards: Award[];
  neverCounts: typeof POINTS_NEVER;
}

/** The two rows that represent movement having actually happened. */
function isMovement(row: ActivityRow): boolean {
  return row.kind === 'snap_completed' || row.kind === 'walk_logged';
}

/** The world is chosen by the member's own history, not by a purchase. */
export function worldFor(userId: string, level: number): string {
  // Stable per person so it does not change under them, and it moves on
  // as they level: a new world is the reward for the level, not a menu.
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const index = (hash + Math.max(0, level - 1)) % GAME_WORLDS.length;
  return GAME_WORLDS[index]!;
}

export function computeRewards(
  rows: ActivityRow[],
  series: DayPoint[],
  userId: string,
  streak: number,
): Rewards {
  const awards: Award[] = [];
  const add = (reason: string, points: number) => {
    const existing = awards.find((a) => a.reason === reason);
    if (existing) existing.points += points;
    else awards.push({ reason, points });
  };

  const snaps = rows.filter((r) => r.kind === 'snap_completed');
  const offers = rows.filter((r) => r.kind === 'snap_offered');

  /*
   * A logged walk earns like any other completion, with one difference
   * that matters: only the first walk of a day earns.
   *
   * A Snap completion is issued by the engine, so its count is bounded by
   * how often the engine chose to speak. A walk is entered by the member,
   * so nothing bounds it but a text field — and a reward that scales with
   * a self-reported count is a reward for typing. Taking one per day keeps
   * this consistent with the rule the rest of the file already follows:
   * five sessions in one day cannot out-earn five days of one.
   */
  const walkDays = new Set(rows.filter((r) => r.kind === 'walk_logged').map((r) => r.onDay));
  const completions = [...snaps, ...rows.filter((r) => r.kind === 'walk_logged')];

  if (offers.length > 0) add('starting', offers.length * POINTS.started);
  const earning = snaps.length + walkDays.size;
  if (earning > 0) add('completing', earning * POINTS.completed);

  // Trying a new movement category — counted once per distinct category.
  const categories = new Set(completions.map((c) => c.category ?? 'movement'));
  if (categories.size > 1) {
    add('trying a new movement category', (categories.size - 1) * POINTS.newCategory);
  }

  // Consistency: every day carrying movement, which is why five sessions
  // in one day cannot out-earn five days of one.
  const activeDays = series.filter(movedOnDay).length;
  if (activeDays > 0) add('consistency', activeDays * POINTS.consistencyDay);

  // Returning after a lapse — the gap is rewarded, never punished.
  let lapsed = false;
  let returns = 0;
  for (const day of series) {
    if (!movedOnDay(day)) lapsed = true;
    else if (lapsed) {
      returns += 1;
      lapsed = false;
    }
  }
  if (returns > 0) add('returning after a lapse', returns * POINTS.returnedAfterLapse);

  // Moving during a previously inactive period: an act in the second half
  // of the window on a weekday hour the member had never used before. A
  // walk taken at seven in the morning by somebody who has only ever moved
  // in the evening is exactly the behaviour this award exists to notice,
  // so walks count towards it alongside Snaps.
  const half = Math.floor(series.length / 2);
  const earlyHours = new Set(
    rows
      .filter((r) => isMovement(r) && r.onDay < (series[half]?.day ?? ''))
      .map((r) => new Date(r.at).getUTCHours()),
  );
  const newHours = new Set(
    rows
      .filter((r) => isMovement(r) && r.onDay >= (series[half]?.day ?? ''))
      .map((r) => new Date(r.at).getUTCHours())
      .filter((h) => !earlyHours.has(h)),
  );
  if (earlyHours.size > 0 && newHours.size > 0) {
    add('moving during a previously inactive period', newHours.size * POINTS.previouslyInactivePeriod);
  }

  const movePoints = awards.reduce((a, x) => a + x.points, 0);
  const levelStars = Math.floor(movePoints / LEVEL_STEP) + (movePoints > 0 ? 1 : 0);
  const pointsIntoLevel = movePoints % LEVEL_STEP;

  return {
    movePoints,
    // Crystals are the spendable half of the same act — never bought.
    energyCrystals: Math.floor(movePoints / 10),
    levelStars,
    pointsIntoLevel,
    pointsForNextLevel: LEVEL_STEP,
    // The chain forgives: shields are granted, not earned by perfection.
    streakShields: Math.min(GRACE_TOKENS_PER_MONTH, streak >= 3 ? GRACE_TOKENS_PER_MONTH : 1),
    world: worldFor(userId, levelStars),
    worldProgress: Math.round((pointsIntoLevel / LEVEL_STEP) * 100),
    awards: awards.sort((a, b) => b.points - a.points),
    neverCounts: POINTS_NEVER,
  };
}
