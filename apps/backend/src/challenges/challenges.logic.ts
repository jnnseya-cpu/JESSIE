import {
  CHALLENGE_TEMPLATES,
  CONTRIBUTION_CEILING,
  LEADERBOARD_RULES,
  TEAM_SCORE_TERMS,
  contribution,
  type Contributor,
} from '@jessmove/shared';

/**
 * Turning a log of "who turned up" into a team score.
 *
 * Every rule that matters already lives in the shared module: capability
 * is absent from the maths, nobody may exceed the contribution ceiling,
 * and an individual's standing within the team is never rendered. This
 * file only assembles the inputs and refuses to expose anything the
 * leaderboard rules forbid.
 */

export interface MemberActivity {
  userId: string;
  displayName: string;
  /** Distinct dates with a 'moved' act. */
  daysActive: number;
  /** Distinct dates in the earlier half of the run — the person's own baseline. */
  baselineDaysActive: number;
  supportActs: number;
}

export interface TeamProgress {
  teamSize: number;
  /** Share of the team who have done anything at all. 0–1. */
  participation: number;
  /** 0–100. The team's standing, never a person's. */
  teamScore: number;
  daysElapsed: number;
  daysTotal: number;
  /** Names only. No number is ever attached to a person. */
  whoTookPart: string[];
  /** True when someone hit the ceiling — the team needs breadth, not a hero. */
  someoneCapped: boolean;
  terms: typeof TEAM_SCORE_TERMS;
  rules: typeof LEADERBOARD_RULES;
  ceiling: number;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function computeProgress(
  members: MemberActivity[],
  startsOn: string,
  endsOn: string,
  today: string,
): TeamProgress {
  const daysTotal = Math.max(1, daysBetween(startsOn, endsOn) + 1);
  const daysElapsed = Math.max(1, Math.min(daysTotal, daysBetween(startsOn, today) + 1));
  const teamSize = Math.max(1, members.length);

  let total = 0;
  let someoneCapped = false;
  const whoTookPart: string[] = [];

  // The baseline is the first half of the run, so improvement is always
  // measured against the person's own earlier self and never a teammate.
  const baselineDays = Math.max(1, Math.floor(daysElapsed / 2));
  const recentDays = Math.max(1, daysElapsed - baselineDays);

  for (const member of members) {
    const recentActive = Math.max(0, member.daysActive - member.baselineDaysActive);
    const recentRate = recentActive / recentDays;
    const baselineRate = member.baselineDaysActive / baselineDays;
    // Nobody is punished for a strong start: improvement floors at zero.
    const improvement = Math.max(0, Math.min(1, recentRate - baselineRate + 0.5));

    const person: Contributor = {
      id: member.userId,
      participated: member.daysActive > 0,
      daysActive: member.daysActive,
      daysPossible: daysElapsed,
      improvementVsOwnBaseline: member.daysActive > 0 ? improvement : 0,
      supportActs: member.supportActs,
    };

    const { share, capped } = contribution(person, teamSize);
    total += share;
    if (capped) someoneCapped = true;
    if (person.participated) whoTookPart.push(member.displayName);
  }

  // A team of any size can reach 1.0 only by everyone taking part, which
  // is the point: the ceiling makes breadth the only route to a high score.
  const teamScore = Math.round(Math.min(1, total) * 100);
  const participation =
    members.length === 0 ? 0 : Number((whoTookPart.length / members.length).toFixed(2));

  return {
    teamSize: members.length,
    participation,
    teamScore,
    daysElapsed,
    daysTotal,
    whoTookPart,
    someoneCapped,
    terms: TEAM_SCORE_TERMS,
    rules: LEADERBOARD_RULES,
    ceiling: CONTRIBUTION_CEILING,
  };
}

/** Unambiguous characters only — this gets read aloud across a kitchen. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeJoinCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function templateByKey(key: string) {
  return CHALLENGE_TEMPLATES.find((t) => t.key === key) ?? null;
}

/** How long each template runs, in days. Parsed from its own description. */
export function runLengthDays(runs: string): number {
  const weeks = /(\d+)\s*week/i.exec(runs);
  if (weeks) return Number(weeks[1]) * 7;
  if (/weekend/i.test(runs)) return 3;
  if (/half term/i.test(runs)) return 42;
  if (/season/i.test(runs)) return 90;
  if (/month/i.test(runs)) return 30;
  return 14;
}
