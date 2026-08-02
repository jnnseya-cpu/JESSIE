/**
 * Two reporting rules over one membership list.
 *
 * A household is people who know each other: names, participation, the
 * streak a grandparent and a grandchild share. An organisation is the
 * opposite promise — an employer buys outcomes, not visibility — so the
 * individual view is not permission-gated here, it is never constructed.
 * `organisationReport` takes the same rows and cannot return a person.
 */

export const K_ANONYMITY_FLOOR = 8;

export interface MemberStat {
  userId: string;
  displayName: string;
  /** Distinct days with a completed movement in the window. */
  daysMoved: number;
  /** Whether this member is under 18 — changes what a household may show. */
  minor: boolean;
}

export interface HouseholdReport {
  kind: 'household';
  size: number;
  people: { displayName: string; daysMoved: number; minor: boolean }[];
  /** Days where every member moved — the thing a family plays for. */
  sharedDays: number;
  note: string;
}

export interface OrganisationReport {
  kind: 'organisation';
  size: number;
  suppressed: boolean;
  /** Null whenever the cohort is below the floor. Never a rounded stand-in. */
  participationPct: number | null;
  activeMembers: number | null;
  medianDaysMoved: number | null;
  floor: number;
  note: string;
}

export function householdReport(members: MemberStat[], sharedDays: number): HouseholdReport {
  return {
    kind: 'household',
    size: members.length,
    // A household sees participation and safety. It never sees a child's
    // private check-ins or their conversation with the coach, so days
    // moved is the most that is ever shown, for anybody.
    people: members.map((m) => ({
      displayName: m.displayName,
      daysMoved: m.daysMoved,
      minor: m.minor,
    })),
    sharedDays,
    note: 'A household sees participation, not private check-ins or coach conversations.',
  };
}

/**
 * The employer view. Below the floor there is no cohort to report, and
 * the honest answer is suppression rather than a blurred number — a
 * rounded figure over three people still describes those three people.
 */
export function organisationReport(members: MemberStat[]): OrganisationReport {
  const size = members.length;
  if (size < K_ANONYMITY_FLOOR) {
    return {
      kind: 'organisation',
      size,
      suppressed: true,
      participationPct: null,
      activeMembers: null,
      medianDaysMoved: null,
      floor: K_ANONYMITY_FLOOR,
      note: `Below ${K_ANONYMITY_FLOOR} people this reports nothing at all. A rounded figure over a handful of people still describes those people.`,
    };
  }

  const active = members.filter((m) => m.daysMoved > 0).length;
  const sorted = [...members].map((m) => m.daysMoved).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

  return {
    kind: 'organisation',
    size,
    suppressed: false,
    participationPct: Math.round((active / size) * 100),
    activeMembers: active,
    medianDaysMoved: Number(median.toFixed(1)),
    floor: K_ANONYMITY_FLOOR,
    note: 'Aggregate only. No individual view exists in this response, under any role.',
  };
}

/** Days on which every member of a household moved. */
export function sharedDaysFrom(daysByUser: Map<string, Set<string>>, size: number): number {
  if (size === 0) return 0;
  const counts = new Map<string, number>();
  for (const days of daysByUser.values()) {
    for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.values()].filter((c) => c === size).length;
}
