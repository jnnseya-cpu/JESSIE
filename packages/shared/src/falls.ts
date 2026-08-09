/**
 * Strength, balance, and not falling over.
 *
 * Falls and fractures cost the NHS around two billion pounds a year across
 * four million bed days, and the guidance on what prevents them has been
 * settled for two decades: progressive, balance-challenging exercise, three
 * times a week, kept up. The failure is not clinical. It is that community
 * programmes are hard to reach, harder to stay with, and stop the moment
 * the twelve-week block ends.
 *
 * That is a software problem, and it is the one thing on this platform
 * where the population most likely to benefit is the one least served by
 * everything else in the category.
 *
 * WHAT THIS IS, AND FIRMLY IS NOT.
 *
 * The self-checks below are the public-domain functional measures used in
 * falls services — the 30-second chair stand, the four-stage balance test,
 * and the timed up-and-go. They are reproduced as somebody would perform
 * them at home. Two consequences follow and both are absolute:
 *
 *  * **This does not assess falls risk.** A clinical assessment includes
 *    medication review, blood pressure lying and standing, vision, feet,
 *    cognition and the home itself. Four of those five are invisible here.
 *    What this produces is a *starting level for exercise* and a prompt to
 *    ask for a proper assessment — never a risk score, because a reassuring
 *    score is the one output that could actually cause a fall.
 *  * **Anybody who has already fallen goes to a person.** A fall in the
 *    last twelve months is the single strongest predictor of the next one,
 *    and it is a referral, not a programme. The platform says so and keeps
 *    saying so.
 */

/* ------------------------------------------------------------------ *
 * The self-checks
 * ------------------------------------------------------------------ */

export type CheckId = 'chair_stand' | 'balance_stages' | 'up_and_go';

export interface FunctionalCheck {
  readonly id: CheckId;
  readonly name: string;
  /** How to do it, written for somebody alone at home. */
  readonly how: readonly string[];
  /** What must be in place before starting. Not optional. */
  readonly safety: readonly string[];
  readonly unit: 'repetitions' | 'seconds';
}

export const FUNCTIONAL_CHECKS: Readonly<Record<CheckId, FunctionalCheck>> = {
  chair_stand: {
    id: 'chair_stand',
    name: 'Thirty-second chair stand',
    unit: 'repetitions',
    how: [
      'Use a dining chair with a straight back and no arms, against a wall so it cannot slide.',
      'Sit in the middle, feet flat, arms crossed over your chest.',
      'Stand up fully and sit down again as many times as you comfortably can in thirty seconds.',
      'Count a stand as complete only when your legs are straight. Stop the moment anything hurts.',
    ],
    safety: [
      'Have somebody in the house, or a phone within reach.',
      'If you need your hands to stand up, that is your answer — record nothing and start at the seated level.',
    ],
  },
  balance_stages: {
    id: 'balance_stages',
    name: 'Four-stage balance',
    unit: 'seconds',
    how: [
      'Stand next to a worktop or a sturdy chair you can grab, and work through four positions.',
      'Feet side by side. Then the instep of one foot touching the big toe of the other. Then one foot fully in front of the other, heel to toe. Then on one leg.',
      'Hold each for ten seconds before moving on. Record the total seconds you managed across all four.',
      'Stop at the first position you cannot hold. That is the honest number.',
    ],
    safety: [
      'Within arm’s reach of something solid, every time. Not a chair on castors.',
      'No shoes with a raised heel, and nothing on the floor.',
    ],
  },
  up_and_go: {
    id: 'up_and_go',
    name: 'Timed up and go',
    unit: 'seconds',
    how: [
      'Put a marker on the floor three metres from a chair — about four big paces.',
      'Sit, then on "go" stand, walk to the marker at your normal pace, turn, walk back, and sit down.',
      'Time the whole thing. Use your usual walking aid if you have one, and say that you did.',
    ],
    safety: [
      'A clear floor, no rugs, and somebody nearby the first time.',
      'Normal pace. This is not a race and hurrying is how people fall doing it.',
    ],
  },
};

export const CHECK_IDS = Object.keys(FUNCTIONAL_CHECKS) as CheckId[];

/* ------------------------------------------------------------------ *
 * Starting level
 * ------------------------------------------------------------------ */

export type StartingLevel = 'seated' | 'supported' | 'standing' | 'challenging';

export interface LevelDefinition {
  readonly level: StartingLevel;
  readonly label: string;
  readonly what: string;
  /** Sessions a week the guidance asks for at this level. */
  readonly sessionsPerWeek: number;
}

export const LEVELS: Readonly<Record<StartingLevel, LevelDefinition>> = {
  seated: {
    level: 'seated',
    label: 'Seated to begin',
    what: 'Everything from a chair, building the strength that standing needs before asking for it.',
    sessionsPerWeek: 3,
  },
  supported: {
    level: 'supported',
    label: 'Standing, holding on',
    what: 'Standing work with a worktop or a chair back in reach the whole time.',
    sessionsPerWeek: 3,
  },
  standing: {
    level: 'standing',
    label: 'Standing, one hand',
    what: 'Balance work with a fingertip on something, progressing to nothing.',
    sessionsPerWeek: 3,
  },
  challenging: {
    level: 'challenging',
    label: 'Genuinely challenging',
    what: 'Narrow stance, heel-to-toe and single-leg work, plus loaded strength. The level that actually changes falls risk.',
    sessionsPerWeek: 3,
  },
};

/** Below these, the published cut-points say start lower and get seen. */
export const CONCERN_THRESHOLDS = {
  /** Under this many stands in thirty seconds, for age 65+. */
  chairStandReps: 12,
  /** Under this many seconds held across the four positions. */
  balanceSeconds: 30,
  /** Over this many seconds on the timed up and go. */
  upAndGoSeconds: 12,
} as const;

export interface CheckResults {
  readonly chairStandReps?: number | null;
  readonly balanceSeconds?: number | null;
  readonly upAndGoSeconds?: number | null;
  /** Whether they have fallen in the last twelve months. */
  readonly fallenInLastYear?: boolean;
  /** Whether they are afraid of falling — an independent predictor. */
  readonly afraidOfFalling?: boolean;
}

export interface StartingPoint {
  readonly level: StartingLevel;
  readonly sessionsPerWeek: number;
  readonly says: string;
  /** Reasons to see somebody. Never empty when there is a real one. */
  readonly seeSomeone: readonly string[];
  /** True when a clinical assessment matters more than the programme. */
  readonly referFirst: boolean;
  readonly notARiskScore: string;
}

export const NOT_A_RISK_SCORE =
  'This is a starting level for exercise, not an assessment of your risk of falling. A real ' +
  'assessment looks at your medication, your blood pressure standing and lying, your eyes, your ' +
  'feet and your home — none of which this platform can see. A good result here does not mean ' +
  'you are safe, and it is not a reason to skip an assessment anybody has offered you.';

/**
 * Where to start, from whatever was recorded.
 *
 * Deliberately conservative in both directions. Missing checks start
 * seated rather than assuming capability, and a single poor result lowers
 * the level rather than being averaged away by two good ones — the whole
 * point of a starting level is that starting too high is the failure mode
 * with a consequence.
 */
export function startingPoint(results: CheckResults): StartingPoint {
  const seeSomeone: string[] = [];

  if (results.fallenInLastYear) {
    seeSomeone.push(
      'You have had a fall in the last year. That is the strongest single predictor of another one, and it is a reason to ask your GP for a falls assessment rather than to start a programme on your own. Ask by name — it is a specific service.',
    );
  }
  if (results.afraidOfFalling) {
    seeSomeone.push(
      'Being afraid of falling is itself linked to falling, because people move less and lose the strength that would have caught them. Worth saying out loud to your GP; it is treatable and it is not fussing.',
    );
  }

  const chair = results.chairStandReps ?? null;
  const balance = results.balanceSeconds ?? null;
  const upAndGo = results.upAndGoSeconds ?? null;

  if (chair !== null && chair < CONCERN_THRESHOLDS.chairStandReps) {
    seeSomeone.push(
      `${chair} stands in thirty seconds is below the figure falls services use as a prompt to look further. It is a reason to mention it, not a reason to stop moving.`,
    );
  }
  if (upAndGo !== null && upAndGo > CONCERN_THRESHOLDS.upAndGoSeconds) {
    seeSomeone.push(
      `${upAndGo} seconds on the timed up and go is above the point at which services usually take a closer look. Worth mentioning at your next appointment.`,
    );
  }

  // Nothing recorded: start from a chair. Assuming capability is the one
  // mistake here with a fracture at the end of it.
  if (chair === null && balance === null && upAndGo === null) {
    return {
      level: 'seated',
      sessionsPerWeek: LEVELS.seated.sessionsPerWeek,
      says: 'Nothing recorded yet, so this starts from a chair. Do the three checks when you can and it will move to where you actually are — starting too low costs a fortnight, starting too high costs more than that.',
      seeSomeone,
      referFirst: seeSomeone.length > 0,
      notARiskScore: NOT_A_RISK_SCORE,
    };
  }

  // The lowest signal wins. Strength and balance fail independently, and
  // an average would put somebody with good legs and poor balance into
  // standing work that their balance cannot hold.
  let level: StartingLevel = 'challenging';
  const lower = (to: StartingLevel): void => {
    const order: StartingLevel[] = ['seated', 'supported', 'standing', 'challenging'];
    if (order.indexOf(to) < order.indexOf(level)) level = to;
  };

  if (chair !== null) {
    if (chair < 8) lower('seated');
    else if (chair < 12) lower('supported');
    else if (chair < 15) lower('standing');
  }
  if (balance !== null) {
    if (balance < 10) lower('seated');
    else if (balance < 20) lower('supported');
    else if (balance < 30) lower('standing');
  }
  if (upAndGo !== null) {
    if (upAndGo > 20) lower('seated');
    else if (upAndGo > 13.5) lower('supported');
    else if (upAndGo > 12) lower('standing');
  }

  const definition = LEVELS[level];
  return {
    level,
    sessionsPerWeek: definition.sessionsPerWeek,
    says:
      `${definition.label}. ${definition.what} Three sessions a week is what the evidence rests on — ` +
      'twice is better than nothing and does noticeably less.',
    seeSomeone,
    referFirst: Boolean(results.fallenInLastYear),
    notARiskScore: NOT_A_RISK_SCORE,
  };
}

/* ------------------------------------------------------------------ *
 * Progression
 * ------------------------------------------------------------------ */

/**
 * Weeks between re-checks.
 *
 * Twelve, because that is where the trial evidence sits and because a
 * measure repeated monthly mostly records how somebody slept. Long enough
 * for a real change, short enough that a wrong starting level is caught.
 */
export const RECHECK_WEEKS = 12;

export interface Progress {
  readonly moved: 'up' | 'held' | 'down';
  readonly says: string;
  readonly nextLevel: StartingLevel;
}

/**
 * What changed between two checks, said without congratulation or alarm.
 *
 * A programme that only celebrates improvement teaches people to stop
 * recording when it stops improving, which is exactly when the record
 * matters most.
 */
export function progressBetween(
  before: CheckResults,
  after: CheckResults,
  weeksBetween: number,
): Progress {
  const startBefore = startingPoint(before);
  const startAfter = startingPoint(after);
  const order: StartingLevel[] = ['seated', 'supported', 'standing', 'challenging'];
  const delta = order.indexOf(startAfter.level) - order.indexOf(startBefore.level);

  const chairDelta =
    before.chairStandReps != null && after.chairStandReps != null
      ? after.chairStandReps - before.chairStandReps
      : null;

  if (delta > 0) {
    return {
      moved: 'up',
      nextLevel: startAfter.level,
      says:
        `${weeksBetween} weeks on and the level has moved to ${LEVELS[startAfter.level].label.toLowerCase()}` +
        (chairDelta != null ? `, with ${chairDelta > 0 ? `${chairDelta} more` : 'the same'} chair stands.` : '.') +
        ' Keep going at three a week — this is the part that stops when people feel better.',
    };
  }
  if (delta < 0) {
    return {
      moved: 'down',
      nextLevel: startAfter.level,
      says:
        'The checks have come down since last time. That happens after an illness, a hospital stay or a change of medication, and it is worth mentioning to your GP rather than pushing through. The level has dropped to match, which is the right response, not a setback.',
    };
  }
  return {
    moved: 'held',
    nextLevel: startAfter.level,
    says:
      `${weeksBetween} weeks on and the checks are about where they were. At this age holding steady is a result — the untrained direction is downwards, so level means the work is doing its job.`,
  };
}
