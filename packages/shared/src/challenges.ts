/**
 * Team challenges.
 *
 * The whole design problem in one sentence: a leaderboard that rewards
 * capability will always be won by the fittest person in the room, and
 * everybody else will stop opening the app in week two.
 *
 * So capability is absent from the scoring function. Not weighted down —
 * absent. A ten-year-old, a wheelchair user and an eighty-eight-year-old
 * contribute on exactly the same four terms as a marathon runner, and the
 * runner has no lever the others lack.
 */

/* ============================================================
   1 — Team Score
   ============================================================ */

export const TEAM_SCORE_TERMS = [
  {
    key: 'participation',
    label: 'Participation',
    what: 'The share of the team who did anything at all this week.',
    why: 'It is the only term a large team cannot win by carrying one strong member.',
    weight: 0.35,
  },
  {
    key: 'consistency',
    label: 'Consistency',
    what: 'How evenly effort is spread across the days, per person.',
    why: 'Rewards the person who does two minutes on five days over the one who does a burst.',
    weight: 0.25,
  },
  {
    key: 'improvement',
    label: 'Improvement',
    what: 'Movement against each person’s own previous fortnight.',
    why: 'Everyone starts from where they are, so everyone has the same headroom.',
    weight: 0.25,
  },
  {
    key: 'mutualSupport',
    label: 'Mutual support',
    what: 'Encouragement given, sessions joined, teammates brought back after a lapse.',
    why: 'Makes helping somebody else the highest-leverage thing you can do.',
    weight: 0.15,
  },
] as const;

export type TeamScoreTerm = (typeof TEAM_SCORE_TERMS)[number]['key'];

export interface TeamScoreInput {
  /** All normalised 0–1. */
  readonly participation: number;
  readonly consistency: number;
  readonly improvement: number;
  readonly mutualSupport: number;
}

export class CapabilityInScoringError extends Error {
  constructor(field: string) {
    super(
      `"${field}" is a capability measure and cannot enter a team score. ` +
        `Capability is absent by design — see challenges.ts.`,
    );
    this.name = 'CapabilityInScoringError';
  }
}

/** Anything resembling raw output. Rejected at the boundary. */
export const CAPABILITY_FIELDS = [
  'steps',
  'distance',
  'pace',
  'speed',
  'vo2max',
  'calories',
  'kcal',
  'weight',
  'bmi',
  'heartRate',
  'watts',
  'reps',
  'load',
  'personalBest',
] as const;

export function assertNoCapability(input: Record<string, unknown>): void {
  for (const key of Object.keys(input)) {
    const flat = key.toLowerCase();
    if (CAPABILITY_FIELDS.some((c) => flat.includes(c.toLowerCase()))) {
      throw new CapabilityInScoringError(key);
    }
  }
}

export function teamScore(input: TeamScoreInput): number {
  assertNoCapability(input as unknown as Record<string, unknown>);
  for (const [k, v] of Object.entries(input)) {
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new RangeError(`${k} must be normalised to 0–1`);
    }
  }
  const total = TEAM_SCORE_TERMS.reduce(
    (acc, t) => acc + input[t.key as keyof TeamScoreInput] * t.weight,
    0,
  );
  return Number((total * 100).toFixed(1));
}

/* ============================================================
   2 — Contribution
   ============================================================ */

/**
 * What one person adds to their team. The cap is the point: no individual
 * may contribute more than `CONTRIBUTION_CEILING` of a team's total, so a
 * single extraordinary member cannot carry — or dominate — a team.
 */
export const CONTRIBUTION_CEILING = 0.18;

export interface Contributor {
  readonly id: string;
  /** 0–1 on each term. Capability does not appear. */
  readonly participated: boolean;
  readonly daysActive: number;
  readonly daysPossible: number;
  readonly improvementVsOwnBaseline: number;
  readonly supportActs: number;
}

export function contribution(
  person: Contributor,
  teamSize: number,
): { share: number; capped: boolean } {
  if (teamSize <= 0) throw new RangeError('a team needs at least one person');
  const consistency = person.daysPossible > 0 ? person.daysActive / person.daysPossible : 0;
  const support = Math.min(1, person.supportActs / 5);
  const improvement = Math.max(0, Math.min(1, person.improvementVsOwnBaseline));
  const raw =
    ((person.participated ? 1 : 0) * 0.35 +
      consistency * 0.25 +
      improvement * 0.25 +
      support * 0.15) /
    teamSize;
  const ceiling = CONTRIBUTION_CEILING;
  return { share: Number(Math.min(raw, ceiling).toFixed(4)), capped: raw > ceiling };
}

/* ============================================================
   3 — Fairness
   ============================================================ */

/**
 * Whether a challenge is winnable by a team that contains nobody
 * exceptional. If a simulated all-median team cannot reach the target,
 * the challenge is not shipped.
 */
export function isWinnableByMedianTeam(
  target: number,
  medianPerPersonScore: number,
  teamSize: number,
): { winnable: boolean; medianTeamReaches: number } {
  const reaches = Number((medianPerPersonScore * teamSize).toFixed(1));
  return { winnable: reaches >= target, medianTeamReaches: reaches };
}

/** Leaderboard rules. §13.6 of the Charter, restated for teams. */
export const LEADERBOARD_RULES = [
  'Nobody is ever shown their position from the bottom.',
  'Below-median positions are not rendered at all, for anyone.',
  'A team’s standing is visible; an individual’s ranking within it is not.',
  'No leaderboard may be built on weight, body composition or appearance.',
  'No open leaderboard exists in Explorer or Teen Mode.',
  'Leaving a challenge is one tap and costs nothing.',
] as const;

/* ============================================================
   4 — Challenge library
   ============================================================ */

export interface ChallengeTemplate {
  readonly key: string;
  readonly name: string;
  readonly forWhom: string;
  readonly runs: string;
  readonly winCondition: string;
}

export const CHALLENGE_TEMPLATES: readonly ChallengeTemplate[] = [
  {
    key: 'meeting_breakers',
    name: 'Meeting Breakers',
    forWhom: 'Workplaces with a back-to-back culture',
    runs: '4 weeks',
    winCondition: 'The department that interrupts the most long sitting blocks, per head.',
  },
  {
    key: 'lunchtime_lift',
    name: 'Lunchtime Lift',
    forWhom: 'Any team, any size',
    runs: '2 weeks',
    winCondition: 'Share of the team who move between 12:00 and 14:00 on any given day.',
  },
  {
    key: 'class_quest',
    name: 'School Class Quest',
    forWhom: 'A class, with the teacher triggering breaks',
    runs: 'A half term',
    winCondition: 'Class participation. No pupil is ever named in a ranking.',
  },
  {
    key: 'family_expedition',
    name: 'Family Weekend Expedition',
    forWhom: 'A household across up to four decades',
    runs: 'A weekend',
    winCondition: 'Every profile contributing at least once. Nobody can finish it alone.',
  },
  {
    key: 'care_garden',
    name: 'Care Home Garden Journey',
    forWhom: 'Residents and carers together',
    runs: '6 weeks',
    winCondition: 'Sessions completed, seated and standing counted identically.',
  },
  {
    key: 'city_league',
    name: 'UK City Movement League',
    forWhom: 'Councils and public-health programmes',
    runs: 'A season',
    winCondition: 'Participation rate by city, above the k-anonymity floor.',
  },
  {
    key: 'charity_month',
    name: 'Charity Movement Month',
    forWhom: 'Anyone; a sponsor converts participation to a donation',
    runs: '1 month',
    winCondition: 'Collective participation. There is no losing team.',
  },
  {
    key: 'return_run',
    name: 'The Return',
    forWhom: 'Teams with people who lapsed',
    runs: '2 weeks',
    winCondition: 'Teammates brought back. Only mutual support scores.',
  },
];

/* ============================================================
   5 — Protection
   ============================================================ */

/**
 * Competition is opt-in, and it can be left without penalty at any point.
 * These are the states in which the engine removes someone from
 * competitive mechanics without being asked.
 */
export const AUTO_WITHDRAW_TRIGGERS = [
  'a reported flare-up or illness',
  'a bereavement hold',
  'a new caring responsibility',
  'three consecutive days of declining every prompt',
  'a safety escalation of any kind',
  'a self-reported low-energy period',
] as const;

/**
 * What happens to a person's team when they withdraw: nothing. Their
 * absence cannot lower a team's score, because participation is measured
 * against active members rather than the roster.
 */
export const WITHDRAWAL_COST_TO_TEAM = 0;
